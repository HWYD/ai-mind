# Plan 032：CLI + Codex Skills Dual-track Pilot

状态：已完成
版本：v0.3.2
日期：2026-06-28

## 目的

本计划定义 AI Mind 如何在不破坏 v0.3.1 治理基线的前提下，引入官方 Spec Kit CLI 与 Codex skills 双轨。

本版本不直接安装全局 CLI，也不假设所有开发者的 Codex 环境已经具备相同 skills。安装、授权、版本确认和真实体验验证属于人工步骤。

## 当前仓库基线

已存在：

- `.specify/memory/constitution.md`
- `specs/README.md`
- `specs/020...`、`022...`、`023...`、`024...`、`030...`、`031...`
- `docs/architecture/ai-coding-workflow.md`
- `docs/architecture/spec-driven-development.md`
- `docs/adr/`
- `.agents/skills/ai-mind-step-audit/`

当前缺口：

- 尚未把官方 Spec Kit CLI 作为团队默认必装工具。
- 尚未决定是否把官方 CLI 生成的完整 Codex skills 套件合并进当前仓库。
- 尚未在全新 Codex 会话中验证项目内 `speckit-*` skills 的自动发现体验。
- 尚未决定 v0.3.3 是否接入 pinned CLI、官方完整 skills 或 CI 检查。

## 双轨职责

### Spec Kit CLI

职责：

- 作为官方流程入口。
- 用于初始化、生成或检查 Spec Kit 风格资产。
- 作为后续评估 “AI Mind 是否偏离官方最佳实践” 的参照。

限制：

- CLI 不替代当前代码、测试、ADR 与 specs 的事实判断。
- CLI 输出不得覆盖已有有效规范。
- CLI 安装不进入本版本自动化脚本，除非用户明确授权。

### Codex Skills

职责：

- 在 Codex 中降低 clarify / checklist / analyze 的执行成本。
- 用 repo 内上下文组织检查问题。
- 让 AI coding agent 更稳定地遵循 AI Mind 的事实源优先级。

限制：

- Codex skills 不属于 AI Mind 产品 runtime。
- Codex skills 不影响 webapp、stream-core、database 或 Tasklist Agent。
- Codex skills 不应读取 `private-folder/` 作为默认事实源。

### 人工等价

职责：

- 在 CLI / skills 不可用时保持流程可运行。
- 作为 reviewer 的兜底复核方式。
- 防止外部工具不可用阻塞开发。

## 推荐执行链

```text
P0 确认 v0.3.2 范围和 Level D
  -> P1 写 spec.md
  -> P2 执行 clarify gate（CLI / skill / 人工等价）
  -> P3 写 plan.md + acceptance.md
  -> P4 执行 checklist gate（CLI / skill / 人工等价）
  -> P5 写 tasks.md + decisions.md
  -> P6 执行 analyze gate（CLI / skill / 人工等价）
  -> P7 可选安装 / 试跑官方 CLI 与 Codex skills
  -> P8 更新 docs / ADR / README / release assets
  -> P9 验证与人工 review
```

## Pilot 安装策略

本版本采用保守安装策略：

- 默认不把 CLI 安装写进 `pnpm install`、`prepare`、CI 或 package scripts。
- 如果用户决定试装，应按官方文档在本地执行，并记录版本、命令、结果。
- 如果官方 CLI 生成文件与当前仓库文件冲突，应先 review diff，不允许直接覆盖。
- 如果官方 CLI 生成 Codex skills，应优先比较与 `.agents/skills/ai-mind-step-audit/` 的职责差异，而不是合并成一个大 skill。

## Pilot 试跑记录

v0.3.2 已完成一次隔离试跑：

```text
Tool: Specify CLI
Source: github/spec-kit temporary checkout
Version: 0.11.10.dev0
Install target: OS temp directory
Init target: OS temp directory
Command: specify init <temp-project> --integration codex --integration-options="--skills" --ignore-agent-tools --script ps
Result: success
Current repo writes: none
```

观察结论：

- 官方 CLI 已支持 Codex integration 与 skills mode。
- Windows 下可以生成 PowerShell scripts。
- 官方生成的是完整 `speckit-*` skills 套件，不只是 clarify / checklist / analyze。
- AI Mind 当前本地 skills 更适合作为项目约束适配层；是否替换为官方完整套件，需要后续版本专门评估。
- 当前不应把 dev checkout 版本作为团队基线；如果后续强制化，应使用官方 release tag pinning。

## 验证策略

文档与治理资产变更的最小验证：

- `git diff --check`
- `rg` 检查旧流程与新双轨表述是否冲突
- 检查 `specs/032...` 五件套是否完整
- 检查 ADR 与 architecture docs 是否引用一致

如果后续实际安装 CLI 或生成 skills，还需要额外验证：

- CLI 命令实际可运行
- 生成文件不覆盖现有有效规范
- Codex skills 在当前 Codex 环境中可发现、可触发
- skills 不默认读取 `private-folder/`
- skills 输出能引用当前 specs / ADR / architecture docs

## 人工处理项

以下事项需要用户或维护者处理：

- 是否安装官方 Spec Kit CLI。
- 是否允许 CLI 写入仓库文件。
- 是否接受官方生成的 Codex skills。
- 是否将 CLI / skills 从 pilot 升级为团队默认必装。
- 是否在未来 CI 中强制检查。
