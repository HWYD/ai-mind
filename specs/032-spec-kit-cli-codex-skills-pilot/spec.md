# Spec 032：Spec Kit CLI + Codex Skills Dual-track Pilot

状态：已完成
版本：v0.3.2
日期：2026-06-28

## 摘要

v0.3.2 是 AI Mind 的 Spec Kit tooling pilot 版本。

本版本目标是把 v0.3.1 已经沉淀的 spec-anchored workflow，推进到“官方 Spec Kit CLI + Codex skills 双轨可用”的阶段。它是治理与开发体验版本，不新增业务功能，不修改 Tasklist Agent runtime，也不改变 v0.3.0 HITL / checkpoint / resume 行为。

## Change Level

本版本按 **Level D：Architecture Change** 处理。

原因：

- 它会影响 AI Mind 后续复杂版本的默认开发入口。
- 它会改变 Codex / AI coding agent 的工作方式。
- 它会引入外部官方 tooling 与 repo 内 Codex skills 的双轨策略。
- 它需要 ADR、architecture docs、完整 spec，以及人工 review。

## 目标

- 明确 AI Mind 采用 Spec Kit CLI + Codex skills 双轨，而不是二选一。
- 明确官方 CLI 负责生成、校验或驱动标准 Spec Kit 流程。
- 明确 Codex skills 负责在 Codex 环境里把 clarify / checklist / analyze 变成可复用工作流。
- 明确无 CLI、无 skills 或外部 tooling 不可用时，仍保留人工等价路径。
- 明确本版本只做 pilot，不把 CLI 或 skills 直接变成不可绕过的 CI 强制门。
- 为后续 v0.3.3+ 决定是否强制安装、是否接入 CI、是否升级为 team default 提供依据。

## 用户故事

- 作为 AI Mind 维护者，我希望复杂版本启动时有统一入口，不再每次手写长提示词。
- 作为 Codex，我希望能读取 `specs/032...` 并知道何时使用 CLI、何时使用 skills、何时降级为人工等价。
- 作为 reviewer，我希望 PR 能说明本次是否跑过 clarify / checklist / analyze，以及用的是 CLI、skill 还是人工方式。
- 作为本地开发者，我希望即使没有安装官方 CLI，也能按同一套质量问题完成检查。

## 功能性要求

- `FR-032-01`：必须保留 `specs/` 作为 AI Mind 正式工作规格区。
- `FR-032-02`：必须明确 Spec Kit CLI 是外部 workflow tooling，不是项目事实源。
- `FR-032-03`：必须明确 Codex skills 是 Codex 内的可复用执行工作流，不是 AI Mind 产品 runtime 的 Skill。
- `FR-032-04`：必须定义 CLI 轨和 skills 轨的职责分工。
- `FR-032-05`：必须定义无 tooling 时的人工等价路径。
- `FR-032-06`：必须定义 pilot 成功标准和失败回退标准。
- `FR-032-07`：必须更新 ADR 与 architecture docs。
- `FR-032-08`：必须避免引入对外部 CLI 版本的硬编码依赖。
- `FR-032-09`：必须避免让 Level A / B 小改默认强制跑完整 Spec Kit tooling。

## 双轨模型

### CLI 轨

CLI 轨用于贴近官方 Spec Kit 的标准命令入口。

本版本只记录推荐用法与验证流程，不在仓库中提交机器特定安装产物。

目标职责：

- 初始化或更新官方 Spec Kit 结构。
- 运行官方 clarify / checklist / analyze 类流程。
- 帮助验证 AI Mind 的 spec 目录结构是否仍接近官方最佳实践。

v0.3.2 已在临时目录完成一次官方 CLI 试跑：

- `specify version` 成功。
- `specify init <temp-project> --integration codex --integration-options="--skills" --ignore-agent-tools --script ps` 成功。
- 试跑未写入当前 AI Mind 仓库。
- 结论是官方 CLI 与 Codex skills mode 可用，但当前版本不把 CLI 提升为默认必装。

### Codex Skills 轨

Codex skills 轨用于降低 Codex 使用成本。

目标职责：

- 将 clarify / checklist / analyze 包装为 Codex 可复用技能。
- 让 Codex 在当前 repo 中更稳定地读取 constitution、specs、ADR 和 architecture docs。
- 降低每次复杂任务都要写大段提示词的负担。

当前仓库内三组 `speckit-*` skills 是 AI Mind lightweight pilot skills。官方 CLI 生成的是更完整的 `speckit-*` skills 套件，是否引入完整套件留给后续版本评估。

### 人工等价轨

人工等价轨保留为稳定 fallback。

适用场景：

- 当前环境未安装 CLI。
- 当前 Codex 环境未安装对应 skills。
- 网络、权限或外部版本变化导致 tooling 不可用。
- reviewer 需要用人工方式复核 tooling 输出。

## 非目标

v0.3.2 不做：

- 不修改 Tasklist Agent Graph。
- 不修改 HITL 流程。
- 不修改 AgentRun / AgentInterrupt schema。
- 不修改 PostgresSaver。
- 不修改 stream chunk 协议。
- 不修改 API route。
- 不修改前端 message reducer。
- 不实现 pending HITL recovery。
- 不实现 Run History。
- 不把官方 CLI 输出作为唯一事实源。
- 不要求所有 Level A / B 小改都强制执行完整 Spec Kit tooling。
- 不在本版本强制 CI 阻断没有 CLI 产物的 PR。
- 不把 Codex skills 与 AI Mind 产品内 Skill Runtime 混为一谈。

## 成功标准

v0.3.2 完成后，项目应该能回答：

- AI Mind 的 Spec Kit CLI + Codex skills 双轨策略是什么？
- 哪些任务必须使用 CLI、skills 或人工等价检查？
- 没有安装官方 CLI 时如何继续开发？
- 没有安装 Codex skills 时如何继续开发？
- 哪些事情仍然必须人工判断？
- 双轨 pilot 成功后，v0.3.3 是否可以考虑强制化？
- 双轨 pilot 失败时，如何回退到 v0.3.1 的人工等价流程？

## 官方资料来源

- Spec Kit 官方仓库：https://github.com/github/spec-kit
- Spec Kit 安装文档：https://github.com/github/spec-kit/blob/main/docs/installation.md
- OpenAI Codex customization 文档：https://developers.openai.com/codex/concepts/customization
