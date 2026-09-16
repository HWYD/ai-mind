# Quickstart: v0.6.0 General ReAct Agent MVP Validation

## Purpose

本文件是实现完成后的可执行验收指南。下面的命令和场景对应当前分支的 Definition of Done；未执行的 external smoke 必须按验收文档记录为剩余风险。

## Prerequisites

- 从 `codex/v0.6.0-general-react-agent-mvp` 分支运行。
- 安装仓库 pnpm dependencies。
- 本地模型 provider 配置可用于 tool calling。
- Web external smoke 需要 server-only `TAVILY_API_KEY`；普通单元/集成测试必须使用测试侧 fake，不依赖真实网络。
- 不把真实 key 写入命令历史、测试 fixture、截图或日志。
- UI 实施开始前，确认 `design/pencil/agent-ui.pen` 已由 Pencil 自身保存且可通过 Pencil MCP 重新打开；实施 Agent 必须读取其中的节点、组件、状态和布局，不能只依据 `design/exports/` 下的 PNG 开发。

## 1. Repository Gates

```powershell
pnpm typecheck
pnpm --dir apps/webapp lint
pnpm --filter @ai-mind/stream-core test
pnpm --filter @ai-mind/webapp test:stable
pnpm build
git diff --check
```

Expected:

- 所有命令成功；
- 不生成意外 Prisma migration；
- `packages/stream-core` 若无 schema 变化，diff 应保持为空或仅含必要测试；
- package version 在 release closing 前仍由版本任务统一处理，不在功能 Step 提前散改。
- canonical `.pen` 缺失或 Pencil MCP 无法重新打开时，UI Step 不得开始；先在 Pencil 中恢复并验证设计原稿。

## 2. Targeted Runtime Tests

后续 tasks 应把实际测试路径落在项目规范位置；至少覆盖：

```text
apps/webapp/tests/lib/ai/runtime/general-react-agent/
apps/webapp/tests/lib/ai/tools/web/
apps/webapp/tests/app/api/chat/
apps/webapp/tests/components/
```

建议按下面顺序运行对应 targeted Vitest：

1. LangChain family compatibility 与 `createAgent` server import/build；
2. Agent state、middleware order、stop reason、budget；
3. URL policy 与 Web provider adapter contract；
4. Tool call/ToolMessage 配对、batch admission、`maxConcurrency=3` 峰值与乱序归并；
5. ChatOrchestrator routing/context/memory；
6. stream adapter、reducer 与 Agent Trace UI；
7. process admission、durable microbatch、projection backpressure、PostgreSQL pool 与浏览器 buffer；
8. 专用 Agent regression。

## 2.1 `createAgent` Compatibility Gate

迁移普通聊天前必须先用 LangChain fake/scripted model 验证：

- `createAgent({ version: 'v2' })` 可在 Next.js server runtime 构建和运行；
- invocation `maxConcurrency=3` 使三个慢 Tool 能重叠执行、第四个等待，且峰值不得超过 3；
- `afterModel` 在 v2 task 派发前一次生成 batch admission，9-call 与 32,000 observation chars budget 在并发下不穿透；
- retry 不在 batch admission 中预分配；多个 retry-safe remote execution failure 在实际 retry 前竞争同一个 `RetryPermitPool`，单 call 2 次、Run 4 次均不穿透；
- custom state reducer/`Command` 用 delta/sum/keyed-union 合并 counters、URL grants、sources 和 paired ToolMessage；完成顺序反转时 model/UI ordinal 仍稳定；
- middleware 顺序与 retry 行为符合 Plan，通用 ReAct model 和普通 Tool provider/transport hidden retry 为 0，普通 Tool retry 只由 Tool Runtime 执行；Agent Tool 内部仍服从专用 runtime；
- 显式 cancel、action deadline、hard deadline 能终止相应 model/tool 调用；普通 SSE transport abort 不触发 run-scoped abort，断线后的安全事件仍能完成投影并被重连回放；
- `streamEvents` 只经 adapter 输出白名单字段；
- 现有 Tasklist、Image、Delivery、Chat Memory checkpointer 与 provider targeted suites 在依赖升级后通过。

未通过任一项时停止大范围迁移并回到 Plan 评审，不新增第二套通用 StateGraph 规避。

## 3. Scenario Matrix

### A. Zero-Tool Direct Answer

Prompt:

```text
用一句话解释什么是递归。
```

Expected:

- 请求进入 LangChain `createAgent` 通用 ReAct loop；
- 允许零 tool call；
- final answer 正常流式输出；
- `source=chat`；
- Trace 不显示虚假工具或来源。

### B. Existing Local Tool

Prompt:

```text
计算 (18.5 * 4) + sqrt(81)。
```

Expected:

- `calculator` 被调用；
- assistant tool call 与 ToolMessage 一一配对；
- observation 返回 `decide` 后再生成 final；
- `source=tool`。

### C. Search Then Read

Prompt:

```text
查找一个今天仍可访问的 LangGraph JavaScript 官方快速入门页面，读取它并概括核心循环。
```

Expected:

- 先 `web-search`，其结果 URL 被加入当前 Run 授权集合；
- 后 `read-url` 只读取已授权 URL；
- `web-search` 与依赖其 URL grant 的 `read-url` 分属两个 Agent round，不依赖同批执行顺序；
- Web Search 状态显示“已搜索到 N 个来源”，`N` 与通过安全过滤并按 canonical URL 去重后的该调用结果一致；
- 成功读取数量按当前 Run 的唯一 `status='read'` 来源计算，retry 不重复计数；存在成功读取记录时显示最多 5 项“已读取来源”，否则整个来源区域隐藏；
- 每个来源显示安全标题与 hostname，通过 public URL policy 时可点击并以新窗口打开，链接包含 `noopener noreferrer`；
- Runtime 不把来源自动标记为“官方页面”；
- 最终回答包含安全来源信息；
- public stream 不含网页全文。

### D. Same-Round Independent Tools

使用 scripted model 在同一个 assistant turn 返回四个相互独立的普通 Tool Call，其中至少三个为可控延迟 fake。

Expected:

- 前三个调用可以重叠，第四个等待，底层峰值并发严格为 3；
- 完成顺序与 assistant ordinal 不同时，每个 call 仍只有一个 ToolMessage/public part；
- UI 在派发时按 assistant ordinal 预建稳定槽位，三个并行调用可以同时显示不同的运行/完成状态；retry 只更新原逻辑 Tool 行，不新增尝试行；下一轮 model request 仍按 assistant ordinal 稳定；public lifecycle 无需伪装成串行；
- 同批 URL/source/fingerprint 更新全部保留，不发生 last-write-wins 丢失。

### E. User-Authorized URL

Prompt 包含一个公开 HTTP(S) URL并要求概括。

Expected:

- 该 URL 由 user grant 加入授权集合；
- `read-url` 可直接读取；
- URL grant 不跨下一次请求复用。

### F. Special Chat Contexts

分别验证：

- `/summary`
- `/check`
- `@resource`
- utility Skill
- context-reader Skill
- MCP Resource
- MCP Prompt
- MCP Tool（仅已有 selector 明确允许时）

Expected:

- context preparation 保持现有授权和失败语义；
- 成功后统一进入 `createAgent`；
- base tools 仍存在，Skill/MCP 只叠加明确能力；
- 现有 composer command 的 UserMemory write eligibility 不被扩大。

### G. Dedicated Agent Exclusions

分别运行 Tasklist、Delivery Chain、Image 的代表请求。

Expected:

- 三者不进入 generic `createAgent`；
- 原有 GraphState、tool scope、stream 和 UI 行为保持；
- `web-search`/`read-url` 不泄漏进专用 allowlist。
- Delivery `*-subagent` Tool 显式归类为 `agent-tool/delegated-agent`，没有被普通 Tool 的 1/5/20 秒 attempt policy 中止，也没有被外层整体重试；Tasklist 的 `validate_tasklist_structure` 仍为本地确定性普通 Tool。

## 3.1 Prompt-Only Skill And General Tool Policy

在配置 `TAVILY_API_KEY` 的测试环境中，分别使用未选 Skill、`utility-skill` 和 `reader-skill` 发送普通 chat 请求：

- 三种请求的 Action Tool schema 都应只包含 `calculator`、`datetime`、`text-transform`、`unit-convert`、`read-url`、`web-search` 与 `city-weather`；
- Skill 只改变可信系统提示词、输出风格和 Trace 中的 Skill 行，不能改变 Tool 数量、Tool 名称或 execution policy；
- mock remote MCP `tools/list` 必须为 `0`；仅因选中 Reader 或出现“项目上下文”等自然语言不得读取 remote Resource/Prompt；
- `/summary`、`/check` 或显式 `@demo://...` resource 仍先走 Composer preparation，再进入同一个 General ReAct Run。

验证命令：

```powershell
pnpm --dir apps/webapp exec vitest run --config vitest.stable.config.ts tests/lib/ai/capabilities/tool-binding.test.ts tests/lib/ai/runtime/chat-session.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts tests/lib/ai/runtime/chat-orchestrator-user-memory.test.ts tests/lib/ai/runtime/general-react-agent/prepared-chat-context.test.ts
```

## 4. Budget And Failure Matrix

使用测试侧 scripted model/tool fake 验证：

| Case                                                        | Expected stop/result                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 第 7 个携带 Tool 的 action round                            | `action_round_limit`；最多 6 个 Tool-bearing Action rounds                                        |
| 跨批次出现第 10 个待接纳 tool call                          | `tool_call_limit` before execution                                                                |
| 同批声明 10 个 tool calls                                   | 前 9 个按 ordinal 接纳并预占，超额 call provider invocation 为 0 且获得配对 `budget_blocked`      |
| 同批 4 个已接纳的慢 Tool                                    | 峰值并发为 3；第 4 个排队并在实际开始前重新检查 action/hard deadline                              |
| 第 8 次 Agent Action model call                             | `model_call_limit`；Action 最多 7 次，固定保留第 8 次给 Answer                                    |
| 第 7 次 Action 仍请求 Tool                                  | 不再 admission；进入 constrained Answer，不执行该 Tool                                            |
| action phase 到 145 秒                                      | `action_deadline`；禁止新行动，进入 constrained Answer                                            |
| 后端 Run 到 180 秒                                          | `run_deadline`; no new Agent work，终态完成最小 lifecycle/error 投影                              |
| SSE 网络投递、客户端接收或重连等待超过 180 秒               | 不占用或延长后端 Run budget；已投影事件仍按现有 retention/cursor contract 回放                    |
| calculator Tool 自身 1s、local Profile 5s、Action 剩余 30s  | effective attempt timeout = 1s；超时后不 retry，只产生一个 paired `timeout` observation           |
| local Tool 自身请求 10s、local Profile 5s                   | effective attempt timeout = 5s；Tool 自身配置不能放宽 Profile                                     |
| remote Tool 20s、Action 剩余 600ms                          | effective attempt timeout = 600ms；若已低于安全启动条件则直接 `budget_blocked`                    |
| retry-safe remote Tool 连续 execution failure               | 最多 3 次底层 attempts（首次 + 2 retries），退避 1～2s、2～4s；仅一个最终 ToolMessage/public part |
| 一个逻辑 Tool Call 首次失败、retry 两次                     | `toolCallCount=1`、底层 attempts 为 3、`toolRetryCount=2`，且只生成一个最终 ToolMessage           |
| A/B/C 三个 retry-safe Tool；C 首次成功，A/B 各失败两次      | C 占用 0；A/B 每次真实 retry 前各获得 2 个 permit；总计 4，均可执行到第 3 次 attempt              |
| 多个 Tool 几乎同时申请最后一个 retry permit                 | 只有一个原子申请成功并立即开始 retry；其他申请返回 null，Run retry 总数仍为 4                     |
| 同一 Run 请求第 5 次普通 Tool retry                         | Run retry budget 阻止 retry，进入最终逻辑结果或收口                                               |
| 第 2 次 model retry                                         | global model retry budget 阻止 retry，进入最终逻辑结果或收口                                      |
| invalid schema/security/permission/cancellation（前置拒绝） | provider invocation/retry 为 0；返回唯一配对安全 observation                                      |
| Delivery `agent-tool` 内部阶段超过普通 remote 20s           | 不触发普通 Tool timeout；由 Delivery 专用 runtime/父级 signal 决定结果，外层整 Agent retry 为 0   |
| `agent-tool` 出现在 general-chat resolution                 | fail-closed，不加入 effective tools，也不向模型暴露                                               |
| single observation > 12,000 chars                           | truncated marker；Agent 可在预算内继续                                                            |
| cumulative observation > 32,000 chars                       | `observation_limit` and constrained Answer                                                        |
| same tool + canonical args repeats                          | duplicate observation；不得再次执行                                                               |
| 2 consecutive no-progress rounds                            | `no_progress` and constrained Answer                                                              |
| 普通 SSE transport disconnect                               | 当前 writer 停止；run-scoped abort 次数为 0，后端继续执行并投影事件                               |
| 客户端携带合法 cursor 重连                                  | 不创建第二 executor；按既有协议回放已投影事件并继续接收后续事件                                   |
| 用户显式 cancel                                             | `request_cancelled`; run-scoped signal 终止在途 model/tool，no completed memory turn              |

每个 assistant tool call，无论成功、失败还是未获 admission，都必须有唯一配对 ToolMessage；retry attempt 不新增 ToolMessage 或 public part。并行 fake 必须让完成顺序可控并断言 active invocation 峰值、provider 调用次数、state union 和 ordinal 投影，不能只断言总耗时。`attemptTimeoutMs` 只能来自 server-side Tool Definition，模型提交同名额外参数必须因 strict schema 被拒绝。同步 calculator 场景还必须验证表达式长度/复杂度限制，不能用阻塞 event loop 的 fake 证明 timer 能抢占同步 CPU。

## 5. Performance And Backpressure Matrix

使用 scripted model/Tool 和可控数据库 fake 先跑确定性测试，再在本地 PostgreSQL 跑 reference load：

| Case                                                      | Expected                                                                                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同时发起 8 个 General ReAct Run                           | 全部获得 process permit；单 Run Tool 并发仍不超过 3，既有 180s/9-call/4-retry 预算不变                                                                                       |
| 第 9 个 General ReAct Run 同时到达                        | 在 context/provider/Tool 前返回 `STREAM_SERVICE_UNAVAILABLE`、`retryable=true` 和固定“服务繁忙，请稍后重试。”；模型/Tool invocation 均为 0；不进入内存等待队列或公开容量数值 |
| Tasklist/Delivery/Image 与 8 个 General ReAct Run 并存    | 专用 Agent 不申请 General ReAct permit，原有路由/预算/执行行为不变                                                                                                           |
| 每个最终回答 part 的首个 `text-delta`                     | 立即进入 durable batch；数据库提交前 writer 收到 0 个 envelope                                                                                                               |
| 后续小 delta 持续到 40ms                                  | 合并为一个 `text-delta` 后 flush；时间边界使用 fake clock 验证，不依赖 wall-clock sleep                                                                                      |
| 后续 delta 在 40ms 前累计 256 chars                       | 立即 flush；不等待 timer                                                                                                                                                     |
| provider 单次返回 800 chars                               | 整块立即 flush，不能人工拆成多个延时片段                                                                                                                                     |
| pending text 后到达 Tool/Trace/source/`text-end`/terminal | 先提交更早 text，再提交独立结构化 envelope；sequence 连续，terminal 最后且之后不可 append                                                                                    |
| 同一 batch 包含多个 public events                         | StreamRun 只 lock/update/trim 至多一次，事件批量 insert；transaction failure 时当前 writer 收到 0 个该批 envelope                                                            |
| pool/transaction 持续阻塞                                 | 分别在 `min(2s, Run remaining)` / `min(5s, Run remaining)` 内失败并进入标准化收口，不突破 180 秒后端边界                                                                     |
| writer 在 transaction 后关闭                              | committed events 保留且可 cursor replay，不继续写 closed writer                                                                                                              |
| 数据库 fake 变慢直至高水位                                | queue 不超过 64 items/256KiB，producer 等待；降到 32/128KiB 以下后恢复，不 drop/overwrite/reorder                                                                            |
| 背压期间 cancel/hard deadline/projection failure          | waiter 被唤醒，停止拉取/新 model/tool，timer、Abort listener、permit 与 pending promise 全部清理                                                                             |
| 浏览器持续接收服务端 batch                                | 默认 20ms timer 后进入最近 rAF；仅已评估模型可通过 allowlist 覆盖 timer，正常默认消息树提交频率通常不超过约 25/s，`text-end/error/finish/abort/unmount` 无尾字符丢失         |
| calculator 最大合法输入                                   | 同步 CPU p95 ≤5ms；超复杂输入在执行前拒绝，不能用异步 timeout 掩盖 event-loop block                                                                                          |

数据库/Node reference load 必须记录：

- 8 个 active Run 的完成数、capacity rejection 和 permit release；
- projection queue items/bytes high-water、batch event count、text chars、wait duration；
- StreamEvent batch transaction p50/p95/max，p95 目标 ≤20ms；仅 `AI_MIND_REFERENCE_LOAD_GATE=production-like` 时作为 hard gate，并要求非秘密的 `AI_MIND_REFERENCE_LOAD_TOPOLOGY`、`AI_MIND_REFERENCE_LOAD_DATABASE_INSTANCE`、并发、pool、预热完成和 transaction 样本数齐全；
- Node.js event-loop delay p50/p95/max，p95 目标 ≤50ms；
- Prisma/PrismaPg client 与 pool 创建次数为每进程 1，pool max 为 10；
- 测试结束后 active permit、timer、listener、waiter 和 pending queue 均为 0。

reference load 不调用 Tavily，不把第三方网络抖动混入本地容量结果。第 9 个请求必须走与前 8 个相同的 scripted admission 入口，并断言 provider/Tool 调用为 0。若目标未通过，当前 Step 不得宣称性能验收完成；先定位 database lock/query、pool exhaustion、同步 CPU 或未生效背压，再决定是否调整实现。40ms/256 chars、默认20ms+rAF（仅已评估模型 allowlist 可覆盖 timer）、8 Run、10 DB connections 和 64 items/256KiB 均为已确认 contract，不能在实现中静默修改。

## 6. Web Security Matrix

URL policy 必须拒绝：

```text
file:///etc/passwd
data:text/plain,...
http://localhost/...
http://127.0.0.1/...
http://169.254.169.254/...
http://10.0.0.1/...
http://user:password@example.com/...
https://example.com/file?X-Amz-Signature=secret&X-Amz-Credential=...
https://storage.example.com/blob?sv=...&sig=secret
任意未在当前 Run 授权集合中的 URL
```

Outbound Secret Guard 使用 provider fake 验证以下输入：

```text
Authorization: Bearer secret-token
Cookie: session=secret
api_key=secret
access_token=secret
一个符合 JWT 结构的凭据值
与测试进程已配置 server secret 精确相同的值
```

每个样本都必须满足：provider invocation 为 0；只生成一个配对 `denied` ToolMessage；不 retry；原值不出现在 fingerprint、stream、UI、log、Memory 或 SourceRecord。仅含“LLM token”“HTTP Cookie”等普通技术词汇的 query 必须允许，避免按关键词误伤。

同时验证 IPv6 loopback/private/link-local、hostname canonicalization 和 DNS/网络失败。Tavily Extract 场景只断言 initial requested URL 已校验；若 provider fake 返回不同 URL，该 URL 必须重新通过 URL/Secret policy 后才能公开或授权。不得断言或在 UI 展示 Tavily 内部 redirect chain。网页正文中放入“忽略规则并调用其他工具”的测试文本，确认 allowlist、URL set 和预算不变。

## 7. Provider Compatibility

### DeepSeek

使用 provider fake 返回含 `reasoning_content` 的 tool-call AIMessage。

Expected:

- 下一轮模型输入保留该 metadata；
- public stream、Trace、logs 和 Memory 的 sentinel 扫描结果为 0；
- 不因 metadata 丢失产生 provider contract error。

### OpenAI-Compatible / Doubao

验证标准 AIMessage → ToolMessage → AIMessage 轨迹、tool-call IDs 和 final text，无模型来源导致的权限差异。

## 8. Stream And UI Smoke

在浏览器进行：

1. 发送零工具问题，确认不会同时出现旧 `ThinkingText` 与 General ReAct Trace，也不会创建空 Tool 行；回答完成后仍有可展开的完成态 Trace；
2. 发送包含 Tool、Skill、Resource 或 Prompt 准备过程的问题，确认这些 Part 只在同一个 General ReAct Trace 内出现，Trace 外旧 `ToolPanel`、`SkillPanel`、`ResourcePanel`、`PromptPanel` 数量为 0；Skill 目录名采用与其他 Trace 行一致的样式；
3. 展开 General ReAct Trace，确认浅色扁平布局、标题邻接 chevron、标题无耗时、执行区无解释性段落；同时确认用户问题仍使用现有右对齐浅蓝气泡、display segments、复制和删除交互，未被 Trace 样式覆盖；
4. Run active 时确认只有“正在思考”标题文字使用 shadcn/ui Shimmer，chevron、图标和状态行不闪动；启用 `prefers-reduced-motion` 后标题为静态文字；
5. Run active 时手动收起 Trace，再注入 Tool/Resource/phase 事件，确认新事件不会强制展开；随后让 Tool action 全部结束并延迟 final `text-start`，确认这段间隙仍处于 active 且不会提前显示“已完成思考”；
6. final `text-start` 到达后确认 Trace 原子切换为不闪动的“已完成思考”、只自动折叠一次且可手动重开；后续 `text-delta` 不得覆盖用户重开状态，最终回答继续使用现有流式增量渲染；
7. 分别触发显式取消与无最终回答的终态失败，确认显示不闪动的“已停止思考”和“处理未完成”，且只展示安全停止原因；在已产生部分回答后取消，确认部分文本只暂留当前页面；
8. 确认 Tool 行始终使用工具类型图标，运行/完成状态文案颜色与字重一致，失败只改变语义文字而不替换状态图标；
9. 用同轮三个并行 fake Tool 验证稳定 ordinal 槽位可同时呈现不同状态；用 retry fake 验证重试只更新原逻辑 Tool 行；
10. 用包含重复 URL、一次成功读取、一次 retry 后成功和一次最终失败的 fake 验证搜索/读取数量、canonical URL 去重及 retry 不重复计数；
11. 确认只有成功读取来源进入“已读取来源”，最多 5 项，无成功读取时模块隐藏；来源项显示标题和 hostname，安全 URL 可点击并带 `noopener noreferrer`，Runtime 不生成“官方页面”标签；
12. 触发一次 Web Tool 安全拒绝，确认只显示通用状态，不显示原始参数、命中规则或 redirect 细节；
13. 分别打开 Tasklist、Delivery Chain 与 Image Agent UI，确认三条专用 presentation 未复用 General ReAct Trace；
14. 正常完成后刷新同一浏览器会话，确认从现有 IndexedDB `conversation-snapshots` 恢复完整 public-safe Trace 与最终回答；完成态默认收起且可手动展开，刷新前的 disclosure state 不恢复，零 Tool 场景不得生成虚假 Tool 行；
15. 对本地 snapshot serialized value 注入 raw reasoning、raw Tool input/output/error、网页正文、内部 prompt 与 secret sentinel，确认稳定快照写入边界全部剔除；
16. 分别验证显式取消、终态失败和部分回答不提交稳定快照；刷新后只恢复上一次已完成快照，不恢复“已停止思考”消息的部分内容；
17. 删除含 Trace 的 assistant message、重新生成和删除会话，确认 Trace parts 随现有 snapshot commit 一起更新，不留下孤儿记录；
18. 模拟 IndexedDB unavailable、quota exceeded 和 invalid snapshot，确认页面回退服务端最终 user/assistant turn，Trace 可以缺失但发送、恢复和最终回答渲染不被阻塞。
19. 持续接收 final text，记录 reducer/message-tree commit cadence，确认前端默认20ms+rAF buffer（受控模型 allowlist 可覆盖 timer）与服务端 40ms/256 chars batch 协作且没有人为逐字拆包、滚动抖动或明显 Markdown 尾字符滞留。

## 9. External Tavily Smoke

仅在显式 external test 环境执行一次最小 Search 和 Extract：

- Search 返回不超过 5 条 public-safe results；
- Extract 仅单个已授权 URL；
- provider unavailable、401、429、5xx、timeout 均映射为标准化分类；
- 应用日志不含 Token、Cookie、API Key、Authorization 值、签名 URL、完整 query/chat history 或网页正文；Tavily provider authentication 正常工作但不进入业务 payload 或观测数据。

External smoke 失败不得通过 production code 中的 test-only fallback 绕过。

## 10. Completion Evidence

所有实施证据统一回填到 [acceptance.md](./acceptance.md) 对应 Step，本文只维护验收方法与预期结果，避免出现第二套完成状态。

进入 release closing 前，评审材料至少包含：

- dependency Spike、contract/Agent/middleware/route/stream/UI targeted test 输出；
- 完成态 Trace+答案的 IndexedDB 刷新恢复、删除/重新生成同步、取消/失败不提交、local storage 失败降级和本地快照敏感 sentinel 扫描证据；
- `pnpm typecheck`、lint、stable tests、build、`git diff --check` 输出；
- 三条专用 Agent 回归证据；
- initial/provider-reported URL policy、Outbound Secret Guard、prompt-injection 与 sensitive sentinel 扫描证据；不要求 Tavily redirect chain 证据；
- 真实 Tavily smoke 是否执行及结果；未执行时明确剩余风险；
- 8-Run reference load、9th-run admission、PostgreSQL batch/pool、projection high/low-water、persist-before-publish、event-loop delay、浏览器 commit cadence 与资源清理证据；
- specs、ADR、architecture、env examples 和真实代码一致性结论。
