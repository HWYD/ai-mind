# Contract 036: Delivery Chain Runtime

状态: 已完成
版本: v0.3.6
日期: 2026-06-30

## Command contract

Accepted:

```text
/delivery-chain + @demo://scenarios/<scenario-id>/requirement.md
/delivery-chain <inline requirement text>
```

Rejected:

```text
/delivery-chain
/delivery-chain + @docs://...
/delivery-chain + docs://...
/delivery-chain + @specs://...
/delivery-chain + file://...
/delivery-chain + @demo://version-plans/*.md
/delivery-chain + @demo://scenarios/<id>/context.md
/delivery-chain + @demo://scenarios/<id>/plan.sample.md
/delivery-chain + @demo://scenarios/<id>/tasks.sample.md
/delivery-chain + @demo://scenarios/<id>/review.expected.md
/delivery-chain + @demo://../../apps/webapp/package.json
```

Command boundary:

- `resolveDeliveryChainInvocation()` 继续运行在 graph 外。
- graph 只接收归一化后的 `DeliveryChainInput`。
- 空输入、错误 scheme、错误 scenario 文件、version plan 误用都必须在 graph 外 fail closed。

## Resource contract

Scenario-backed mode may read:

```text
@demo://scenarios/<id>/requirement.md
@demo://scenarios/<id>/context.md
@demo://rubrics/plan-rubric.md
@demo://rubrics/task-rubric.md
@demo://rubrics/review-rubric.md
@demo://governance/delivery-boundaries.md
@demo://governance/engineering-rules.md
```

Scenario-backed mode must not read:

```text
docs/**
specs/**
apps/**
packages/**
private-folder/**
.env*
node_modules/**
.git/**
```

The resolver must continue to normalize paths, reject absolute paths, reject `..`, reject backslashes, reject unknown schemes, and verify final paths remain under `examples/agent-demo/`.

## Graph contract

v0.3.6 的内部实现口径是：

```text
LangGraph-controlled sequential workflow
```

固定节点顺序：

```text
loadDeliveryChainContext
-> runPlanStage
-> runTaskStage
-> runReviewStage
-> buildDeliveryChainReport
```

约束：

- graph 使用 `@langchain/langgraph` 的 `StateGraph` 表达固定顺序 workflow。
- 不接 `@langchain/langgraph-checkpoint-postgres`。
- 不新增 PostgresSaver。
- 不新增 checkpoint。
- 不新增 interrupt。
- 不新增 HITL。
- 不新增 resume 语义。
- 不新增多 Agent orchestration。
- 不嵌套调用现有 Tasklist Agent HITL Graph。

## Stage contract

PlanStage output must include:

- Requirement understanding
- Implementation plan
- Module or surface assumptions
- Non-goals
- Risks
- Suggested acceptance criteria

TaskStage output must include:

- Task breakdown
- Recommended order
- Risk flags
- Acceptance-related tasks
- Non-goal protection tasks

ReviewStage output must include:

- `pass`, `needs_changes`, or `blocked`
- Requirement coverage
- Plan-task consistency
- Non-goals check
- Scope drift check
- Acceptance coverage
- Risks and next steps

Stage node contract:

- Plan / Task / Review node 都必须输出标准化 `DeliveryChainStageResult`。
- node 可以复用已有 prompt builder 和 `invokeStageMarkdown()`。
- node 不得读取真实 repo 目录。
- node 不得写文件、数据库或 stream 协议扩展字段。

## Report contract

Delivery Chain Report must include:

```text
1. Input source
2. Requirement summary
3. Assumptions
4. Implementation plan
5. Task breakdown
6. Delivery review
7. Risks
8. Non-goals
9. Next steps
```

The report must state that it is a planning and review output, not a code modification result.

Report equivalence:

- Graph 化后的输出内容必须与原 sequential runner 语义等价。
- 最终仍通过现有 assistant markdown 输出，不引入新的 artifact persistence contract。

## Error message contract

Boundary messages should be clear and safe:

- Missing input: ask for `@demo://scenarios/*/requirement.md` or inline requirement text.
- Forbidden scheme: explain that public demo only supports `@demo://scenarios/*/requirement.md` for Delivery Chain.
- Version plan misuse: explain that `@demo://version-plans/*.md` belongs to `/tasklist`, not `/delivery-chain`.
- Wrong scenario file: ask user to choose the scenario `requirement.md`.
- Path traversal: reject as unsupported resource path without exposing resolved filesystem paths.

Soft-fail contract:

- stage 调用失败时，runtime 只能返回安全的失败摘要，不暴露 raw provider error、stack 或 resolver internals。
- fallback 文本允许提示“当前阶段未返回有效内容，请人工补充”，但不能伪造已执行的真实代码动作。

## Non-regression contract

Implementation must not modify:

- Tasklist Agent Graph topology
- Tasklist Agent HITL decision schema
- checkpoint resume semantics
- AgentRun / AgentInterrupt schema
- stream protocol
- frontend reducer data structure
- Prisma schema
- PostgresSaver schema
- v0.3.4 Tasklist Agent LangSmith observer semantics

Also must not modify:

- `/tasklist` 当前 LangGraph + HITL 链路
- delivery-chain 资源展示降噪逻辑
- `@demo://` resource boundary
