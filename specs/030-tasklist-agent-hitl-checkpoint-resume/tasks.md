# 任务 030：v0.3.0 Completed Baseline

状态：Completed Baseline
版本：v0.3.0
归档日期：2026-06-27

## P0 契约与回归基线

- [x] 明确 v0.3.0 只作用于 `/tasklist + @docs://versions/*.md`。
- [x] 明确普通聊天、Skill、Tool Calling、MCP 不受 HITL 影响。
- [x] 固化 Strategy Review decision schema。
- [x] 固化 Tasklist Revision Review decision schema。
- [x] 固化 `agent-interrupt` / `agent-resume` stream chunk contract。
- [x] 固化 public DTO 不输出 raw GraphState / raw checkpoint / raw provider error / API Key / session cookie。
- [x] 建立回归基线，保护普通问答、stream、artifact 和 AgentTracePanel。

## P1 Prisma AgentRun 与 Durable Checkpointer

- [x] 引入 PostgreSQL 业务表 `AgentRun`。
- [x] 引入 PostgreSQL 业务表 `AgentInterrupt`。
- [x] 用 Prisma 管理业务 schema、migration 和 generated client。
- [x] 将 Prisma 上移为共享 `@ai-mind/database` package。
- [x] 保持 Webapp 拥有 `AgentRunRepository` / `AgentRunService` / session ownership。
- [x] 接入 LangGraph `PostgresSaver` durable checkpoint。
- [x] 保持 checkpoint tables 由 PostgresSaver 管理，不进入 Prisma schema。
- [x] 明确 `PostgresSaver` 不承担业务 run 查询。
- [x] 明确 `AgentRun` 不保存 raw checkpoint。

## P2 Graph HITL 与两轮修订

- [x] Strategy Review 必停。
- [x] Strategy 支持 `approve / edit / reject / respond`。
- [x] `respond` 最多重新生成一次。
- [x] 第二次 Strategy Review 不再允许 `respond`。
- [x] review node 保持无副作用。
- [x] Tasklist Revision Review 只在 `warningDisposition.fixNow.length > 0` 时触发。
- [x] Tasklist Revision Review 不以 `validation.status === "warning"` 触发。
- [x] Tasklist Revision Review 每个 run 最多一次。
- [x] 最多两轮受控 tasklist 修订。
- [x] 用户 edit 计入 revision budget。
- [x] 第二轮修订自动执行，不再次 interrupt。
- [x] 最多生成 `v3`，不生成 `v4`。
- [x] 两轮后仍失败输出 blocked artifact。
- [x] blocked artifact 对应业务 run completed + blocked result status。

## P3 API / Stream / Frontend

- [x] 新增 `POST /api/agent-runs/[runId]/resume`。
- [x] resume 前校验 session ownership。
- [x] resume 前执行 duplicate resume fail closed。
- [x] resume 前执行 version mismatch fail closed。
- [x] resume 使用同一 threadId 和 LangGraph Command resume。
- [x] resume 继续更新原 assistant message。
- [x] pending interrupt 期间锁定普通 Composer。
- [x] 审核卡支持 strategy review 和 tasklist revision review。
- [x] stream reducer 消费 `agent-interrupt` / `agent-resume`。
- [x] 刷新不恢复 pending HITL；刷新后用户需要重新发起 `/tasklist`。
- [x] 保持 AgentTracePanel 和 artifact 展示向后兼容。

## P4 CI / 部署 / 全量验证 / 版本资产

- [x] 执行 webapp tests / typecheck / lint / build。
- [x] 执行 stream-core tests / typecheck / build。
- [x] 执行 database generate / validate / integration test。
- [x] 验证 Docker build、DB setup、webapp health / page smoke。
- [x] 更新 v0.3.0 public version doc。
- [x] 更新 v0.3.0 public release note。
- [x] 更新 v0.3.0 public tasklist。
- [x] 更新 private-folder release、runtime、architecture 版本资产。
- [x] 执行 `git diff --check`。
- [ ] 浏览器级 HITL smoke 因当前自动化环境安全策略阻止访问本地目标，需要人工复验。

## 基线规则

后续版本修改 v0.3.0 baseline 的任意边界时，必须先更新本目录 spec，并判断是否需要新增或更新 ADR。
