# 验收 030：v0.3.0 Released Baseline

状态：Released Baseline
版本：v0.3.0
归档日期：2026-06-27

## HITL 行为验收

- [x] `/tasklist + @docs://versions/*.md` 会进入 Tasklist Agent Graph Runtime。
- [x] Strategy Review 必定暂停。
- [x] Strategy Review 支持 `approve / edit / reject / respond`。
- [x] Strategy `respond` 最多重新生成一次。
- [x] 第二次 Strategy Review 不允许 `respond`。
- [x] Tasklist Revision Review 只在 `warningDisposition.fixNow.length > 0` 时出现。
- [x] `validation.status === "warning"` 本身不触发 Tasklist Revision Review。
- [x] Tasklist Revision Review 每个 run 最多一次。
- [x] 最多两轮受控修订，最多形成 `v1 -> v2 -> v3`。
- [x] 不生成 `v4`。
- [x] 两轮后仍失败时输出 blocked artifact。

## Persistence / Resume 验收

- [x] AgentRun / AgentInterrupt 由 Prisma 业务表记录。
- [x] LangGraph checkpoint 由 PostgresSaver 记录。
- [x] AgentRun 不保存 raw checkpoint。
- [x] PostgresSaver 不承担业务 run 查询。
- [x] resume 使用同一个 threadId。
- [x] resume 通过 `new Command({ resume: decision })` 继续 graph。
- [x] resume 后继续更新原 assistant message。

## Duplicate Resume 验收

- [x] 同一个 pending interrupt 只能被消费一次。
- [x] 并发 duplicate resume fail closed。
- [x] 已处理、已拒绝或不属于当前 run 的 interrupt 不会被继续 resume。

## Version Mismatch 验收

- [x] `agentVersion` mismatch fail closed。
- [x] `graphVersion` mismatch fail closed。
- [x] v0.3.0 不支持跨版本 checkpoint resume。

## Stream Compatibility 验收

- [x] `agent-interrupt` chunk 可被 stream-core schema 接受。
- [x] `agent-resume` chunk 可被 stream-core schema 接受。
- [x] 新 chunk 不破坏旧 text / artifact / agent-step / error 消费。
- [x] Webapp reducer 能把 resume 流指回原 assistant message。

## UI 状态验收

- [x] pending interrupt 期间普通 Composer 禁用。
- [x] 用户只能通过审核卡提交受控 decision。
- [x] reject 后 run 进入受控拒绝收口。
- [x] resume 中和失败状态有明确 UI 状态。
- [x] 页面刷新不恢复 pending HITL，用户需要重新发起 `/tasklist`。

## Security Boundary 验收

- [x] API / stream 不输出 raw GraphState。
- [x] API / stream 不输出 raw checkpoint。
- [x] API / stream 不输出 raw provider error。
- [x] API / stream 不输出 raw Prisma error。
- [x] API / stream 不输出 API Key。
- [x] API / stream 不输出原始 session cookie。
- [x] API / stream 不输出 provider config、internal prompt 或 sensitive env。

## Regression 验收

- [x] 普通聊天不受影响。
- [x] reader-skill 不受影响。
- [x] utility-skill 不受影响。
- [x] Tool Calling 不受影响。
- [x] MCP Resource / Prompt / Tool 不受影响。
- [x] AgentTracePanel 保持向后兼容。
- [x] Artifact 展示保持向后兼容。

## Database / Checkpoint 验收

- [x] Prisma generate / validate / migration 检查已纳入 v0.3.0 验证。
- [x] database integration test 已覆盖 AgentRun / AgentInterrupt 业务表。
- [x] PostgresSaver setup 已通过部署链路验证。
- [x] `@ai-mind/database` package 边界已收口。

## Browser Smoke 状态

v0.3.0 release note 记录：自动化 tests、typecheck、lint、build、stream-core、database、Docker build、DB setup、webapp health / page smoke 已通过。

浏览器级 HITL smoke 在当时 Codex 内置浏览器环境中被本地目标访问安全策略阻止，因此需要人工复验或在允许访问的浏览器环境中补验。该项不应被后续文档误写成“已自动完成”。
