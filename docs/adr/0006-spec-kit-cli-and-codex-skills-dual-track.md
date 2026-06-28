# ADR-0006：Spec Kit CLI and Codex Skills Dual-track

状态：Accepted
日期：2026-06-28

## 背景

v0.3.1 已经把 AI Mind 的复杂版本开发流程规范化为 spec-anchored workflow，包含 constitution、specs、ADR、architecture docs、PR checklist 和 clarify / checklist / analyze 质量闸门。

v0.3.2 准备进一步验证官方 Spec Kit CLI 与 Codex skills 的接入价值。这里存在一个长期决策点：AI Mind 是否应该只采用官方 CLI、只采用 Codex skills，还是保留双轨。

## 决策

AI Mind 采用 **Spec Kit CLI + Codex skills 双轨**。

- Spec Kit CLI 作为贴近官方流程的标准 tooling 入口。
- Codex skills 作为 Codex 环境中的可复用执行工作流。
- 人工等价 clarify / checklist / analyze 作为长期 fallback。

CLI 和 skills 都不是唯一事实源。AI Mind 的事实判断仍以当前代码、测试、constitution、`specs/`、ADR、architecture docs 和公开版本资料为准。

v0.3.2 已通过临时目录试跑验证官方 CLI 的 Codex skills mode 可用，但本 ADR 只接受“双轨 pilot + fallback”策略，不把官方 CLI 提升为团队默认必装，也不把官方生成物直接合并进当前仓库。

## 影响

正向影响：

- 复杂版本启动时可以减少重复提示词。
- Codex 在 Level C / D 变更中更容易遵循同一套流程。
- 官方 CLI 可作为 AI Mind 是否偏离 Spec Kit 最佳实践的参照。
- skills 可更贴近本仓库上下文，降低执行门槛。

代价：

- 需要维护 CLI、skills、人工等价三种路径的一致性。
- 需要防止外部工具生成文件覆盖项目已有规则。
- 需要明确 Codex skills 与 AI Mind 产品内 Skill Runtime 的区别。
- 需要人工判断是否、何时从 pilot 升级为强制流程。

## 备选方案

只采用官方 CLI：

- 优点是更贴近官方流程。
- 缺点是 Codex 日常执行成本仍高，且受本地安装、网络和版本影响更明显。

只采用 Codex skills：

- 优点是贴近 Codex 使用体验。
- 缺点是缺少官方 CLI 作为外部参照，容易演变成项目私有流程。

继续只采用人工等价：

- 优点是稳定、轻量、无外部依赖。
- 缺点是每次复杂版本提示词成本高，执行一致性依赖操作者经验。

## 后续事项

- 在 `specs/032-spec-kit-cli-codex-skills-pilot/` 记录 pilot 规格与验收。
- 在 `docs/architecture/spec-kit-tooling.md` 记录 CLI、skills 和人工等价路径。
- 如果后续确认强制化，需要更新本 ADR 或新增 ADR，记录 pinned CLI 版本、安装策略和 CI 影响。
- 如果引入 CI 强制检查，需要单独评估 package scripts、CI 配置和失败恢复策略。
