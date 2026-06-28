# Contract 034：LangSmith Observability Metadata

状态：已完成
版本：v0.3.4
日期：2026-06-29

## Contract Scope

这是 v0.3.4 Tasklist Agent LangSmith observability 的内部契约。

它不是 HTTP API contract，不是 stream protocol，也不是数据库 schema。

## Enabled Contract

LangSmith Tasklist observability 仅在以下条件同时满足时启用：

```text
LANGSMITH_TRACING === "true"
LANGSMITH_API_KEY is non-empty
```

否则视为 disabled。

Disabled 状态下：

- 不创建 LangSmith client。
- 不创建 trace。
- 不影响 Tasklist Agent。
- 不抛出用户可见错误。

## Event Contract

v0.3.4 允许记录以下 lifecycle event：

```text
tasklist.initial.started
tasklist.interrupt.created
tasklist.human_decision.received
tasklist.resume.started
tasklist.result.final
tasklist.result.final_with_manual_review_items
tasklist.result.blocked
tasklist.result.rejected
tasklist.result.failed
```

事件名可以在实现时按 LangSmith SDK 推荐方式映射为 run name / child run / metadata update，但语义必须保持一致。

## Required Correlation Metadata

每条 trace 或 event 必须尽量带上：

```text
runId
threadId
assistantMessageId
agentType
agentVersion
graphVersion
```

如果某个异常早于某字段可用，应上传已知字段并保持 soft fail。

## Required Redaction Rule

实现必须采用 allowlist。

允许字段没有列入 allowlist，则默认不得上传。

## Forbidden Payload Examples

以下内容即使在 debug 环境也不得上传：

```text
graphState
checkpoint
rawError
providerError
prismaRow
prompt
modelInput
modelOutput
versionPlanContent
userFeedback
tasklistMarkdown
apiKey
sessionCookie
ownerSessionHash
providerConfig
```

## Failure Contract

LangSmith 相关失败必须满足：

```text
does not throw to caller
does not change AgentRun status
does not change AgentInterrupt status
does not affect checkpoint resume
does not affect stream output
does not affect artifact output
```

允许内部输出脱敏 warning。
