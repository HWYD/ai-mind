# 受控 Agent Runtime

## 摘要

AI Mind 的 Agent Runtime 以“受控单 Agent”为起点。

当前 Agent 不是通用智能体，也不是让模型自由规划再执行的开放式 Agent。它是 Runtime 中一条明确触发、明确约束、明确停止的执行路径。

`v0.1.0` 的第一个 Agent 是 `Version Plan to Tasklist Agent`，用于把用户显式引用的版本方案转换成 tasklist 草稿。

`v0.1.1` 在这条路径上加入 `Controlled Planner Lite`：Agent 可以在 Runtime 白名单 action 中做一次有限决策，但仍然不能自由读取资源、自由调用工具、写入文件或循环规划。

`v0.2.0` 将这条受控路径的编排层迁移到 LangGraph `StateGraph`。`v0.2.3` 后 `/tasklist + @demo://version-plans/*.md` 固定走 Graph Runtime，不再保留 legacy runner 或 runtime switch。

`v0.2.4` 后，Tasklist Agent 内部运行态以 GraphState 作为事实源。`v0.3.0` 在这条受控 graph 上新增 Strategy Review、Tasklist Revision Review、AgentRun 业务状态和 LangGraph Postgres checkpoint resume。

## Agent 的边界

当前 Agent 必须满足明确入口：

```text
/tasklist + @demo://version-plans/*.md
```

这意味着：

- 用户必须显式选择任务意图。
- 用户必须显式引用版本方案。
- Agent 不自动扫描 `examples/agent-demo/version-plans/`。
- Agent 不自动发现最新版本方案。
- Agent 不读取历史 tasklist。
- Agent 不写入项目文件。

## Runtime-controlled Path

Agent 的主路径由 Runtime 控制：

```text
read_resource
  -> plan_extract
  -> evaluate_plan_readiness
  -> planning_decision
  -> optional read_optional_context
  -> decide_tasklist_strategy
  -> strategy_review interrupt
  -> draft_tasklist v1
  -> validate_tasklist_structure
  -> decide_warning_disposition
  -> optional tasklist_revision_review interrupt
  -> optional revise_tasklist v2
  -> optional validate_tasklist_structure
  -> optional revise_tasklist v3
  -> optional validate_tasklist_structure
  -> evaluate_revision_effect
  -> final_answer
  -> text artifact delivery
```

模型只在受控节点产出 action、strategy、草稿或修正文稿。

Runtime 负责：

- 判断是否进入 Agent。
- 校验资源边界。
- 控制状态转移。
- 限制最大步数和最大修正次数。
- 限制 Planning Decision 的 action schema。
- 限制 optional context 白名单和读取次数。
- 执行结构质量门。
- 输出最终回答。

`v0.2.3` 后，Tasklist Agent 固定使用 LangGraph `StateGraph` runner。

这个固定路线只影响 tasklist Agent，不影响普通问答、docs summary、Tool Calling、Reader Skill 或 Utility Skill。项目不提供前端 runtime switch，也不做运行中 fallback。

## GraphState

GraphState 是 Tasklist Agent 内部运行态事实源。

当前保存的信息包括：

- 显式引用的 version plan。
- `planExtract`。
- `PlanReadinessResult`。
- `PlanningDecisionAction`。
- `TasklistStrategy`。
- optional context 读取摘要。
- `tasklistDraft v1`。
- `tasklistDraft v2`。
- `tasklistDraft v3`。
- 结构校验结果。
- `WarningDisposition`。
- `RevisionEffectResult`。
- 自动修正次数。
- HITL review decision。
- graph route / patch summary。

当前不做：

- 重新引入旧 AgentState adapter。
- 双状态模型。
- 在 GraphState 中保存数据库 client、request、writer、raw Error、raw checkpoint、API Key、session cookie、AgentRun 数据库整行或 AgentInterrupt 数据库整行。
- Agent Trace 数据库。
- 跨轮记忆。
- 自动写文件。

Graph nodes 直接读取 GraphState 分区并返回 GraphState patch。业务 run 状态由 `AgentRun` / `AgentInterrupt` 管理，LangGraph checkpoint 状态由 PostgresSaver 管理，二者不能混成同一层。

## Tool Boundary

Agent 可以使用 Tool，但 Tool 暴露范围必须受控。

`validate_tasklist_structure` 虽然注册在 Tool Registry 中，但它默认不进入普通 Skill 的模型可见工具集合。

当前只在 Tasklist Agent scope 中允许调用。

这样可以避免“注册了一个工具，就在所有聊天场景里暴露给模型”的问题。

## Resource Boundary

当前 public Tasklist Agent 只把用户显式引用的 `demo://version-plans/*.md` 作为必读事实来源。

可选上下文读取也受限制，不等同于开放文件访问。

`v0.1.1` 只允许在 draft 前最多补读一个白名单资源：

- `demo://governance/delivery-boundaries.md`
- `demo://governance/engineering-rules.md`
- `demo://rubrics/plan-rubric.md`
- `demo://rubrics/task-rubric.md`
- `demo://rubrics/review-rubric.md`
- `project://latest-context`

public demo resource 现在遵守 `demo://...` 边界，MCP 或 Agent 都不能绕过这一层去读取任意源码、配置文件或真实项目目录。

## Agent Trace

Agent 执行过程通过流式 step 事件展示：

- `agent-step-start`
- `agent-step-end`

前端通过 `AgentTracePanel` 聚合展示同一次 Agent run 的多个 step。

`v0.2.0` 后，graph runtime 还可以输出受控 graph events：

- node start / end。
- route。
- state patch summary。
- debug summary。

它的目标不是完整调试台，而是让用户和开发者知道：

- Agent 做到了哪一步。
- 哪一步读了资源。
- 哪一步调用了工具。
- 做出了什么受控 decision。
- 使用了什么 tasklist strategy。
- 是否发生了修正。
- 修正是否有效。
- 最终是否输出结果。

面板只展示摘要，不展示完整 action JSON、prompt、完整 GraphState、raw checkpoint、resource 原文、tool raw output 或 draft diff。项目不直接透传 LangGraph 原始 debug stream。

## Agent Text Artifact

`v0.1.1` 后，最终 tasklist 正文不再作为普通 assistant text 的一部分输出。

Runtime 会在 `final_answer` 阶段输出通用 text artifact：

- `artifact-start`
- `artifact-delta`
- `artifact-end`

前端用 `AgentTextArtifactPanel` 展示最终 tasklist Markdown 正文，普通 text 只展示结构校验、修正效果和人工复核点摘要。

这个设计保持了两个边界：

- 过程归 `AgentTracePanel`，产物归 `AgentTextArtifactPanel`。
- Artifact 只是最终交付展示，不提供持久化、编辑、下载或 diff。

## Checkpoint、Resume 与 Debug

`v0.2.0` 支持 development-only memory checkpoint，用于验证 LangGraph checkpointer 接入方式。

`v0.3.0` 后，Tasklist Agent 在受控 HITL 路径中接入 LangGraph PostgresSaver durable checkpoint：

- PostgreSQL durable checkpoint 只服务 `/tasklist + @demo://version-plans/*.md` 的 resume。
- `AgentRun` / `AgentInterrupt` 记录业务状态。
- PostgresSaver 记录 LangGraph checkpoint。
- Prisma schema 不管理 checkpoint tables。
- resume 使用同一个 `threadId`。
- duplicate resume 和 version mismatch 都 fail closed。

Debug Summary 也默认关闭，只在服务端开启后输出白名单字段，例如 runId、threadId、当前节点、最近 route、readiness status、validation status / score 和 step limits。

当前仍然不做：

- pending HITL refresh recovery。
- Run History。
- replay / Time Travel。
- state edit。
- history list。
- 完整 GraphState 调试台。

## Image Generation Agent

v0.4.12 的 `/image` 是独立的受控 Agent 入口，不经过普通聊天的 Composer Context、Skill、Tool Calling、direct answer 或 final-turn memory 写入。API route 完成显式命令解析、StreamRun 和 active lease 后，经 `chat-service` 调用 `ImageGenerationRunCoordinator`。

图片规划使用独立 LangGraph `StateGraph`：`ImageBrief -> PromptDraft -> PromptInspect -> optional PromptRevision -> PromptInspect -> terminal`。它不提供开放式循环、checkpoint、resume 或 HITL；GraphState 只保存 JSON-serializable 的领域状态，Provider、Prisma、writer、AbortSignal 和 secret 均留在 Coordinator/runtime 边界。

该 Agent 的总上限是五次规划模型调用、一次 Prompt 修正和一次图片生成。前端只消费安全 ImageBrief、进度、耗时、同源临时结果路径和公共错误，不消费 Prompt、检查细节、Provider URL 或图片字节。

详见 [Image Generation Agent Architecture](./image-generation-agent.md) 与 [ADR-0016](../adr/0016-controlled-image-generation-agent.md)。

## Design Principle

AI Mind 的 Agent 演进遵循一个原则：

> 先让 Agent 在一个明确场景里可触发、可约束、可观察、可停止，再逐步讨论更开放的规划和执行能力。

因此，当前 Agent Runtime 更强调工程边界，而不是一开始追求通用自动化。
