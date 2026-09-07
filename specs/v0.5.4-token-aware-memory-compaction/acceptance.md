# Acceptance: Token-aware Memory Compaction

**Feature**: v0.5.4 Token-aware Memory Compaction

**Current stage**: Memory 原验收保留；持久滚动、P1/P2 流式渲染稳定性与 T054 全局 Messages/局部 Alert 的实现、验证和文档同步完成。T073/T074 按 D024 保留 48 Unicode code point 提前 rAF flush；滚动策略不变，残影和高压快速流视觉优化后续单独处理。保留未提交 worktree 供人工 review。

**Rule**: 本文件明确区分已经取得的文档证据与实现后才可验证的行为。未实现的行为不得提前勾选。

## Pre-implementation Documentation Gate

- [x] 分支为 `codex/v0.5.4-token-aware-memory-compaction`，精确基线为 `v0.5.3@304baa9`。
- [x] `.specify/feature.json` 指向唯一 canonical workspace `specs/v0.5.4-token-aware-memory-compaction`。
- [x] `spec.md` 已定义 Goals、Non-goals、失败边界、FR-001～FR-032 与 SC-001～SC-012。
- [x] `plan.md`、`research.md`、`data-model.md`、`quickstart.md` 与内部 contract 使用一致的预算公式和术语。
- [x] `decisions.md` 已记录锁定决策和 rejected alternatives。
- [x] `checklists/requirements.md` 与 `checklists/memory-compaction.md` 已完成逐项审查。
- [x] ADR-0018 与 `runtime-boundary.md` 仅描述 planned transition，不把方案表述成现有实现。
- [x] `tasks.md` 按 TDD、User Story、依赖与 release-closing 阶段组织。
- [x] 基线 chat-memory 定向测试在开始写文档前通过。
- [x] 整改后的最终 `speckit-analyze` 结果达到 0 CRITICAL/HIGH/MEDIUM/LOW、42 / 42 个可实施 requirement task coverage 100%、unmapped task 0。
- [x] `git diff --check`、untracked whitespace 检查与范围检查通过。

## Implementation Acceptance

### A. Token Budget and Estimation

- [x] A1 云端 128K fixture 得到 hard input `111104`、trigger `77772`、target `38886`。
- [x] A2 Ollama 32K fixture 得到 hard input `20480`、trigger `14336`、target `7168`，且 Provider 显式使用 `numCtx=32768`。
- [x] A3 物理窗口小于产品上限时，`effectiveWindow` 向下 clamp，不高估模型能力。
- [x] A4 token estimate 覆盖 role、文本、structured/tool payload、framing 和最终 10% margin。
- [x] A5 `AI_MIND_MAX_INPUT_CHARS=12000` 只拒绝超大最新用户输入/请求体，不扫描完整模型输入。

### B. Token-triggered Persistent Compaction

- [x] B1 任意数量的短消息在低于 trigger 时均不触发压缩。
- [x] B2 跨过 trigger 的请求最多尝试一次持久化压缩。
- [x] B3 有效候选不超过 target 且严格小于原上下文。
- [x] B4 压缩输入包含旧 summary、pins 和全部 recent messages，生成上限为 3000 tokens。
- [x] B5 压后继续若干短轮次不会立即因固定 message count 再次压缩。
- [x] B6 超大最后一轮整体进入 summary，不留下残缺 user/assistant turn。
- [x] B7 无效、未缩小或超 target 的候选不得更新 checkpoint、pins 或 `lastCompactedAt`。

### C. Continuity and Failure Recovery

- [x] C1 自动化集成场景中，压缩失败后“Vue 3 的响应式系统为什么要用 Proxy？”仍进入 answer model。
- [x] C2 压缩生成失败、candidate 校验失败和 candidate save 失败均保留旧 summary、pins 与 `lastCompactedAt`，当前请求继续使用 ephemeral fit。
- [x] C3 candidate save 失败后基于 last durable checkpoint 独立尝试 raw final-turn append；第二次 write 成功时保存完整 turn，第二次 write 失败时保留 last durable checkpoint、记录脱敏失败且不撤销回答。
- [x] C4 当前请求使用非持久化 ephemeral fit 继续，且不会覆盖 ThreadState。
- [x] C5 ephemeral fit 按 pins、summary、最新完整 turns 的优先级收敛；pins 单独超预算时按新到旧保留完整项，其余仅在当前请求省略且 checkpoint 不变。
- [x] C6 连续压缩失败时 checkpoint 可增长，但每次 eligible 请求在非记忆内容可容纳时仍可到达模型。
- [x] C7 自动压缩期间取消请求时，同一 signal 到达 compaction model，`AbortError` 直接终止请求；checkpoint 不变，且不进入 ephemeral fit 或 answer model。

### D. Complete-input Preflight

- [x] D1 direct answer、tool planning/final、Composer Context 和 Capability Context 使用同一预算策略。
- [x] D2 动态 Tool schema、Capability/Resource/Prompt context 或 UserMemory 挤占预算时，preflight 使用实际完整输入重算。
- [x] D3 完全排除 chat memory 后非记忆内容仍超限时，返回现有输入过长错误。
- [x] D4 非记忆内容可容纳时，不得因旧 chat memory 返回输入过长错误。

### E. Compatibility, Status and Privacy

- [x] E1 `messages/summary/pinnedDecisions/lastCompactedAt` 字段 shape 保持不变，无数据库 migration。
- [x] E2 hydration DTO、公开模型 API、`thread-memory-status` chunk 与前端 reducer contract 不变。
- [x] E3 Delivery/Tasklist 仍只保存最终可见安全 turn，不保存 GraphState、RuntimeArtifact、tool transcript 或 raw results。
- [x] E4 success、failure、cancellation 和 request finalization 均结束压缩状态；压缩已经 started 的 cancellation 以 failed 终态收口，UI 不残留“自动压缩上下文”。
- [x] E5 诊断日志包含预算和 fallback 枚举，但不包含聊天正文、prompt、API key、cookie 或 Provider secrets。
- [x] E6 FR-027 持久滚动场景以本文 2026-09-06 Scroll Amendment Verification 为准；不再使用 terminal-tail handshake 验收。

### F. Automated and Opt-in Verification

- [x] F1 新增 budget、tokenizer、compaction、preflight、Provider 和兼容性测试均通过。
- [x] F2 现有 chat-memory、hydration、safe final-turn、stream/reducer 回归测试通过。
- [x] F3 `pnpm typecheck` 与受影响 workspace lint 通过。
- [x] F4 Qwen、DeepSeek、Ollama opt-in smoke 按 `quickstart.md` 完成：DeepSeek、Ollama 通过；Qwen 因 Provider free quota exhausted（HTTP 403）有明确环境限制记录。
- [x] F5 `speckit-converge` 无剩余未建 task 的实现差距。

### G. Composer Chat Memory Usage Hint

- [x] G1 当前 session 的独立 usage route 仅返回 `usedPercent` 与 `effectiveWindowTokens`；route 与 client 共用 strict schema 并拒绝额外字段，不改变 hydration DTO、stream chunk、public model DTO，不返回 raw memory、raw token count 或 Provider config。
- [x] G2 cloud 128K、Ollama 32K（及小物理窗口 clamp）都用与 runtime 一致的 `ContextBudget` 分母；分子只计算 persisted chat memory。
- [x] G3 Composer 桌面工具栏在 skill-mode 右侧显示无数字圆环；无 snapshot、draft 或读取失败时隐藏，发送和既有状态不受影响。
- [x] G4 鼠标 hover 与键盘 focus 使用 shadcn Tooltip 显示 `聊天上下文已使用 xx%（128K/32K）`；没有压缩按钮或其它操作。
- [x] G5 模型切换和正常 finish 后的 idle refresh 更新显示；streaming 中不发起 usage request。

### H. Global Messages and Local Alerts

- [x] H1 项目链接复制成功/失败使用单一根级 shadcn Base UI Toast manager，并以稳定 operation id 原位更新，不进入 Virtuoso Header 或列表总高。
- [x] H2 会话列表不可用提示位于桌面/移动会话列表旁，本地只读缓存提示位于 Composer 对应功能区；持续故障继续使用可操作 `Alert`。
- [x] H3 移动会话选择器位于聊天 viewport 外，由页面 flex 布局占位；Virtuoso Header 默认保持空。
- [x] H4 Messages 在桌面使用紧凑内容宽度，在窄屏安全换行，位于 Sheet/Dialog 之上并按时自动关闭；显隐不改变聊天 scroll height 或 scrollTop。

## Evidence Log

| Stage                                       | Evidence                                                                                                                                                                                                         | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline                                    | `pnpm --dir apps/webapp exec vitest run tests/lib/ai/runtime/chat-memory-compaction.test.ts tests/lib/ai/runtime/chat-memory-service.test.ts tests/lib/ai/runtime/chat-memory-pinned-decision-promotion.test.ts` | 3 files / 19 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Documentation                               | requirements checklist                                                                                                                                                                                           | 16 / 16 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Documentation                               | memory-compaction checklist                                                                                                                                                                                      | 32 / 32 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Documentation                               | final analyze                                                                                                                                                                                                    | 0 CRITICAL/HIGH/MEDIUM/LOW; buildable requirements 42 / 42; 46 / 46 tasks formatted and mapped                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Implementation                              | 29 targeted Vitest files covering budget, compaction, preflight, Provider, route, hydration, Delivery and Tasklist                                                                                               | 238 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Implementation                              | hydration + frontend `thread-memory-status` targeted regression                                                                                                                                                  | 3 files / 15 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Cancellation remediation                    | 31 targeted Vitest files covering budget, compaction signal, status, preflight, Orchestrator, Provider, route and frontend                                                                                       | 246 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Cancellation remediation                    | targeted ESLint, `pnpm typecheck`, `git diff --check`                                                                                                                                                            | passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Cancellation remediation                    | post-remediation Spec Kit cross-artifact analysis                                                                                                                                                                | 0 CRITICAL/HIGH; 35 / 35 requirements mapped to 43 tasks; T040 scope synchronized to FR-026 / SC-009                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Superseded UI terminal semantic remediation | `use-chat-scroll-policy.test.tsx`、`chat-message-list.test.tsx` targeted Vitest                                                                                                                                  | 2 files / 76 tests passed；覆盖 callback-qualified draft promotion 保留 streaming follow、普通切换不继承 follow、reader lock 穿过 promotion 后不被 completion 恢复、finish-only revision、child layout-effect 先发 commit、finish/ready 分批提交、tail commit 后等待 Virtuoso 尾部测量确认、tail commit 与仍在底部的静态高度变化均零额外命令、commit 前离尾几何变化的保留、离尾后的 64ms 单次补偿、真实“滚动 → 停止”仍离尾的单次 retry、持续流式 Virtuoso 重测、真实上翻/触摸/键盘/滚动条意图、新轮次取消旧终态和终态后的被动阅读。 |
| Superseded UI terminal identity remediation | `use-chat-scroll-policy.test.tsx`、`chat-message-list.test.tsx`、`conversation-session.test.tsx` targeted Vitest                                                                                                 | 3 files / 111 tests passed；覆盖 static-tail `{ revision, messageId }` layout observation、generic total-height 不得提早结束、4px 严格尾部阈值、layout-before-commit 缓存、draft 即时身份升格及 registry 延迟对账。                                                                                                                                                                                                                                                                                                                 |
| Superseded UI terminal identity remediation | `pnpm --dir apps/webapp typecheck`、`pnpm --dir apps/webapp lint`、`git diff --check`                                                                                                                            | passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Superseded UI terminal tail browser smoke   | 当前 worktree 的本地 `http://localhost:3000/instant-mind` 长回答静态尾部                                                                                                                                         | 辅助功能树确认最新回答尾部操作和“推荐问题”位于 Composer 之前，且没有“回到底部”控件；未发送模型请求，避免制造用户会话数据。真实流与完成态多阶段高度变化由上述确定性 fixture 回归覆盖。                                                                                                                                                                                                                                                                                                                                               |
| Composer memory usage hint                  | TDD red：usage route、refresh hook 与 indicator 缺失；green：route/hook/indicator/toolbar                                                                                                                        | 4 files / 15 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Composer memory usage hint + regression     | usage、hydration、chat-memory compaction/service/pins 与 stream status targeted Vitest                                                                                                                           | 10 files / 83 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Composer memory usage hint                  | strict response DTO regression；`pnpm --dir apps/webapp typecheck`；affected-file ESLint                                                                                                                         | hook 拒绝额外字段；typecheck passed；ESLint 0 errors（`app/layout.tsx` 仅保留既有 Fast Refresh warnings）                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Composer memory usage hint                  | browser smoke at `http://localhost:3000/instant-mind`                                                                                                                                                            | fresh draft Composer correctly hides the indicator; no browser console errors. Persisted-memory tooltip remains covered by automated UI tests because no model request was sent to manufacture a session.                                                                                                                                                                                                                                                                                                                           |
| Opt-in provider smoke                       | 2026-09-04 external smoke: `deepseek/deepseek-v4-pro` + `ollama/qwen3-8b`; Ollama runtime state                                                                                                                  | DeepSeek structured compaction passed in 3.1s; Ollama structured compaction passed in 10.1s with `contextLength=32768`; Qwen attempt returned HTTP 403 free-quota exhaustion, recorded as provider environment restriction.                                                                                                                                                                                                                                                                                                         |
| Converge                                    | `speckit-converge` against source, automated tests and all v0.5.4 design assets                                                                                                                                  | 0 missing / 0 partial / 0 contradicts / 0 unrequested; no task appended.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Release-closing analysis                    | Final `speckit-analyze` after release documentation and package lockstep                                                                                                                                         | 0 CRITICAL / HIGH / MEDIUM; one stale spec status corrected; 42 / 42 requirements and 46 / 46 tasks mapped.                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Definition of Done

Implementation Acceptance、证据登记、ADR 状态、公开版本与 package lockstep 资产均已完成。本地 worktree 保持未提交、未推送，等待人工 review；通过 review 后再按仓库流程创建 commit、tag 或 GitHub Release。

## 2026-09-06 Scroll Amendment Verification

旧 terminal-follow/mock harness 证据已标记 Superseded，不再作为 SC-010 的证明；memory/provider 原验收继续保留。本次遵循 TDD：先观察完成后延迟增高、promotion 卸载、缺失 presentationKey、旧索引到底命令、accepted-turn 缺失的失败；审查后的多帧 End 与内层滚动两项也先 red 后修复。

| Gate        | Evidence                                                                                                                | Result                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 前端回归    | quickstart 的 scope 加 use-chat-memory-usage 和整个 message-list 测试目录                                               | 18 files / 172 tests passed                                                                                                         |
| Chrome 几何 | node apps/webapp/tests/browser/chat-scroll-regression.mjs；真实 Page/session/stream/policy/Virtuoso，测试侧 API fixture | 16 scenarios passed；跟随采样 gap 0–4px                                                                                             |
| 首问与续问  | promotion 前后同一 Virtuoso DOM 实例；宽度缓存刷新不重挂载/不显示 skeleton                                              | passed                                                                                                                              |
| 阅读语义    | wheel 上翻、手动展开、按钮恢复、原生 End 多帧回底后继续跟随                                                             | passed；reader 无拉底命令                                                                                                           |
| 延迟几何    | finish 建议/Markdown、Composer、迟到固有尺寸图片、viewport/宽度重排                                                     | passed                                                                                                                              |
| 虚拟化      | 1000 mixed messages                                                                                                     | 样本挂载 3–11 项，没有展开全量 DOM                                                                                                  |
| 类型        | pnpm typecheck                                                                                                          | 7 tasks successful / 7 total（含缓存依赖）                                                                                          |
| Lint        | pnpm --dir apps/webapp lint                                                                                             | 0 errors；8 个既有 warning，位于本次未改动的 lint 位置                                                                              |
| 测试目录    | node scripts/validate/check-test-locations.mjs apps/webapp                                                              | 180 个测试文件全部位于 tests/                                                                                                       |
| 测试分层    | node scripts/validate/validate-test-lanes.mjs                                                                           | passed                                                                                                                              |
| 交付完整性  | git diff --check；20 个相关 untracked 文件 whitespace 检查；6 个 lockstep package version                               | passed；版本均为 0.5.4                                                                                                              |
| 可复现依赖  | playwright@1.62.1 显式 webapp devDependency 与 lockfile；安装后重跑浏览器脚本                                           | 16 scenarios 再次全部通过；无生产测试分支                                                                                           |
| 独立审查    | requesting-code-review 只读 reviewer                                                                                    | 发现多帧向下回底证据过早清除；已用失败单测复现、修复，并由 Chrome 原生 End 验证。第二次 reviewer 受用量限制未完成，不宣称复审通过。 |

浏览器使用隔离上下文和内存端点，不访问真实模型或用户会话。覆盖 Chrome；本次未运行 Safari/iOS 真机、Next production build 或重复 Provider live smoke。触摸方向/多帧逻辑由单测验证。

## 2026-09-06 Convergence and Closing

本次按 speckit-converge 检查当前 canonical spec/plan/tasks 和实现；T054 完成后再次人工核对 32 项 FR、12 项 SC、滚动与 UI feedback 契约以及 11 条 constitution 原则。missing / partial / contradicts / unrequested 均为 0，各严重级别均为 0；无需追加 Convergence phase。

同版旧 terminal-follow 只作为 superseded 历史证据保留；正式 spec、plan、data-model、contracts、decisions、architecture 和公开 v0.5.4 资产一致采用持久滚动意图。原 memory/provider 验收继续保留，本次 frontend 改动没有重新运行全部 Runtime 或 external suites。

## T053 Scroll Button Visibility Verification

上轮证据覆盖最终几何，未覆盖流式全过程按钮显隐；用户反馈后重新打开此项验收。Chrome 慢速增量复现 24 次显隐切换；新增自动化先得到 4 项单测失败及浏览器 following 显隐断言失败，确认测试可以捕获旧缺陷后再修改生产实现。

| Gate               | Evidence                                                                     | Result                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 意图与历史进入回归 | chat-scroll-intent.test.tsx / use-chat-scroll-policy.test.tsx                | 2 files / 28 tests passed                                                                                                 |
| 真实浏览器         | node apps/webapp/tests/browser/chat-scroll-regression.mjs                    | 18 scenarios passed；新增首问跟随、点击恢复后增量与完成态的连续显隐观测，两个窗口 visibleSamples 均为 0；上翻后按钮可操作 |
| 类型               | pnpm --dir apps/webapp typecheck                                             | passed                                                                                                                    |
| Lint               | pnpm --dir apps/webapp lint                                                  | 0 errors / 8 个既有 warning                                                                                               |
| 完整性             | git diff --check；node scripts/validate/check-test-locations.mjs apps/webapp | passed，180 个测试文件位置合法                                                                                            |
| 独立审查           | T053 三处显隐更新及回归覆盖，只读 reviewer                                   | 未发现可行动缺陷；reviewer 未重复运行测试                                                                                 |

T053 修复只调整滚动 policy 的按钮显隐，不新增计时器或 state store；该阶段对通知/Header 的调研已由下方 T054 最终方案取代。Safari/iOS 真机与生产构建未重跑，保留前述验证范围限制。

## 2026-09-07 Streaming Render Stability Verification (P1/P2)

本专项先以失败测试锁定三类旧行为：streaming token 会改变当前 assistant 的启发式 heightEstimates；content render 可能在 Virtuoso 最新 measurement 前单独发出回底命令；finish 同时切换 Streamdown mode、animated 和 isAnimating。实现后只登记实际通过的定向测试和浏览器结果。

| Gate                        | Evidence                                          | Result                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Height estimate freeze      | T055 / chat-message-list.test.tsx                 | chat-message-list.test.tsx 29 tests passed；streaming estimate 冻结、Virtuoso measurement 保留、完成态最新 assistant hint 通过                                                                                                           |
| Scroll/measurement ordering | T056 / scroll policy tests                        | chat-scroll-intent.test.tsx + use-chat-scroll-policy.test.tsx 31 tests passed；content-only render 不提前滚动，measurement 事件收敛                                                                                                      |
| Streamdown lifecycle        | T057 / text-part.test.tsx                         | text-part.test.tsx 2 tests passed；mode/animated 恒定，仅 isAnimating 改变                                                                                                                                                               |
| Webapp validation           | T061 typecheck/lint/diff check/browser regression | P1/P2 定向 4 files / 60 tests passed；受影响 `message-list` + `instamind` 31 files / 274 tests passed；lint 0 errors（8 existing warnings）；Chrome 18 scenarios passed；git diff --check passed。T054 完成后全量 typecheck 已重新通过。 |

Acceptance boundary: 本专项保留既有动画，不修改 stream/API/NDJSON/ThreadState；T054 的最终实现与独立验证见下节。

## 2026-09-07 Messages and Local Alerts Verification (T054)

本项采用根级 shadcn Base UI Toast manager 封装 `Messages`。短时操作反馈从列表 Header 移到固定顶部 Portal；持续故障保留在对应功能区域的 `Alert`；移动会话导航移到聊天 viewport 外。未新增第二套通知状态或通知库。

| Gate                 | Evidence                                                                                           | Result                                                                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page、会话与错误回复 | page.test.ts + conversation-session.test.tsx + use-chat-stream.test.tsx + 两个 scroll policy tests | 5 files / 102 tests passed；会话 Alert 位于各自列表旁且在 ScrollArea 外，只读缓存 Alert 位于 Composer，生图限额只保留 assistant reply，ChatMessageList 不接收通知 Header                                                                               |
| Chrome 集成          | node apps/webapp/tests/browser/chat-scroll-regression.mjs                                          | 原 18 个滚动场景通过；另通过同 id 原位更新、4 个不同 id 的 frontmost/limit 堆叠、紧凑宽度、360px 窄屏换行/居中、300ms 自动关闭、Sheet/Dialog 层级、真实 Page 项目复制反馈、Messages 显隐不改变 Virtuoso 几何，以及移动导航在历史滚动后保持固定布局位置 |
| 类型与 lint          | pnpm --dir apps/webapp typecheck；pnpm --dir apps/webapp lint                                      | typecheck passed；lint 0 errors / 8 个既有 warning                                                                                                                                                                                                     |
| 测试目录与完整性     | node scripts/validate/check-test-locations.mjs apps/webapp；git diff --check                       | passed；179 个测试文件位置合法                                                                                                                                                                                                                         |
| 独立审查             | requesting-code-review 只读 reviewer                                                               | 发现 Toast.Root 缺少逐项 z-index；先用 4 个不同 id 复现全部 computed z-index 为 auto，再恢复官方层级 class，Chromium 回归通过；复审无 Critical/Important/Minor 问题，可合并                                                                            |

浏览器验证覆盖 Chromium；Safari/iOS 真机与 Next production build 未在本次重跑。Base UI Toast 的 Vitest DOM 集成受仓库 hoisted linker 下重复 React 实例限制，因此组件生命周期使用真实 Vite/Chromium 集成验证，未为测试改变全局 Vitest resolve 配置。

## 2026-09-07 Accepted Follow-up Turn Runway Verification (T063-T066)

本项只调整已有历史的新问题 send 的初始消息几何。TDD 先复现固定 `50dvh` runway 在 1024x760 Chrome 中的初始定位问题，再以组件测试锁定扣除 `bottomInset` 的 CSS 公式；最终实现不测量 assistant 回复高度，也不增加 Footer reserve、timer、observer、滚动循环或 list handle API。

| Gate                | Evidence                                                                                                           | Result                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 定位资格与滚动契约  | use-chat-stream.test.tsx、chat-scroll-intent.test.tsx、use-chat-scroll-policy.test.tsx、chat-message-list.test.tsx | 4 files / 93 tests passed；仅已有历史的新问题 send 启用 runway，accepted-turn 仍走唯一 `scrollToEnd`                                                        |
| Runway 转移         | ChatMessageList component + CSS item geometry                                                                      | submitted/streaming 使用同一 TurnEntry；assistant loading slot 使用同一 `clamp(10rem, calc(72dvh - bottomInset - 4rem), 48rem)` 的 `min-height`；ready 清理 |
| Chrome/Virtuoso     | `node apps/webapp/tests/browser/chat-scroll-regression.mjs`                                                        | 19 scenarios passed；1024x760 下 user 初始 top `183px`，assistant 接管后仍为 `183px`；既有 reading、End 回底、后续增量和完成态通过                          |
| 类型、lint 与完整性 | `pnpm --dir apps/webapp typecheck`；`pnpm --dir apps/webapp lint`；test-location；`git diff --check`               | passed；lint 0 errors / 8 existing warnings；179 个测试文件位置合法                                                                                         |
| 独立审查            | requesting-code-review 只读 reviewer                                                                               | 无 Critical/Important；补充 resume 排除、error 终态断言与 D022 contract 追踪后收口                                                                          |

浏览器证据覆盖 Chromium；Safari/iOS 真机与 Next production build 未在本项重跑。runway 只存在于当前 item 布局，following/reading 状态机及正常贴底行为保持原契约。

## 2026-09-07 Accepted Follow-up Runway Handoff Stability (T067-T068)

在 T066 的静态前后位置断言之外，Chrome 回归新增从 `submitted` 到 assistant 首个 delta 的逐帧采样。修复前，assistant 作为新 Virtuoso item 插入时，列表先保留带 runway 的 user 已测尺寸，再叠加新 item 的默认 `100px`，导致总高 `4115px -> 4215px -> 4115px`，user item 在中间两帧从 `183px` 下移到约 `282.8px`。这不是 follow 命令造成的，采样期间 `scrollTop` 保持 `3355px`。

当前实现将 submitted 阶段的 user 消息和 assistant loading slot 合并为同一个 `TurnEntry`，并在 streaming 首包到达后只替换该 slot 内容，继续复用同一 item key。TurnEntry 仅存在于列表展示层，不写入真实 `messages`、hydration、stream、disclosure 或本地 height hint；slot 的 `min-height` 由 CSS runway 保持，不需要 token 高度计算、计时器、额外 observer、Footer reserve 或新的滚动 API。

| Gate                                | Evidence                                                                                                                   | Result                                                                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intermediate-frame reproduction     | `chat-scroll-regression.mjs` added rAF trace                                                                               | 修复前失败：最大 user top 偏移约 `100px`，总高出现临时 `+100px`                                                                                                                  |
| Stable item-key handoff             | `ChatMessageList` `TurnEntry + assistant loading slot`                                                                     | 组件测试验证 submitted/streaming 为同一个 item/key，slot runway 保持同一 CSS 长度，无额外 `scrollTo` 命令                                                                        |
| Affected component/policy contracts | `chat-message-list.test.tsx`、`chat-scroll-intent.test.tsx`、`use-chat-scroll-policy.test.tsx`、`use-chat-stream.test.tsx` | 本轮定向消息列表回归 2 files / 32 tests passed；T063-T066 的 4 files / 93 tests 证据保留在上方                                                                                   |
| Chrome/Virtuoso regression          | `node apps/webapp/tests/browser/chat-scroll-regression.mjs`                                                                | 本次 19 scenarios passed；accepted follow-up submitted/assistant top 均为 `183px`，逐帧最大 user top 漂移 `0px`，无额外 `scrollTo`；reading、手动展开、End、后续增量与完成态通过 |
| Type/lint                           | `pnpm --dir apps/webapp typecheck`；`pnpm --dir apps/webapp lint`                                                          | typecheck passed；lint 0 errors / 8 existing warnings                                                                                                                            |

浏览器证据覆盖 Chromium；Safari/iOS 真机与 Next production build 未在本项重跑。该修复仅收敛 accepted follow-up 的展示层 item 身份，stream/API/NDJSON、业务消息和既有 following/reading 状态机不变。本轮曾捕获一次 submitted 无 assistant 时的可选值判定错误，已通过显式 assistant 存在性判断修复后重新完成上述回归。

## 2026-09-07 Measured-Height Follow Latency Verification (T069-T072)

流式逐帧排查确认，Virtuoso 与业务策略未发生 `scrollTop` 反向争夺；问题是已完成 measurement 的总高先增长，而旧 `atBottom=true` 尚未失效，导致既有 rAF 空转。TDD 先增加“基线后正向总高增长即使 at-bottom 回调未到也必须回底”的失败断言，再以 presentation-local 总高基线驱动既有 force rAF。该 force 仍受 following、reading、pending entry、presentation 与空列表 guard 约束。

| Gate                     | Evidence                                                                                                                                            | Result                                                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TDD policy contract      | `chat-scroll-intent.test.tsx`                                                                                                                       | red：总高从 `1600` 增至 `1768` 时旧策略未发命令；green：24 tests passed，首个观测与新展示代次只建基线、同帧两次增长合并一次 auto 回底、reading/空列表不拉底，pending entry 不叠加 D023 follow    |
| Chrome/Virtuoso geometry | `node apps/webapp/tests/browser/chat-scroll-regression.mjs`                                                                                         | 21 scenarios passed；6 次慢速增量最长 3 frames 回到底；保留 48 码点早刷后的 18 个 25ms delta 产生 18 次真实高度提交，最长 2 frames 回到底；每帧至多一个 `scrollToEnd`，未观察到 `scrollTop` 反向 |
| 类型、lint 与完整性      | `pnpm --dir apps/webapp typecheck`；`pnpm --dir apps/webapp lint`；`node scripts/validate/check-test-locations.mjs apps/webapp`；`git diff --check` | passed；179 个测试文件位置合法；diff 无 whitespace error（Git 仅报告既有 CRLF 规范化 warning）                                                                                                   |
| 独立审查与收敛           | 只读 reviewer；canonical spec/plan/tasks/contract 对照实现                                                                                          | 无 Critical；补充空列表、pending entry 和快速流每帧命令覆盖，contract 追加 D023/T069–T072 追溯；未发现剩余实现任务                                                                               |

该修订不改变 `followOutput=false`、4px true-bottom 定义、Virtuoso measurement/height estimate、Streamdown 24ms fade 或流式缓冲。浏览器覆盖 Chromium；Safari/iOS 真机与 Next production build 未在本项重跑。

## 2026-09-07 Accepted Early Stream Buffer Flush (T073-T074)

按当前产品决策，48 Unicode code point 提前 rAF flush 与 40ms timer 合并同时保留。文本 reducer 提交、react-virtuoso 的 ResizeObserver measurement 和 D023 的回底策略保持原有链路；D024 不改其中任何滚动条件或命令。

| Gate                 | Evidence                                                    | Result                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 48 码点行为          | `use-stream-text-buffer.test.tsx`                           | 三个 16-character delta 达到 48 时可在 40ms timer 前以一次合并内容 flush；红绿验证后 3 tests passed                                                                                                       |
| Chrome/Virtuoso 回归 | `node apps/webapp/tests/browser/chat-scroll-regression.mjs` | 21 scenarios passed；慢速增量最长 3 帧重新贴底；保留早刷后的快速 18 个 25ms delta 产生 18 次真实高度提交，最长 2 帧重新贴底、每帧至多一个命令、无反向 `scrollTop`。该几何证据不把像素残影归因为字符阈值。 |
| 本次验证范围         | 定向 hook test、Chrome 回归与 `git diff --check`            | 48 码点早刷、滚动策略和输出几何均已复验；残影和高压快速流体验另立验证。                                                                                                                                   |
| Final decision       | D024                                                        | 保留字符阈值与 hook 测试，同时保留 40ms 合并、代码围栏路径和既有滚动策略                                                                                                                                  |

浏览器 fixture 覆盖跨动画帧到达的大 delta，不调用真实 DeepSeek API；它证明渲染与回底的时序积压，但不能单独证明某一帧像素残影的 GPU 根因。浏览器覆盖 Chromium；Safari/iOS 真机未运行。Next production build 已由下方最终收口审计完成。

## 2026-09-07 Final Release Candidate Audit

本轮以当前 canonical workspace 收敛：`.specify/feature.json` 仍指向本目录，`tasks.md` 没有未勾选任务，spec、plan、data model、contract、decision、acceptance 与公开版本文档均采用 D024 的“保留 48 码点早刷”结论。没有新增收敛任务。

| Gate                   | Evidence                                                     | Result                                                                                                        |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Workspace typecheck    | `pnpm typecheck`                                             | 7 tasks successful / 7 total                                                                                  |
| Workspace lint         | `pnpm lint`                                                  | 5 tasks successful；0 errors，8 个既有 warning                                                                |
| Stable regression      | `pnpm test:stable`                                           | webapp 167 files / 1174 tests、desktop 14 files / 103 tests、PAS 8 tests 全部通过                             |
| Integration regression | 本地开发 PostgreSQL 下 `pnpm test:integration`               | database 2、webapp 30、desktop Playwright 20 tests 全部通过                                                   |
| Production build       | `pnpm build`                                                 | workspace boundary 验证通过；4 个 build task successful、1 个 cache hit；Next optimized production build 完成 |
| Scroll geometry        | `node apps/webapp/tests/browser/chat-scroll-regression.mjs`  | 21 scenarios passed；慢速最长 3 帧、快速最长 2 帧重新贴底；快速每帧至多一个命令、无反向滚动                   |
| Integrity and converge | `git diff --check`、未勾选 task 搜索、Spec Kit prerequisites | 无 whitespace error、无未完成 task；仅有 `chat-message-viewport.md` 的 CRLF 规范化 warning                    |

像素残影尚缺可重复的视觉回归证据，按 D024 之外的独立体验优化处理；Qwen external smoke 仍受账号免费额度耗尽限制。两者不改变本轮代码、自动化、构建和几何回归的通过结论。
