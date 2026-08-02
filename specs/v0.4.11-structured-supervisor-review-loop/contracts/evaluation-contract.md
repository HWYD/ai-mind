# Evaluation Contract

## Objective

用同一冻结样本和评分规则比较：

1. `single-agent`
2. `fixed-multi-agent-current`（实现前 v0.4.10 行为快照）
3. `structured-supervisor-v0.4.11`

评测既回答“质量是否提升”，也回答“额外调用和延迟是否值得”。它不是生产 Runtime mode。

## Harness Boundary

- baseline adapters、fault injection、case loader、scorer 只位于 tests/evaluation。
- 生产代码不得出现 `baselineMode`、deterministic provider、hidden evaluation flag 或旧 Runtime fallback。
- deterministic policy tests 与真实模型质量评测分开执行和报告。

## Manifest Schema

```ts
interface EvaluationManifest {
    schemaVersion: 1
    cases: EvaluationCase[]
}

interface EvaluationCase {
    caseId: string
    input: {
        kind: 'inline' | 'demo'
        requirement: string
        contextRefs: string[]
    }
    expected: {
        supervisorBranch: 'execute' | 'clarification_required' | 'blocked'
        runStatus: RunStatus
        reviewCoverage: ReviewerRole[]
        revisionTarget: 'none' | 'plan' | 'tasks' | 'both'
        requiredFindings: string[]
    }
    faultInjection?: {
        failedReviewers: ReviewerRole[]
        failureKind: 'contract_failure' | 'execution_failed' | 'timeout'
    }
    scoringAnchors: ScoringAnchor[]
}
```

`requiredFindings` 使用稳定 evaluator keys，不使用 Runtime 动态 `findingId` 作为 golden value。测试只验证 finding reference 的存在性、scope 和一致性。

## Frozen Cases

最小集合：

| Case                   | Expected focus                                                        |
| ---------------------- | --------------------------------------------------------------------- |
| direct-pass            | 完整输入、完整 review、无 required findings                           |
| clarification-required | 缺少会改变方案的关键信息                                              |
| revision-required      | 初次 findings 驱动一次 Revision，随后以 `needs_review` 和人工确认收口 |
| boundary-blocked       | Boundary hard rule                                                    |
| risk-blocker           | Risk blocker                                                          |
| one-reviewer-failure   | partial coverage → needs_review，除非其他结果有 blocker               |
| two-reviewer-failures  | partial coverage → needs_review，除非剩余结果有 blocker               |
| all-reviewers-failure  | legal dispatch, all failed → failed                                   |

验收期间不得根据 v0.4.11 输出临时修改 expected。

## Scoring Rubric

所有 baseline 使用相同维度：

| Dimension                   | Deterministic / anchored                |
| --------------------------- | --------------------------------------- |
| requirement coverage        | 0/1/2 anchor                            |
| task dependency correctness | deterministic + 0/1/2                   |
| acceptance actionability    | 0/1/2 anchor                            |
| risk detection              | required finding keys + 0/1/2           |
| boundary detection          | required finding keys + 0/1/2           |
| revision lineage            | source finding keys + artifact revision |
| final status correctness    | deterministic                           |
| user comprehensibility      | blinded 0/1/2 anchor                    |

Hard-rule/status 错误必须单独报告，不能被其他叙述质量总分抵消。

## Comparable Conditions

每次三 baseline 对比固定：

- user business provider/model and fixed Contract provider/model
- temperature 与其他 generation parameters
- timeout 与 resource/input limits
- requirement/context/rubric
- scorer version
- case manifest version

模型型 case 固定重复 3 次，报告 median 与范围；不得把单次最好结果当代表值。人工 branch 标注在运行前冻结，由两位独立评审者按同一 rubric 标注，分歧由第三位评审者裁决；8 个 case 共 24 个 branch trial 中至少 22 个正确才满足 SC-007 的 90% 门槛。

## Cost Metrics

每个 case/baseline 记录：

- end-to-end elapsed time
- user business model invocation count
- fixed Contract model invocation count
- Contract repair invocation count
- input tokens
- output tokens
- user business provider/model and fixed Contract provider/model
- failure reason
- Revision performed
- initial Review Group count

三种架构允许调用次数不同；这正是成本评估对象，不应人为补齐调用数。

返修评测只验证 `RevisionOutcome` 的来源 finding ID、更新目标和 artifact revision；本版本不基于自动复评计算 required finding resolution rate，也不评估返修后新 finding。

## Deterministic Acceptance Suite

不依赖真实模型，必须 100% 覆盖：

- closed Contract unknown/missing/type/enum rejection
- exact Reviewer multiset
- hard blocker precedence
- 1/2/3 Reviewer failures
- dispatch/artifact/finding identity ownership
- one repair per Agent stage
- one initial Review Group and one formal Revision maximum
- Markdown variation does not alter status

## Result Format

```ts
interface EvaluationRunResult {
    caseId: string
    baseline: 'single-agent' | 'fixed-multi-agent-current' | 'structured-supervisor-v0.4.11'
    scorerVersion: string
    qualityScores: Record<string, number>
    hardRuleFailures: string[]
    metrics: {
        elapsedMs: number
        businessModelCalls: number
        contractModelCalls: number
        contractRepairCalls: number
        inputTokens?: number
        outputTokens?: number
    }
    runStatus: RunStatus
    failureReason?: string
}
```

评测产物不得包含 raw prompt、raw model response、secrets 或 provider config credentials。

实现收口时，三条 baseline 的实际运行必须生成 `specs/v0.4.11-structured-supervisor-review-loop/evaluation-results.md`；该文件只汇总 manifest/scorer version、模型标识、case 级质量分、hard-rule failures 与成本指标，不保存 raw model content。
