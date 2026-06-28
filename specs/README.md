# Specs Workspace

`specs/` 是 AI Mind 的正式 AI coding 规格工作区。

这里不是对外展示区，也不是历史草稿堆放区，而是给 Codex / AI coding agent / reviewer / 开发者在做复杂版本时读取和落地的“真实工作规格区”。

## 这个目录放什么

每个复杂版本或跨边界能力，按一个独立目录管理：

```text
specs/<version-topic>/
  spec.md
  plan.md
  tasks.md
  acceptance.md
  decisions.md
```

它们的职责分别是：

- `spec.md`：这个版本到底要解决什么，边界在哪里，哪些不做
- `plan.md`：真实运行架构、主链路、模块职责、兼容约束
- `tasks.md`：实施步骤、阶段收口与完成记录
- `acceptance.md`：验收标准、验证重点、回归边界
- `decisions.md`：关键工程取舍、为什么这样做

## 怎么使用

后续做 Level C / Level D 变更时，建议按这个顺序读：

1. `.specify/memory/constitution.md`
2. 目标版本对应的 `spec.md`
3. 对应的 `plan.md`
4. 对应的 `tasks.md`
5. 相关 `docs/adr/`
6. 相关 `docs/architecture/`

如果是 released baseline：

- 它代表“已经发布、已经验证过的历史基线”
- 不是待实现任务
- 主要用于理解演进脉络、边界来源和回归判断

如果是未来正在开发的版本：

- 它才是当前真实工作规格区
- `tasks.md` 才代表当前执行节奏

## 和 docs / private-folder 的区别

- `specs/`：正式工作规格区，面向实现与 review
- `docs/adr/`：长期架构决策区
- `docs/architecture/`：当前架构事实区
- `docs/versions/`、`docs/releases/`、`docs/tasklists/`：公开展示区
- `private-folder/`：草稿、历史过程、个人内部材料区，不是默认事实源

一句话说：

> 以后复杂版本先读 `specs/`，不是先翻 `private-folder/`。

## 当前版本索引

### 020 Controlled Agent Graph

目录：[020-controlled-agent-graph](./020-controlled-agent-graph)

回答的问题：

- Tasklist Agent 是从哪个版本开始接入 LangGraph 的
- 当时为什么仍保留 `legacy / graph` 双路线
- graph event、trace、debug summary 的初始边界是什么

### 022 Containerized Deployment and GitHub Actions Delivery

目录：[022-containerized-deployment-and-github-actions-delivery](./022-containerized-deployment-and-github-actions-delivery)

回答的问题：

- 生产部署拓扑是怎么收口的
- 为什么生产 registry 走腾讯云 TCR
- 为什么 PAS 只保留内网，不对公网暴露

### 023 Tasklist Agent Graph Runtime Consolidation

目录：[023-tasklist-agent-graph-runtime-consolidation](./023-tasklist-agent-graph-runtime-consolidation)

回答的问题：

- Tasklist Agent 是从哪个版本开始只走 Graph Runtime 的
- legacy runner 和 runtime switch 是何时退出生产路径的

### 024 Tasklist Agent Graph Single State Model

目录：[024-tasklist-agent-graph-single-state-model](./024-tasklist-agent-graph-single-state-model)

回答的问题：

- GraphState 是什么时候真正成为单事实源的
- 旧 AgentState adapter 是怎么退场的

### 030 Tasklist Agent HITL Checkpoint Resume

目录：[030-tasklist-agent-hitl-checkpoint-resume](./030-tasklist-agent-hitl-checkpoint-resume)

回答的问题：

- v0.3.0 的 HITL、两轮修订、durable checkpoint、resume 真实边界是什么
- AgentRun / AgentInterrupt 和 PostgresSaver 是怎么分工的

### 031 Spec Kit Governance Baseline

目录：[031-spec-kit-governance-baseline](./031-spec-kit-governance-baseline)

回答的问题：

- AI Mind 为什么要引入 constitution / specs / ADR / workflow / PR checklist
- 后续复杂版本该如何按治理流程推进

## 后续新增规格时的约定

- 用版本号前缀保持排序稳定，例如 `032-...`
- 目录名使用英文 kebab-case
- 文档内容可以优先中文，便于项目内理解
- 小改动不强制新建完整 spec
- 跨边界改动不要直接只写 `tasks`，要补齐完整规格
