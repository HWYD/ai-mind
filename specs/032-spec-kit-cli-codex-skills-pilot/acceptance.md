# Acceptance 032：CLI + Codex Skills Dual-track Pilot

状态：已完成
版本：v0.3.2
日期：2026-06-28

## 流程验收

- AI Mind 能清楚说明 CLI 轨、Codex skills 轨和人工等价轨的职责。
- Level C / D 仍必须完成 clarify / checklist / analyze 或人工等价检查。
- Level A / B 不被强制升级成完整 Spec Kit tooling 流程。
- CLI / skills 不可用时，开发流程仍可继续。

## 架构验收

- 已新增或更新 ADR，说明双轨长期决策。
- 已新增或更新 architecture docs，说明 tooling 使用方式和边界。
- `specs/032...` 五件套完整。
- `specs/README.md` 能指向 v0.3.2。

## 安全与边界验收

- Codex skills 不默认读取 `private-folder/`。
- Codex skills 不被描述成 AI Mind 产品内 Skill Runtime。
- CLI 输出不被描述成唯一事实源。
- 外部 tooling 不得覆盖 constitution、ADR 或已有 specs 中的有效内容。

## 人工等价 Gate 验收

### Clarify

- 已明确 pilot 目标：CLI + skills 双轨。
- 已明确 Change Level：Level D。
- 已明确 Non-goals：不改 runtime，不强制所有小改，不接 CI 阻断。
- 已明确人工事项：安装、授权、真实体验判断、是否强制化。

### Checklist

- 已检查需求是否完整。
- 已检查验收是否可判断。
- 已检查是否把 Non-goals 写成隐性任务。
- 已检查 fallback 是否存在。

### Analyze

- `spec.md`、`plan.md`、`tasks.md`、`acceptance.md`、`decisions.md` 不应互相冲突。
- ADR 与 architecture docs 应与 spec 结论一致。
- README / AGENTS 更新应等待 pilot 真实结果，避免过早宣布强制化。

## Tooling Pilot 验收

如果用户决定试装官方 tooling，还需要补充：

- CLI 安装命令、版本与运行结果。
- CLI 生成或更新的文件列表。
- Codex skills 是否在当前 Codex 环境中可用。
- skills 触发方式和输出质量。
- 与人工等价检查相比是否减少提示词负担。

### v0.3.2 试跑结果

本版本已完成一次低风险官方 CLI 试跑：

- 安装方式：从官方 `github/spec-kit` 仓库 checkout 后，使用 Codex bundled Python 安装到临时目录。
- CLI 版本：`0.11.10.dev0`。
- 验证命令：`specify version` 成功。
- 初始化命令：`specify init <temp-project> --integration codex --integration-options="--skills" --ignore-agent-tools --script ps` 成功。
- 生成范围：临时项目内生成 `.specify/`、PowerShell scripts、templates、workflows、agent-context extension，以及完整 `.agents/skills/speckit-*` 套件。
- 当前仓库影响：未向 AI Mind 当前仓库写入官方 CLI 生成物，未覆盖 `.specify/`、`specs/`、ADR 或 `AGENTS.md`。

Codex skills gate 试跑结果：

- `$speckit-clarify`：结论为 `NEEDS_DECISION`，已由用户拍板采用“真实试跑 CLI、不覆盖现有规则、skills gate 作为验收、本版只做 pilot”的策略。
- `$speckit-checklist`：结论为 `PASS_WITH_NOTES`，无 blocker；需要记录 CLI / skills 真实试跑证据，并明确本地 lightweight skills 不等同于官方完整生成套件。
- `$speckit-analyze`：结论为 `READY_WITH_NOTES`，无 blocker；主要风险是防止官方生成物未经 review 合并，以及防止 Level A / B 被流程过度加重。
- 用户已在全新 Codex 会话中人工校验项目内 `speckit-*` skills 可发现、可触发，本版已无剩余人工 blocker。

## 发布验收

v0.3.2 发布前必须说明：

- 本版本到底是 tooling pilot 还是已强制化。
- 是否已经真实安装并试跑官方 CLI。
- 是否已经真实试跑 Codex skills。
- 哪些步骤仍需要人工执行。
- v0.3.3 是否建议继续强制化。
