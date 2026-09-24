# ADR-0019: General ReAct Agent Runtime Boundary

## Status

Accepted in v0.6.0; the fixed Action + Answer projection is superseded by v0.6.1.

## Context

普通 `routeType=chat` 需要统一进入一个受控的 ReAct 决策闭环，同时保留 Tasklist、Delivery Chain 和 Image Agent 的专用 runtime。实现必须继续遵守 `route -> chat-service facade -> runtime` 分层、public DTO 安全边界和现有可恢复 stream contract。

## Decision

- 使用 LangChain v1 `createAgent({ version: 'v2' })` 作为 generic loop；AI Mind 只通过 typed state/context、policy middleware、Tool Runtime adapter 和 stream adapter 约束权限、预算、错误和可见性。
- Generic Agent 的 state 只存在于当前 Run，不接 checkpointer、HITL、AgentRun 或新的持久化表。
- `GeneralToolPolicy` 固定解析 `web-search`、`read-url`、`calculator`、`datetime`、`text-transform`、`unit-convert`、`city-weather`；Skill 只提供系统提示词/输出风格，不拥有 Tool/MCP 权限，也不触发隐式 context。remote MCP Tool 不 discovery，`agent-tool/delegated-agent` 明确排除在 generic effective tools 之外。
- Web Tool 的 provider 是 server-only 部署配置：`AI_MIND_WEB_PROVIDER` 静态选择 Tavily 或智谱，智谱固定 Search-Std；模型、Skill、请求 DTO、stream、Trace 和 Memory 都不能选择或看到 provider。缺少所选 key 或配置非法时 Tool 不可用，不自动 failover；现有 Tool Runtime timeout/retry/budget/URL/secret 边界不变。
- 每个 Node.js 进程最多 8 个 active generic Run；无 permit 时 fail-fast。单 Run 最多 6 个携带 Tool 的 Action rounds、9 logical Tool Calls、7 次 Action model calls 与固定预留的 1 次 Answer model call（总计 8）、145s Action cutoff、180s hard deadline、Answer 最多 30s、lifecycle reserve 5s、Tool concurrency 3 和 Run retry 4。
- StreamEvent 使用 PostgreSQL-first persist-before-publish。首个 final text delta 立即 flush，后续按 40ms 或 256 chars microbatch；每 Run projection queue 为 64 items/256KiB 高水位、32 items/128KiB 低水位。
- 浏览器最终文本默认使用 20ms timer + 最近 `requestAnimationFrame` 的 ref-backed buffer；仅已评估 token 粒度与 Markdown 渲染成本的 `ChatModel` 可通过受控 allowlist 覆盖 timer 窗口，且不能绕过 rAF、code-fence early flush 或 terminal flush。
- General ReAct 的 public lifecycle 使用最小 `agent-run-start/end` 并投影为 `AgentRunPart(type='agent-run')`；Tasklist 等专用 LangGraph Agent 保留 `agent-graph-*`/`AgentGraphPart(type='agent-graph')`。`agentName` 只作专用 Graph metadata，不参与 UI 路由。
- Dynamic MCP schema 必须 strict，public formatter 不回退 raw data；General ReAct adapter 传播 Tool Runtime `AbortSignal` 并关闭 MCP client session recovery，避免隐藏 retry。
- `createAgent` 只拥有私有的 Action Tool loop：其所有文本、reasoning 与 metadata 均不得公开或持久化，也不得作为 Answer 输入。除显式取消或 hard deadline 外，Action outcome 固定进入一次使用同一 resolved model selection 的未绑定 Tool Answer；Answer 仅接收用户问题、可靠 observation、安全来源和 stop reason，只有其安全 delta 可以作为最终 `text-*` 流。Answer 的 Tool Call 必须 fail-closed；正常空白 Answer 可 fallback，provider/tool-contract/partial-stream error 必须 failed 收口而不追加 fallback。
- Action 与 Answer 的 system prompt 采用独立投影。Action-only 的 Tool 选择、调用、重试和后续行动指令不得进入 Answer；Answer 使用 server-owned 的真实用户回答基线与可信 Skill 输出风格，普通问题结论优先且解释适中，用户直接的长度/格式请求可在安全边界内覆盖默认。Web、Tool observation、Resource/Prompt 内容中的嵌入指令均是不可信资料，不能改变回答策略、Tool 权限、授权 URL、预算或数据访问范围。
- Run-local budget 与 Memory provenance：Chat Memory/history 仅是模型上下文，不得参与本次 Run 预算；Runner 只扫描本 Run 新增消息，并返回明确的 `memoryWriteEligible`。取消、hard deadline、Answer Tool contract/provider/partial-stream failure 与执行状态未知均不得写入成功 Memory；只有成功完成的 Answer 或正常空白 Answer 的非空 deterministic fallback 才可能符合既有写入条件。
- StreamRun 终态在 append 与 replay 两侧都 fail-closed：terminal 必须是最后 sequence，`terminalSequence === lastSequence`，终态 status、envelope metadata 与 payload 类型必须一致。

## Consequences

Generic chat 获得一致的上下文、工具和错误语义，重连可从 durable StreamEvent 回放，慢数据库通过 awaitable backpressure 保持事件顺序。运行时不会跨请求恢复 Agent state，也不会在多进程间协调 8-run capacity；需要这些能力时必须另行决策。

## v0.6.1 Supersession

The v0.6.0 bullets that require a fixed, Tool-free Answer model call and ordinary `text-*` final stream no longer apply to General ReAct. v0.6.1 keeps the `createAgent` middleware control plane and all existing Tool safety boundaries, while changing text authority as follows:

- A natural no-Tool, non-empty loop turn becomes `AgentTextPart(final_answer)` in the same model call.
- A Tool-bearing turn’s public text becomes `AgentTextPart(commentary)` before Tool dispatch; no nested Tool detail is introduced.
- `pending` is client-derived from start/end, not a server authority.
- Visible pending/commentary/final text shares the body Markdown renderer without a process icon; existing Trace detail keeps pending/commentary and Tool rows in source order, a safe read source list remains the owning Tool's direct child, and final text remains outside Trace.
- A constrained Tool-free finalizer is abnormal-only, limited to one call, and its completed Run explicitly carries `finalizationMode=constrained`.
- `normal` provenance is required for long-term Memory; constrained output remains final-only same-session context and local safe snapshot content.
- A model-declared, known ToolCall that is rejected before provider execution is still public-auditable: Runtime emits the existing `tool-start` followed by same-part tool-scope `error`, both with fixed safe fields. It means the request was not executed, never a completed Tool or read source; raw arguments, URL/query, secret, fingerprint and internal error stay private.
- URL provenance is an automatic server safety scope, not a user click prompt. Current user URLs and at most eight re-canonicalized URLs from same-conversation server raw user turns are read candidates. Summary, assistant text, Tool result, UserMemory and client history are never grant sources. The catalog cannot prove a prior Run executed or read a page, so historical-read questions fail closed rather than triggering automatic rereads.

The fixed budgets are 9 Tool-bearing rounds, 14 logical Tool Calls, 10 loop calls, one constrained finalizer, 11 total calls and a 270-second hard limit. Existing Tool concurrency, Tool retry and per-profile timeout rules remain unchanged.

## Verification

v0.6.1 已以 canonical workspace 的 contract、runtime、projection、durable replay、Memory、Trace/UI 和 regression tests 记录自动化证据。2026-09-23 的本地 release closing 因 pre-execution Tool transcript truth gap 已重新打开；真实 provider/browser/Pencil 矩阵、完整 regression 与新的 release gate 以 `specs/v0.6.1-general-react-agent-streaming/acceptance.md` 为准，不得将历史 task/phase 编号当作当前验收事实。
