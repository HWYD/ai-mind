# Spec 033：Spec Kit Full Skills Default Entry

状态：已完成
版本：v0.3.3
日期：2026-06-28

## 摘要

v0.3.3 是 AI Mind 的 Spec Kit full skills 接入版本。

本版本不新增业务功能，不修改 Tasklist Agent runtime。它把 v0.3.2 已验证可行的 Spec Kit CLI + Codex skills 双轨 pilot，推进为更清晰的默认入口策略：

```text
official speckit-* full skills -> Level C / D 默认入口
AI Mind adapter layer -> constitution / template overrides / ADR / workflow docs / AGENTS
manual equivalent -> 长期 fallback
```

本版本的核心变化是：`speckit-*` 命名空间以后代表 official Spec Kit full skills。v0.3.2 的 lightweight pilot skills 不再占用 `speckit-*` 正式命名空间；其中有价值的 AI Mind 约束迁移到项目治理资产中。

## Change Level

本版本按 **Level D：Architecture Change** 处理。

原因：

- 它改变 AI Mind 后续复杂版本的默认 AI coding 入口。
- 它引入 official Spec Kit full skills 作为 canonical `speckit-*` entry。
- 它调整 `.agents/skills/` 的长期命名空间规则。
- 它需要更新 constitution、ADR、architecture docs、AGENTS 和 release 资产。
- 它需要人工 review official generated baseline 与 AI Mind adapter layer 的边界。

## 背景

v0.3.1 已经建立 AI Mind 的 Spec Kit Governance Baseline，包括 constitution、specs、ADR、architecture docs、PR checklist 和 Change Level 分级。

v0.3.2 已经完成 CLI + Codex skills dual-track pilot：

- 官方 Spec Kit CLI 已在临时目录试跑成功。
- `specify init ... --integration codex --integration-options="--skills" --script ps` 可生成完整 `speckit-*` skills 套件。
- 当前仓库内的 `speckit-clarify`、`speckit-checklist`、`speckit-analyze` 已验证可被 Codex 发现和触发。
- v0.3.2 明确这些本地 skills 是 lightweight pilot，不是 official full skills 的永久替代。

v0.3.3 在此基础上做正式命名空间收口。

## 目标

- 引入 official Spec Kit full skills 作为 canonical `speckit-*` entry。
- official full skills 保持 generated / vendored baseline，不直接魔改。
- v0.3.2 lightweight pilot skills 不再占用 `speckit-*` 正式命名空间。
- 审计 pilot skills 内容，将有价值的 AI Mind 规则迁移到 constitution、template overrides、ADR、workflow docs 和 AGENTS。
- 从 `.agents/skills/` 移除旧 pilot `speckit-*` skills。
- 如确实需要保留 AI Mind 专属 skill，必须改名为 `ai-mind-*`，不得 shadow official `speckit-*`。
- full skills 只作为 Level C / D 默认入口；Level A / B 不强制。
- 保留人工等价 fallback 和 slash command 兼容说明。
- `speckit-taskstoissues` 保留为 optional，不进入默认主流程。
- `speckit-converge` 进入 Level C / D 的收口检查。
- official baseline 使用 `github/spec-kit@v0.11.9` 生成，`specify-cli` 版本为 `0.11.9`。

## 非目标

本版本不做：

- 不修改 Tasklist Agent runtime。
- 不修改 Tasklist Agent Graph。
- 不修改 GraphState。
- 不修改 Prisma schema。
- 不修改 PostgresSaver。
- 不修改 stream protocol。
- 不修改 API route。
- 不修改前端 reducer。
- 不实现 pending HITL recovery。
- 不实现 Run History。
- 不实现 `agent_run_events`。
- 不实现 Time Travel。
- 不实现新 Agent。
- 不把 full skills 强制用于所有 Level A / B 小改。
- 不直接魔改 official skills。
- 不把 `speckit-taskstoissues` 放进默认主流程。
- 不把 Spec Kit CLI 接入 CI 强制门。
- 不把 official skills 输出当作唯一事实源。

## 用户故事

- 作为 AI Mind 维护者，我希望 `$speckit-*` 代表官方完整 Spec Kit 流程，而不是项目内轻量替代品。
- 作为 Codex，我希望在 Level C / D 变更中有标准入口来生成和检查 spec、plan、tasks、analyze 和 converge。
- 作为 reviewer，我希望能区分 official generated baseline 和 AI Mind adapter layer，避免升级冲突。
- 作为开发者，我希望小改不被迫执行完整 Spec Kit 流程，但复杂改动能减少重复提示词。

## 功能性要求

- `FR-033-01`：仓库必须明确 `speckit-*` 命名空间属于 official Spec Kit full skills。
- `FR-033-02`：official full skills 必须保持 generated / vendored baseline，不直接写入 AI Mind 私有规则。
- `FR-033-03`：v0.3.2 lightweight pilot skills 必须被审计、迁移并从 `speckit-*` 命名空间退出。
- `FR-033-04`：AI Mind 项目约束必须沉淀到 adapter layer，而不是魔改 official skills。
- `FR-033-05`：Level C / D 必须默认使用 official full skills 或人工等价流程。
- `FR-033-06`：Level A / B 不得被强制升级为完整 full skills 流程。
- `FR-033-07`：manual fallback 和 slash command 兼容路径必须继续文档化。
- `FR-033-08`：`speckit-converge` 必须纳入 Level C / D release closing 检查。
- `FR-033-09`：`speckit-taskstoissues` 必须标记为 optional。
- `FR-033-10`：必须新增 ADR 记录 official full skills default entry 决策。
- `FR-033-11`：如果 official skills 依赖 `.specify/scripts`、`.specify/templates` 或 integration manifest，必须同步保留这些 generated baseline 文件。

## 成功标准

v0.3.3 完成后，项目应该能回答：

- `$speckit-*` 到底是 official full skills，还是 AI Mind 本地 pilot？
- v0.3.2 的 lightweight pilot rules 去了哪里？
- Codex 做 Level C / D 改动时，默认从哪个入口开始？
- Level A / B 为什么不强制跑 full skills？
- official skills 和 AI Mind adapter layer 的边界在哪里？
- `converge` 在版本收口中负责什么？
- `taskstoissues` 为什么暂时不是默认主流程？
- 没有 CLI、skills 或 slash command 时如何继续开发？
- official skills 将来升级时如何避免覆盖 AI Mind 项目规则？

## 范围外验证

因为本版本不改 runtime，以下验证不属于最小门槛：

- 浏览器 smoke。
- Tasklist Agent HITL 端到端回归。
- database migration integration test。
- stream-core 协议回归。
- full webapp build。

如果本版本只修改 docs、specs、ADR、AGENTS 和 `.agents/skills/`，最小验证以 `git diff --check`、skills 发现验证、文档一致性检查为主。
