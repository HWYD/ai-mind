# Quickstart Validation: v0.6.1 General ReAct Agent Streaming

> 本文件是后续实现完成后的验证指南。本次文档任务不运行这些实现验证，也不把任何场景标记为已通过。

## Prerequisites

- Node.js `>=22 <23`、pnpm `10.34.0`；
- workspace dependencies 已安装；
- 需要 integration/smoke 时，按现有项目流程启动 PostgreSQL 并配置至少一个支持 streaming + Tool Calling 的 provider；
- 当前分支实现已完成 `tasks.md` 中对应阶段。

## 1. Contract and type validation

```powershell
pnpm --filter @ai-mind/stream-core test
pnpm --filter @ai-mind/stream-core typecheck
pnpm --filter @ai-mind/webapp typecheck
```

Expected:

- `agent-text-start/delta/end` strict schema 与 TypeScript union 一致；
- 旧 `text-*` 与专用 Agent fixtures 继续通过；
- illegal phase transitions、final 后 Tool、reasoning 泄漏 fixtures 被拒绝。

## 2. Runtime scripted scenarios

目标测试目录：`apps/webapp/tests/lib/ai/runtime/general-react-agent/`。

必须覆盖：

1. Tool → final text；
2. text → Tool → final text；
3. Tool → text → Tool → final text；
4. only final text；
5. parallel multi-Tool ordinal stability；
6. Tool-only/empty text turn；
7. `length/content_filter/error/cancel/deadline/unknown`；
8. abnormal finalizer eligibility 与最多一次；
9. 9/14/10+1/11/235s/270s/48k/24 全部边界；
10. raw reasoning never projected。
11. provider 前拒绝的 known ToolCall 按 `tool-start → tool-scope error` 显示为一个 failed Tool row，provider 为 0 次调用，且公开 payload 不含 raw input/URL/query/secret/source；无 ToolCall 不产生该行。
12. current user URL 自动安全 grant；同会话 raw user URL 最多 8 条、重验后可在明确重新读取时使用；assistant/summary/UserMemory/client history/compacted turn 均不得 grant，历史读取追问不得自动补读。

Expected: 普通 no-Tool 场景模型调用数为 1；N 个 Tool-bearing rounds 的 normal success 为 N+1 calls；不再存在每个成功 Run 固定 Answer call。

## 3. Stream durability and replay

```powershell
pnpm --filter @ai-mind/webapp test:stable
pnpm --filter @ai-mind/webapp test:integration
```

Expected:

- Agent text 首 delta 立即持久化，后续使用 40ms/256 chars microbatch；
- end 前 flush；commentary end sequence 早于对应 Tool start；
- disconnect 不取消 Run，replay 不重复 delta/Part；
- terminal event 最后且没有 unresolved pending；
- queue watermark/backpressure 旧测试不回归。

## 4. Frontend reducer and UI

自动测试必须断言：

- pending→commentary/final 保持同一个 React key/partId；
- `pending`、`commentary`、`final_answer` 都从第一帧起使用同一正文 Markdown，且不显示文本图标；
- 四个核心序列的可见顺序按顶层 `message.parts` ordinal 正确；已有 Tool source/owner child 容器是唯一例外；
- 每个安全 read source list 紧随其所属 `read-url` Tool，并在后续正文或 Tool 前显示；不得在 Trace 末尾统一汇总；
- 无详情 running/completed 均无箭头，完成标题仍存在；
- 有详情右/下箭头、full-row button、ARIA、keyboard 正确；
- manual collapse sticky；final auto-collapse at most once；completed 可 reopen；
- cancelled/failed 不 shimmer 且有详情默认展开；
- Tool row 始终 flat，无 nested detail。
- pre-execution rejected Tool 使用既有 flat failed Tool 样式，不出现成功 `tool-end`、source child 或 raw error/detail。

## 5. Final projection, Memory, and snapshot

必须断言：

- copy、feedback、follow-up、Chat Memory、UserMemory、next-turn history 只含 completed final_answer；
- commentary/pending/interrupted 不进入上述消费者；
- constrained/deterministic fallback 不写 Memory；
- completed commentary 可在 local snapshot 恢复，pending/failed/cancelled 不保存；
- refresh 后 Trace 默认收起，final answer 和 Part 顺序稳定；
- snapshot schema/fingerprint 升级不会误读旧 TextPart。

## 6. Full repository gates

```powershell
pnpm validate:workspace-boundaries
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

若 integration 环境不可用，交付说明必须明确未运行项和剩余风险，不得把 stable tests 代替 integration evidence。

## 7. Manual browser matrix

至少用一个 OpenAI-compatible provider、豆包和 DeepSeek 各验证可用模型形态；provider 不支持/不稳定的场景用 scripted stream 验证，不能靠 prompt 偶然输出作为唯一证据。

| Scenario                      | Expected visual result                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| only text                     | pending 立即以正文 Markdown 流式；完成后“已完成思考”无箭头；最终回答在 Trace 外，无第二次回答 |
| text + Tool                   | 早到文字以正文 Markdown 原地转 commentary；Tool 跟随；最终回答独立                            |
| Tool + text + Tool            | Trace 按 Tool → 该 Tool 的 source child → 正文 → Tool 顺序稳定，commentary 不嵌入 Tool        |
| manual collapse while running | 新事件不重新展开                                                                              |
| cancel / provider error       | stopped/incomplete title，无 shimmer，不把 partial 当 final                                   |
| refresh completed Tool run    | Trace 默认收起，可重开；copy 只含 final                                                       |
| rejected Tool before provider | 模型说明后的 Tool 行显示“未完成”；没有成功来源/已读取表述，也不泄露 URL、query 或拒绝内部原因 |
| historical read question      | 不自动补读或声称上一轮成功；用户明确要求重新读且唯一指向受信 URL 时才开始新的 read-url        |

## 8. Pencil and docs review

- `design/pencil/agent-ui.pen` 必须覆盖 pending、仅正文完成、三种 mixed sequence、cancel/fail、manual sticky、auto collapse；
- `Nested Trace Row Disclosure` 标注 Deferred；
- 长期 architecture/version/release docs 不得继续描述固定 Answer Phase；
- package lockstep version 只在正式 release closing 执行。
