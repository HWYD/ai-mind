# 架构决策记录（ADR）

ADR 用于记录 AI Mind 中长期有效、后续版本不应轻易推翻的架构决策。

下面这些变化通常需要 ADR：

- Agent 边界变化。
- Runtime 事实源变化。
- Stream protocol 兼容性变化。
- 业务状态所有权变化。
- 数据库 package 所有权变化。
- Checkpoint / resume 语义变化。
- 部署拓扑变化。
- 新 service 接入。

ADR 不是 tasklist。它解释为什么做出这个决定、带来什么取舍，以及未来工作必须遵守什么。

## 格式

新增 ADR 使用 [template.md](./template.md)。

推荐命名：

```text
0006-short-decision-title.md
```

## 当前 ADR

- [0001: GraphState Source of Truth](./0001-graphstate-source-of-truth.md)
- [0002: AgentRun Business State vs LangGraph Checkpoint](./0002-agent-run-business-state-vs-langgraph-checkpoint.md)
- [0003: Stream-core Backward Compatibility](./0003-stream-core-backward-compatibility.md)
- [0004: Database Package Boundary](./0004-database-package-boundary.md)
- [0005: Review Node Side-effect Boundary](./0005-review-node-side-effect-boundary.md)
- [0006: Spec Kit CLI and Codex Skills Dual-track](./0006-spec-kit-cli-and-codex-skills-dual-track.md)
- [0007: Official Spec Kit Full Skills Default Entry](./0007-official-spec-kit-full-skills-default-entry.md)
- [0008: LangSmith Observability Boundary](./0008-langsmith-observability-boundary.md)
- [0009: Public Agent Demo Resource Boundary](./0009-public-agent-demo-resource-boundary.md)
