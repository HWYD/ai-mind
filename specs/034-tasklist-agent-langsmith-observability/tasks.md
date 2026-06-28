# Tasks 034：Tasklist Agent LangSmith Observability Integration

状态：已完成
版本：v0.3.4
日期：2026-06-29

> 当前文件是 v0.3.4 实施任务计划和完成记录。本版本已完成实现、验证、converge / 人工等价收口和 release assets 同步。

## Phase 1：Setup / Dependency Boundary

**目标**：准备最小依赖和配置入口，不接入业务链路。

- [x] T034-001 确认实现是否需要直接 import `langsmith`；Phase 1/2 不直接 import SDK，暂不新增 direct dependency，Phase 3 接入 SDK 时再处理。
- [x] T034-002 在 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/observability/` 新增最小 observability 模块边界。
- [x] T034-003 新增 LangSmith config resolver，读取 `LANGSMITH_TRACING`、`LANGSMITH_API_KEY`、`LANGSMITH_PROJECT`。
- [x] T034-004 为 config resolver 增加 disabled / missing API key / enabled 单元测试。

## Phase 2：Redaction / Metadata Contract

**目标**：先稳定上传字段白名单，再接 LangSmith SDK。

- [x] T034-005 新增 Tasklist Agent LangSmith metadata 类型和 allowlist builder。
- [x] T034-006 覆盖 initial run metadata：`agentType`、`agentVersion`、`graphVersion`、`runId`、`threadId`、`assistantMessageId`、`versionPlanUri`、`modelId`、`provider`、`reasoningEnabled`、`environment`。
- [x] T034-007 覆盖 HITL metadata：`interruptKind`、`interruptId`、`decisionType`、`reviewRound`、`strategyRegenerations`、`draftRevision`、`fixNowCount`、`blockingIssueCount`、`weakSectionCount`。
- [x] T034-008 覆盖 result metadata：`runStatus`、真实 `resultStatus`（`final` / `final_with_manual_review_items` / `blocked` / `rejected`）、`artifactGenerated`、`durationMs`、`failureCode`、`sanitizedFailureMessage`。
- [x] T034-009 增加 redaction tests，断言 GraphState、checkpoint、raw Error、prompt、feedback、tasklist markdown、API key、session cookie 不会进入 payload。

## Phase 3：LangSmith Observer Adapter

**目标**：封装外部 SDK，保证 soft fail。

- [x] T034-010 实现 Tasklist LangSmith observer：disabled 时 no-op。
- [x] T034-011 实现 enabled 时创建 / 更新 LangSmith trace 或 run 的最小能力。
- [x] T034-012 实现低基数 tags 与高基数 metadata 分离。
- [x] T034-013 捕获 SDK 初始化、trace 写入、flush / end 失败，并转换为 soft fail。
- [x] T034-014 增加 observer soft fail tests，断言不会向调用方抛出 LangSmith 错误。

## Phase 4：Initial / Interrupt / Result Integration

**目标**：接入 Tasklist Agent initial run 和 graph result，不改变 graph 行为。

- [x] T034-015 在 `agent-run-coordinator.ts` 的 `startVersionPlanTasklistAgentRun()` 中接入 initial run metadata。
- [x] T034-016 在 `persistGraphResult()` 的 interrupted 分支记录 interrupt metadata。
- [x] T034-017 在 completed 分支记录 `final` / `final_with_manual_review_items` / `blocked` result metadata。
- [x] T034-018 在 rejected 分支记录 rejected result metadata。
- [x] T034-019 在 failed 分支记录 failed result metadata，只上传 sanitized failure 信息。
- [x] T034-020 更新 coordinator tests，覆盖 initial / interrupted / completed / blocked / rejected / failed observability。

## Phase 5：Resume / Human Decision Integration

**目标**：接入 resume 和 human decision metadata，保持同 thread / 同 assistant message 关联。

- [x] T034-021 在 `resumeVersionPlanTasklistAgentRun()` 的 `beginResume` 后记录 human decision metadata。
- [x] T034-022 在写入 `agent-resume` chunk 前后记录 resume metadata。
- [x] T034-023 确认 resume trace 使用 `runId`、`threadId`、`assistantMessageId` 与 initial run 关联。
- [x] T034-024 覆盖 approve / edit / reject / respond 至少一种 strategy decision observability 测试。
- [x] T034-025 覆盖 Tasklist Revision Review decision observability 测试。
- [x] T034-026 覆盖 resume LangSmith failure 不影响 AgentRun status / stream 的测试。

## Phase 6：Scope Regression

**目标**：证明 v0.3.4 没有误伤其他路径。

- [x] T034-027 更新 `chat-orchestrator.test.ts`，确认普通聊天不触发 Tasklist LangSmith observer。
- [x] T034-028 确认 reader-skill / utility-skill / MCP / ordinary Tool Calling 不接入本 observer。
- [x] T034-029 确认没有修改 stream-core protocol。
- [x] T034-030 确认没有修改 frontend reducer。
- [x] T034-031 确认没有修改 Prisma schema 或 migration。

## Phase 7：Env / Docs

**目标**：让本地和生产都知道如何安全启用。

- [x] T034-032 更新 `apps/webapp/.env.example`，新增 LangSmith 最小配置说明。
- [x] T034-033 更新 `deploy/env/webapp.production.env.example`，新增生产 LangSmith 最小配置说明。
- [x] T034-034 更新 README 或 runtime docs，说明 LangSmith 只用于 Tasklist Agent observability，不是业务事实源。
- [x] T034-035 增加如何在 LangSmith 中用 `runId` / `threadId` / `assistantMessageId` 查找 trace 的说明。
- [x] T034-036 增加上传字段 / 禁止上传字段说明。

## Phase 8：Verification

**目标**：实施后完成最小验证。

- [x] T034-037 运行 Tasklist Agent coordinator 相关测试。
- [x] T034-038 运行 chat-orchestrator 回归测试。
- [x] T034-039 运行 `pnpm --dir apps/webapp typecheck`。
- [x] T034-040 运行 `pnpm --dir apps/webapp lint`。
- [x] T034-041 执行 `git diff --check`。
- [x] T034-042 人工检查 diff 未修改 Graph topology / HITL contract / stream protocol / frontend reducer / Prisma schema。

## Phase 9：Converge / Release Close

**目标**：实现完成后再做 release 收口。

- [x] T034-043 执行 `speckit-converge` 或人工等价收口，确认 tasks 与实际 diff 一致。
- [x] T034-044 同步 `docs/versions/v0.3.4-tasklist-agent-langsmith-observability.md`。
- [x] T034-045 同步 `docs/releases/v0.3.4.md`。
- [x] T034-046 同步 `docs/tasklists/v0.3.4-tasklist.md`。
- [x] T034-047 更新 package version 至 `0.3.4`。
- [x] T034-048 最终记录测试、未执行验证和人工补验项。

## 学习暂停点建议

- **Pause A**：完成 Phase 2 后，学习 metadata allowlist 和 redaction boundary。
- **Pause B**：完成 Phase 3 后，学习 LangSmith observer 如何 soft fail。
- **Pause C**：完成 Phase 5 后，学习 initial / HITL / resume 如何在 trace 中关联。
- **Pause D**：完成 Phase 8 后，做实施后 review，再进入 release assets。

## 最终验证记录

- [x] `pnpm --dir apps/webapp test tests/lib/ai/runtime/version-plan-tasklist-agent-langsmith-observability.test.ts tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts tests/lib/ai/runtime/chat-orchestrator.test.ts`
- [x] `pnpm --dir apps/webapp typecheck`
- [x] `pnpm --dir apps/webapp lint`（通过；保留既有 Fast Refresh warnings）
- [x] `git diff --check`（通过；提示 `apps/webapp/.env.example` 后续 Git touch 时会从 CRLF 规范化为 LF）
- [x] 人工 diff 检查：未修改 Graph topology、HITL decision contract、stream protocol、frontend reducer、Prisma schema / migration。
- 未执行：`pnpm install --frozen-lockfile --offline`。当前执行沙箱无法写入用户目录 pnpm tools cache，申请外部权限时被系统自动拒绝；已通过 `pnpm add --offline` 生成 lockfile，并通过 focused tests / typecheck / lint 验证依赖可解析。

## 人工补验项

- 如果配置真实 `LANGSMITH_API_KEY`，建议在 LangSmith 项目中手动跑一轮 `/tasklist + @docs://versions/*.md`，用 `runId` / `threadId` / `assistantMessageId` 搜索 trace，并确认没有完整 prompt、feedback、tasklist markdown 或 GraphState。
