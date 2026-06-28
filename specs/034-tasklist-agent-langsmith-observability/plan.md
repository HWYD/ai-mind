# Plan 034：Tasklist Agent LangSmith Observability Integration

状态：已完成
版本：v0.3.4
日期：2026-06-29
Spec：[spec.md](./spec.md)

## Summary

v0.3.4 在不改变 Tasklist Agent 业务链路的前提下，为 `/tasklist + @docs://versions/*.md` 增加 LangSmith observability。

推荐技术路线：

- 在 Tasklist Agent coordinator / runner 边界增加一个小型 observability adapter。
- 通过官方 LangSmith env 判断是否启用。
- 只上传显式白名单 metadata。
- LangSmith 失败一律 soft fail。
- 不把 LangSmith trace id 写入数据库，不修改 GraphState、checkpoint、stream 或前端。

## Technical Context

**Language / Runtime**：TypeScript，Next.js App Router，Node.js server runtime。

**Primary Dependencies**：

- 当前已有 `@langchain/core`、`@langchain/langgraph`、`@langchain/langgraph-checkpoint-postgres`。
- 当前 lockfile 中已有 transitive `langsmith@0.5.11`。
- 如果实现直接 import LangSmith SDK，需要在 `apps/webapp/package.json` 显式添加 direct dependency。

**Storage**：不新增存储；AgentRun / AgentInterrupt 继续由 Prisma 管理，checkpoint 继续由 PostgresSaver 管理。

**Testing**：Vitest，现有重点测试位于：

- `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-graph-runner.test.ts`
- `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`

**Target Platform**：webapp server runtime，本地 dev / production compose。

**Performance Goal**：LangSmith adapter 不应显著增加 Tasklist Agent 执行耗时；上报失败不得阻塞主流程。

**Constraints**：

- 不修改 Graph topology。
- 不修改 GraphState shape。
- 不修改 HITL decision contract。
- 不修改 stream protocol。
- 不修改 frontend reducer。
- 不修改 Prisma schema。
- 不修改 PostgresSaver schema。
- 不上传完整 prompt / model IO / tasklist markdown / user feedback。

## Constitution Check

### Controlled Agent First

通过。

LangSmith 只观测 Tasklist Agent，不扩大 Agent 权限，不新增工具调用能力，不改变 `/tasklist + @docs://versions/*.md` 入口。

### GraphState Is Runtime Source of Truth

通过。

本版本不修改 GraphState，不把 LangSmith client、trace object、request、writer、raw Error 或 external trace id 放入 GraphState。

### Review Node Must Be Side-effect Free

通过。

review node 不调用 LangSmith。interrupt / decision observability 由 node 外的 coordinator / runner 负责。

### Business State and Checkpoint Must Stay Separate

通过。

LangSmith 不成为业务状态或 checkpoint 状态。AgentRun / AgentInterrupt 和 PostgresSaver 分工保持不变。

### Stream Compatibility Is a Hard Constraint

通过。

本版本不新增 stream chunk，不修改 stream schema，不修改 reducer。

### Public DTO Must Be Strict and Safe

通过，但需要实现时重点验证。

所有 LangSmith metadata 必须使用 explicit allowlist，不上传 raw runtime internals。

### Minimal Abstraction

通过。

只建议新增一个小型 observability adapter，且它承担明确边界：config、metadata redaction、safe LangSmith call。

### Tests Before Broad Integration

通过。

先测 config / redaction / coordinator soft fail，再接入 runner。

### Spec Drift Must Be Blocked

通过。

如果实现过程中发现必须改 GraphState、stream、DB schema 或前端，需要暂停并更新 spec，而不是顺手扩大范围。

### Official Spec Kit Skills Are Tooling Entry, Not Source of Truth

通过。

本 plan 使用 official full skills / 人工等价流程产出规格资产，真实事实仍以 specs / ADR / code / tests 为准。

## Current Code Baseline

真实代码确认：

- Tasklist Agent 入口在 `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`。
- initial run coordinator 在 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/agent-run-coordinator.ts` 的 `startVersionPlanTasklistAgentRun()`。
- resume coordinator 在同文件的 `resumeVersionPlanTasklistAgentRun()`。
- graph runner 在 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/run-version-plan-tasklist-graph.ts`。
- AgentRun / AgentInterrupt 持久化通过 `AgentRunService`。
- 当前没有显式 LangSmith integration。
- 当前 `langsmith` 仅作为 transitive dependency 出现在 lockfile。

## Target Architecture

```text
chat-orchestrator
  -> startVersionPlanTasklistAgentRun
       -> create AgentRun
       -> TasklistLangSmithObserver.startInitialRun(metadata)
       -> runInitialVersionPlanTasklistGraph
       -> persistGraphResult
            -> interrupted: create AgentInterrupt + observe interrupt
            -> completed: markCompleted + observe result
            -> rejected: markRejected + observe result
            -> failed: markFailed + observe result

resume API / chat-service
  -> resumeVersionPlanTasklistAgentRun
       -> beginResume
       -> observe human decision + resume
       -> write agent-resume chunk
       -> resumeVersionPlanTasklistGraph
       -> persistGraphResult
            -> interrupted / completed / rejected / failed
```

`TasklistLangSmithObserver` 是边界适配层：

- 读取 env 并判断 enabled。
- 构造 tags。
- 构造白名单 metadata。
- 捕获 LangSmith SDK 错误并 soft fail。
- 不接收 raw GraphState / raw checkpoint / raw decision / raw Error。

## Recommended File Changes

### Runtime config / adapter

- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/observability/langsmith-config.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/observability/tasklist-langsmith-observer.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/observability/tasklist-langsmith-metadata.ts`

是否拆成多个文件以实现时实际复杂度为准；如果 adapter 很小，可以合并，避免过度抽象。

### Integration points

- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/agent-run-coordinator.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/graph/run-version-plan-tasklist-graph.ts`（仅在确需 runner-level duration/result 时小改；优先让 coordinator 负责）
- `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`（如需要传入 provider / environment metadata）

### Env / docs

- `apps/webapp/.env.example`
- `deploy/env/webapp.production.env.example`
- `README.md` 或 `docs/architecture/` 中的 observability 说明
- release 收口阶段再同步 `docs/versions/`、`docs/releases/`、`docs/tasklists/`

### Tests

- `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-langsmith-observability.test.ts`
- `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts`
- `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`

## Observability Metadata Design

### Tags

低基数字段：

- `ai-mind`
- `tasklist-agent`
- `hitl`
- `initial` / `resume`
- `completed` / `blocked` / `rejected` / `failed`
- `dev` / `production` / `demo`

### Metadata

高基数字段和摘要字段：

- `runId`
- `threadId`
- `assistantMessageId`
- `interruptId`
- `versionPlanUri`
- `modelId`
- `provider`
- `reasoningEnabled`
- `reviewRound`
- `strategyRegenerations`
- `draftRevision`
- `fixNowCount`
- `blockingIssueCount`
- `weakSectionCount`
- `durationMs`
- `failureCode`
- `sanitizedFailureMessage`

## Implementation Phases

### P0：Spec / ADR / Gate 准备

完成 `specs/034...` 五件套、ADR-0008、实施前 analyze gate。

### P1：Config 与 Redaction 基础

新增最小 LangSmith config resolver、metadata allowlist、redaction tests。

### P2：Observer Adapter

实现 safe observer，封装 LangSmith SDK 调用和 soft fail。

### P3：Initial / Interrupt / Result 集成

在 Tasklist Agent coordinator 中接入 initial run、interrupt、completed / blocked / rejected / failed metadata。

### P4：Resume / Human Decision 集成

在 resume coordinator 中接入 human decision、resume metadata，并保证 reject / failed 分支正确分类。

### P5：Docs / Env / Regression

同步 env example、docs、测试、typecheck、lint。

### P6：Converge / Release Assets

实现完成后执行 converge 或人工等价收口，确认 non-goals 没被突破，再同步公开 docs 和版本号。

## Risks

### 自动 tracing 误上传 prompt / model IO

这是最大风险。

规避：

- v0.3.4 采用 sanitized metadata-first。
- 不默认开启会捕获完整输入输出的全量 tracing。
- 测试和 docs 明确禁止字段。

### LangSmith SDK 失败影响主流程

规避：

- observer 所有外部调用都 soft fail。
- 不在 review node 内调用 LangSmith。
- 不让 trace failure 改变 AgentRun status。

### metadata 字段膨胀

规避：

- 白名单控制。
- tags / metadata 分层。
- 后续要新增字段必须经过 spec / decision 更新。

### 误把 LangSmith 当业务事实源

规避：

- 不保存 trace id 到 DB。
- 不用 LangSmith 决定 resume、status 或 artifact。
- docs 明确 LangSmith 只是观测层。

## Out-of-scope Validation

因为本版本不改 frontend / stream / DB schema，以下不是最小实施验收：

- 前端 reducer e2e。
- browser smoke。
- database migration integration test。
- stream-core protocol migration test。

但普通聊天不受影响、Tasklist Agent coordinator tests、typecheck、lint 仍属于最小回归。
