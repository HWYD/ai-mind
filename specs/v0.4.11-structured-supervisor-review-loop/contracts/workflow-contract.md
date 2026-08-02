# Workflow Contract

## Fixed Topology

```text
Supervisor Decision
-> Plan Worker Tool
-> Tasks Worker Tool
-> Review Group (General / Risk / Boundary)
-> Supervisor Review Guidance
-> [optional one Revision]
-> Report
```

Plan、Tasks 和三个 Reviewer 都是仅由 `delivery-chain-manager` Runtime 主动调用的内部 Worker Tool。Supervisor 和用户业务模型不能发现、选择或排序这些 Tools。

## Runtime Policy

### Pre-decision and initial Review

- `clarification_required` 和 `blocked` 不启动任何 Worker。
- `execute` 必须先通过 Reviewer exact-set 校验，再按 Plan → Tasks → Review Group 执行。
- Review Group 恰好包含 `general`、`risk`、`boundary` 各一次，消费同一 Plan/Tasks snapshot，并用 `Promise.allSettled` 独立收集 coverage。
- 不合法 Reviewer 集合在 invocation、progress 和 trace 生成前失败，Reviewer starts 必须为 0。

### Revision and Closure

- 仅首次完整且非 blocked Review 可以触发一次 Supervisor guidance；Runtime 只从已验证的 `issue + required` findings 派生 `RevisionRequest`。
- Revision target 只能是 Plan、Tasks 或两者；两者都更新时顺序固定为 Plan → Tasks。
- 每个 run 最多一次 Revision。Revision Worker 必须消费当前 artifact 和 Runtime-validated `RevisionRequest`，保持 stable artifact ID 并将 revision 从 1 更新为 2。
- Revision 完成后不启动第二个 Review Group，也不产生 finding resolution、新 finding 或第二次 Revision。
- Revision 成功后内部 canonical `RunStatus` 为 `needs_review`，表示产物已修订但本版本未执行独立复评；不得标记为 `pass`。

## Canonical Status Rules

Priority:

```text
execution-integrity failed
> verified hard blocker
> incomplete initial review coverage
> initial required issue findings
> pass
```

- 初次完整 Review 无 required issue 为 `pass`。
- 初次 Review 有 required issue 且返修成功为 `needs_review`。
- 初次 Review 有 required issue 但返修失败为 `failed`，并保留初次 Review 证据和当前 artifact version。
- `needs_changes` 只描述尚未完成返修的首次 Review 结论；不作为成功返修后的终态。
- public stream 仍使用既有 `workflow-progress-*` family：只有 `failed` 映射为 public failed，其他 canonical 状态映射为 completed。

## Progress and Report

- 内部 progress 只包含 Supervisor、Plan、Tasks、首次 Review Group、Revision 和 Report；没有 `delegate-re-review-group`。
- 用户报告不展示 canonical terminal status 字段；stream 的 machine terminal state 仍保留，以保证协议正常结束。
- 报告基于 typed Plan、Tasks、首次 ReviewBundle、RevisionOutcome 和安全 warnings 渲染。
- 存在 RevisionOutcome 时，报告显示“返修依据”和“修订结果”，但不显示“原问题已解决/仍未解决”或“复审遗留问题”。下一步为人工确认修订后的 Plan/Tasks。

## Compatibility

- `/delivery-chain` 输入、demo resource allowlist、public stream chunk union 和 frontend reducer shape 不变。
- 不新增持久化、GraphState、checkpoint/resume、public route 或开放 Agent Catalog。
