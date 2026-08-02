# Agent Contracts

## Purpose

本文件定义 v0.4.11 所有 Agent 输出的契约边界。实现时以 Zod schema 为运行时事实源，并通过 `z.infer` 导出 TypeScript 类型。

## Global Rules

- 每个 root 和 nested object 都必须 closed（Zod `.strict()`）。
- unknown field、缺字段、错类型、非法枚举均拒绝整个结果。
- 不允许先 strip unknown fields 再继续。
- Agent draft 不能包含 Runtime-owned identity：`dispatchPlanId`、`artifactId`、`cycleId`、`findingId`、run ID。
- Markdown 与结构化字段冲突时，结构化字段是唯一机器事实源；冲突可作为安全 warning 展示，但不能改写状态。
- 所有 schema 应限制数组数量和文本长度，避免无界 Contract/repair surface。

## Contract Inventory

| Role / Stage      | Contract                            | Required control fields                                                 | Runtime enrichment                                                                           |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Supervisor pre    | `SupervisorPreDecisionDraft`        | branch、focus/assumptions/reviewerRoles 或 clarification/blocked reason | `dispatchPlanId`                                                                             |
| Plan Worker       | `PlanArtifactDraft`                 | requirement refs、scope、phases、acceptance、markdown                   | artifact ID、revision                                                                        |
| Task Worker       | `TaskArtifactDraft`                 | task IDs、requirement refs、dependencies、acceptance、markdown          | artifact ID、revision、Plan ref                                                              |
| General Reviewer  | `GeneralReviewResultDraft`          | disposition、findings、summary、markdown                                | cycle/source/finding IDs                                                                     |
| Risk Reviewer     | `RiskReviewResultDraft`             | severity、findings、summary、markdown                                   | cycle/source/finding IDs                                                                     |
| Boundary Reviewer | `BoundaryReviewResultDraft`         | boundaryStatus、violations/findings、summary、markdown                  | cycle/source/finding IDs                                                                     |
| Supervisor post   | `SupervisorPostReviewGuidanceDraft` | rationale、按 target 分类的返修建议                                     | Runtime 派生 action、RevisionRequest、targets 与 finding 引用，并 append 到同一 DispatchPlan |
| Revision Worker   | Plan/Task draft 的 revision variant | current artifact + RevisionRequest 的结果字段                           | stable artifact ID、revision +1                                                              |

## Schema Ownership

建议在 `manager/agent-contracts.ts` 中按以下顺序定义：

1. bounded text、requirement ref、role、target、severity 等 primitives；
2. finding draft 与 role-specific review drafts；
3. Supervisor pre decision 与 post-review guidance；
4. Plan/Tasks drafts；
5. Runtime canonical entities；
6. schema-derived exported types。

`subagent-tool-schemas.ts` 只保留 tool invocation/input primitives，不再拥有 generic business result 或开放 metadata。

## Contract Invocation and Repair

```text
business-stage invocation (user-selected model)
-> fixed Contract invocation (`deepseek/deepseek-v4-pro` structured output)
-> full strict parse
   -> valid: return canonical draft
   -> contract failure: build safe issue summary
      -> attempt 2 on the fixed Contract model (repair)
      -> full strict parse
         -> valid: return
         -> invalid: stage failure
```

固定 Contract model 只承载 schema encoding、parse 与 repair；不得替代业务 stage、重写业务结论或改变 Runtime policy。长期记忆候选提取的 `withStructuredOutput` 调用方式可作为 transport 参考，但其输入、候选语义和失败收口不属于本 Contract。

Repair eligibility:

- 仅 structured output/schema validation failure；Supervisor post-review guidance 不承载 Runtime policy、finding ID 或 RevisionRequest 集合，因此不再为这些跨实体语义做 repair。
- provider timeout、abort、authentication、transport 或 tool execution failure不触发 Contract repair。

Repair feedback allowlist:

```ts
interface SafeContractIssue {
    path: string
    code: string
}
```

- 最多返回 5 个 issues。
- `path` 只来自 schema path，最长 160 个字符。
- 不包含 invalid value、raw output、raw prompt、stack、provider config、secret 或内部路径。
- 第二次输出必须完整合法；不能 patch 第一次对象。

Failure taxonomy:

- `contract_failure`: structured output/schema parse 且唯一 repair 后仍不合法；post-review guidance 的该类失败会进入安全降级，不再把整个 run 标记为失败。
- `policy_failure`: Contract 合法但违反 exact-set、identity、scope、budget 或 hard-rule policy。
- `execution_failed`: provider/tool 执行错误；`timeout` 为其需要单独展示的子类。

上述分类不得被 Markdown、open metadata 或 repair fallback 改写。

## Stage Failure Contract

| Stage                 | Second contract failure                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Supervisor pre        | `failed`，不启动 Worker                                                                                        |
| Plan / Tasks          | `failed`，不把不合法 Markdown 当 artifact                                                                      |
| Single Reviewer       | coverage=`contract_failure`，按 partial/all failure 状态矩阵                                                   |
| Supervisor post       | Runtime 保留安全警告，并依据已验证 finding 派生 action、RevisionRequest 与后续返修；不得暴露原始模型输出或错误 |
| Revision Plan / Tasks | `failed`，保留 pre-revision artifacts 与 ReviewBundle                                                          |

## Required Deterministic Contract Tests

对每个 role 进行 table-driven 测试：

- valid minimal object
- missing required field
- wrong type
- illegal enum
- unknown root field
- unknown nested field
- empty bounded collection/text
- Agent-supplied Runtime ID
- Markdown wording contradicts structured value

除 valid 和最后一项外均必须 contract failure；最后一项仍按结构化值执行。

Repair tests:

- first valid → 1 model call
- invalid → valid → 2 model calls and continue
- invalid → invalid → exactly 2 model calls and stage failure
- repair message only includes safe path/code
- provider error does not cause Contract repair
