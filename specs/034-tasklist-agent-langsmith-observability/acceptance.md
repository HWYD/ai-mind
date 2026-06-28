# Acceptance 034：Tasklist Agent LangSmith Observability Integration

状态：已完成
版本：v0.3.4
日期：2026-06-29

## 配置验收

- `apps/webapp/.env.example` 包含 LangSmith 最小配置说明。
- `deploy/env/webapp.production.env.example` 包含生产启用 LangSmith 所需的最小配置说明。
- 配置项只包含：
    - `LANGSMITH_TRACING`
    - `LANGSMITH_API_KEY`
    - `LANGSMITH_PROJECT`
- 不新增 `AI_MIND_LANGSMITH_ENABLED`。
- `LANGSMITH_ENDPOINT` 不作为默认主配置；如需说明，只出现在 docs 的可选自托管说明中。
- `LANGSMITH_TRACING=false` 时 Tasklist Agent 正常执行且不创建 LangSmith trace。
- `LANGSMITH_TRACING=true` 但 `LANGSMITH_API_KEY` 缺失时 Tasklist Agent 正常执行且不创建 LangSmith trace。

## Tasklist Agent 范围验收

- 只有 `/tasklist + @docs://versions/*.md` 触发 LangSmith observability。
- 普通聊天不触发本版本新增的 LangSmith Tasklist trace。
- reader-skill 不触发本版本新增的 LangSmith Tasklist trace。
- utility-skill 不触发本版本新增的 LangSmith Tasklist trace。
- MCP / Tool Calling 不触发本版本新增的 LangSmith Tasklist trace。
- 不修改 Graph topology。
- 不修改 HITL decision schema。
- 不修改 stream protocol。
- 不修改 frontend reducer。
- 不修改 Prisma schema。
- 不修改 PostgresSaver checkpoint schema。

## Initial Run 验收

- 启用 LangSmith 后，Tasklist Agent initial run 会创建或更新一条可识别的 trace。
- trace metadata 包含：
    - `app`
    - `agentType`
    - `agentVersion`
    - `graphVersion`
    - `runId`
    - `threadId`
    - `assistantMessageId`
    - `versionPlanUri`
    - `modelId`
    - `provider`
    - `reasoningEnabled`
    - `environment`
- trace tags 使用低基数字段，不把 `runId` / `threadId` 放入 tags。

## HITL Interrupt / Decision / Resume 验收

- Strategy Review interrupt metadata 包含：
    - `interruptKind`
    - `interruptId`
    - `reviewRound`
    - `strategyRegenerations`
- Strategy Review human decision metadata 包含 `decisionType`。
- 第二次 Strategy Review 不上传完整 feedback，只上传 decision type 和计数。
- Tasklist Revision Review 只在 `warningDisposition.fixNow.length > 0` 时可能出现，其 trace metadata 包含：
    - `interruptKind`
    - `interruptId`
    - `draftRevision`
    - `fixNowCount`
    - `blockingIssueCount`
    - `weakSectionCount`
- resume metadata 继续使用同一组 `runId`、`threadId`、`assistantMessageId` 做关联。
- reject decision 记录为 rejected lifecycle，不被误标为 failed。

## Result 验收

- graph completed path 记录 `runStatus=completed`、真实 `resultStatus`（`final` / `final_with_manual_review_items` / `blocked`）、`artifactGenerated`、`durationMs`。
- blocked path 记录 `resultStatus=blocked`，不被误标为 failed。
- rejected path 记录 `runStatus=rejected`，不生成 artifact。
- failed path 记录 `failureCode` 和 `sanitizedFailureMessage`。
- failure metadata 不包含 raw Error、raw provider error、raw Prisma error 或 raw GraphState。

## Redaction / Privacy 验收

LangSmith payload 中不得出现：

- 完整 GraphState。
- raw checkpoint。
- raw provider error。
- raw Prisma row。
- API Key。
- session cookie 原值。
- ownerSessionHash。
- provider config。
- request object。
- writer。
- AbortSignal。
- raw Error。
- 完整 version plan 正文。
- 完整 prompt。
- 完整 optional context 正文。
- 完整用户 feedback。
- 完整 tasklist markdown。
- 完整 strategy notes 正文。

必须有测试或 reviewer 可读的白名单实现证明：

- 上传字段来自 explicit allowlist。
- decision 只上传 type 和摘要计数。
- failure 只上传 code 和 sanitized message。

## Soft Fail 验收

- LangSmith client 初始化失败不影响 Tasklist Agent。
- LangSmith trace 创建失败不影响 Tasklist Agent。
- LangSmith event update 失败不影响 Tasklist Agent。
- LangSmith flush / end 失败不影响 Tasklist Agent。
- soft fail 不改变 AgentRun status。
- soft fail 不影响 AgentInterrupt pending / decided 状态。
- soft fail 不影响 LangGraph checkpoint resume。
- soft fail 不影响 stream chunk 输出。
- soft fail 不影响 artifact 输出。

## 测试验收

实施完成后至少需要新增或更新：

- LangSmith config parser / resolver 单元测试。
- LangSmith metadata redaction 单元测试。
- Tasklist Agent coordinator initial run observability 测试。
- Tasklist Agent coordinator interrupted observability 测试。
- Tasklist Agent resume observability 测试。
- rejected / blocked / failed result metadata 测试。
- LangSmith disabled / missing API key / SDK failure soft fail 测试。
- 普通聊天不触发 Tasklist LangSmith observability 的回归测试。

最小验证命令建议：

```powershell
pnpm --dir apps/webapp test tests/lib/ai/runtime/version-plan-tasklist-agent-run-coordinator.test.ts
pnpm --dir apps/webapp test tests/lib/ai/runtime/chat-orchestrator.test.ts
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

如果新增测试文件，应按项目测试位置规则同步纳入相关命令。

## 文档验收

- `specs/034-tasklist-agent-langsmith-observability/` 五件套完整。
- ADR-0008 已创建并被 ADR README 引用。
- README 或相关 runtime docs 说明 LangSmith 是可选 observability，不是业务事实源。
- env example 说明如何开启 LangSmith。
- docs 明确说明上传哪些字段、不上传哪些字段。
- release 收口时同步 `docs/versions/`、`docs/releases/`、`docs/tasklists/`。

## 实施前 Gate 验收

进入代码实施前必须完成：

- Clarify gate：确认没有需要用户继续拍板的范围问题。
- Checklist gate：确认 spec requirements 可验收。
- Plan gate：确认实现边界不进入 Graph node、不改协议、不改 DB schema。
- Tasks gate：tasks 能按阶段执行，并能在每个 checkpoint 停下验证。
- Analyze gate：spec / plan / tasks / acceptance / decisions 无明显冲突。

## 验收结论记录

最终收口时需要记录：

- Clarify gate 结论。
- Checklist gate 结论。
- Analyze gate 结论。
- Converge 或人工等价收口结论。
- 哪些测试成功。
- 哪些验证未执行，以及原因。
