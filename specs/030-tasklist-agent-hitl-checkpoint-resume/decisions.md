# 决策 030：v0.3.0 Released Baseline

状态：Released Baseline
版本：v0.3.0
归档日期：2026-06-27

## D030-01：不支持刷新恢复 pending HITL

v0.3.0 不支持刷新后自动恢复 pending HITL card。

原因：如果不能同时重建原 assistant message、trace、artifact、stream 状态和审核上下文，只恢复一张孤立审核卡会制造更高的状态风险。

后续如实现 pending HITL recovery，至少是 Change Level C；如果改变 checkpoint / resume 语义，则是 Change Level D。

## D030-02：Prisma 只管理业务表

Prisma 负责 `AgentRun` / `AgentInterrupt` 业务状态、migration、generated client 和 database scripts。

Prisma schema 不管理 LangGraph checkpoint tables。

## D030-03：PostgresSaver 只管理 checkpoint

LangGraph `PostgresSaver` 负责 checkpoint tables 和 graph resume 所需的 runtime 状态。

`PostgresSaver` 不承担业务 run 查询，不替代 `AgentRunService`。

## D030-04：Review Node 必须无副作用

review node 只允许构建 JSON-serializable payload、调用 `interrupt(payload)`、解析 resume decision、返回 GraphState patch。

review node 不调用模型、工具、资源、数据库、writer 或文件系统。

## D030-05：Pending Interrupt 期间禁用 Composer

pending interrupt 期间禁用普通 Composer，用户只能通过审核卡提交受控 decision。

原因：避免同一会话中同时出现普通用户输入和 HITL decision，导致 run 状态、message tree 和 stream ownership 混乱。

## D030-06：Tasklist Revision Review 不是最终 Draft Approval

Tasklist Revision Review 只用于修订前授权，不是完整最终稿审批。

最终稿仍通过 artifact 输出，由用户自行复制、保存或后续流程处理；v0.3.0 不自动写文件。

## D030-07：最多生成 v3，不生成 v4

修订预算固定为最多两轮，用户 edit 也计入预算。

这样可以避免 tasklist 修订进入不受控循环，并让失败收口可预测。

## D030-08：不实现 Run History / Time Travel / Replay / 多人审批 / 通用 Tool 审批

这些能力都需要更完整的数据模型、事件模型、前端恢复策略或权限模型。

v0.3.0 只验证 Tasklist Agent 的最小 durable HITL resume。

## D030-09：不把 HITL 扩展到普通聊天、Skill、Tool、MCP 或其他 Agent

HITL 能力只绑定 Tasklist Agent 的受控 graph runtime。

普通聊天、reader-skill、utility-skill、Tool Calling、MCP Resource / Prompt / Tool 都不进入本版 HITL 流程。
