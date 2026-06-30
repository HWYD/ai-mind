# Specs Workspace

## Current Planning Spec

- [037: Delivery Chain Workflow Progress Presentation](./037-delivery-chain-workflow-progress-presentation)

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

### 032 Spec Kit CLI + Codex Skills Pilot

目录：[032-spec-kit-cli-codex-skills-pilot](./032-spec-kit-cli-codex-skills-pilot)

回答的问题：

- AI Mind 为什么采用官方 Spec Kit CLI + Codex skills 双轨
- CLI、skills 和人工等价路径分别负责什么
- v0.3.2 pilot 为什么暂不把 tooling 接入 CI 强制门
- 后续是否值得把双轨升级为团队默认必装、必跑流程

### 033 Spec Kit Full Skills Default Entry

目录：[033-spec-kit-full-skills-default-entry](./033-spec-kit-full-skills-default-entry)

回答的问题：

- 为什么 `speckit-*` 命名空间应收口为 official full skills
- v0.3.2 lightweight pilot skills 的规则如何迁移
- Level C / D 如何默认使用 official full skills
- `converge` 如何进入版本收口检查
- 为什么 `taskstoissues` 暂时只是 optional

### 034 Tasklist Agent LangSmith Observability Integration

目录：[034-tasklist-agent-langsmith-observability](./034-tasklist-agent-langsmith-observability)

回答的问题：

- v0.3.4 为什么只为 Tasklist Agent 接入 LangSmith observability
- LangSmith tracing 如何覆盖 initial run、HITL interrupt、human decision、resume 和 result
- 为什么使用官方 LangSmith env 而不新增 AI Mind 双开关
- 哪些 metadata 允许上传，哪些 runtime / prompt / user content 必须禁止上传
- 为什么本版本不修改 Graph topology、HITL contract、Prisma schema、stream protocol 或 frontend reducer

### 035 Agent Demo Workspace Resource Boundary

目录：[035-agent-demo-workspace-resource-boundary](./035-agent-demo-workspace-resource-boundary)

回答的问题：

- 为什么 public Agent demo resource root 收口到 `examples/agent-demo/`
- 为什么 Tasklist Agent public demo 从 `@docs://` / `docs://versions` 迁移到 `@demo://version-plans`
- `@demo://` resolver 需要拒绝哪些越界路径、scheme 和文件类型
- 为什么 demo `version-plans/` 保持瘦 corpus，而不是完整版本历史归档
- 为什么本版本不实现 `/plan`、`/task`、`/review`、`/delivery-chain` 或 artifact handoff
- 为什么本版本不修改 Graph topology、HITL contract、stream protocol、frontend reducer、Prisma schema 或 PostgresSaver schema

### 036 Controlled Delivery Chain MVP

目录：[036-controlled-delivery-chain-mvp](./036-controlled-delivery-chain-mvp)

回答的问题：

- 为什么 `/delivery-chain` 是 v0.3.6 唯一 public command
- 为什么 Delivery Chain 支持 scenario-backed input 和 inline requirement
- `DeliveryChainGraph` 如何固定执行 load / plan / task / review / report
- 为什么 v0.3.6 使用 LangGraph 但不接 PostgresSaver、checkpoint、interrupt 或 HITL
- 为什么 TaskStage 不调用现有 Tasklist Agent HITL Graph
- 为什么本版本不做 `@artifact://`、artifact handoff、多 Agent 或 chat persistence
- 为什么内部 demo resources 需要 compact grouping，而不是展开成多个大 ResourcePanel

### 037 Delivery Chain Workflow Progress Presentation

目录：[037-delivery-chain-workflow-progress-presentation](./037-delivery-chain-workflow-progress-presentation)

回答的问题：

- 为什么 v0.3.7 优先解决 `/delivery-chain` 的执行过程可见性
- 为什么新增通用 `workflow-progress-*` stream chunks，而不是复用 `agent-graph-*`
- workflow progress 如何做到执行中逐步出现、完成后自动折叠
- 为什么首版只绑定 `/delivery-chain`，不影响 `/tasklist`、普通 resource、tool、prompt 展示
- 为什么 workflow progress 是 presentation-level trace，不是 DB / checkpoint / artifact / event store
- Report section presentation 如何 fallback 到普通 Markdown

## 后续新增规格时的约定

- 用版本号前缀保持排序稳定，例如 `032-...`
- 目录名使用英文 kebab-case
- 文档内容可以优先中文，便于项目内理解
- 小改动不强制新建完整 spec
- 跨边界改动不要直接只写 `tasks`，要补齐完整规格
