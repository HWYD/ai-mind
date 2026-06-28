# 任务 032：Spec Kit CLI + Codex Skills Dual-track Pilot

状态：已完成
版本：v0.3.2
日期：2026-06-28

## P0 Scope and Level Confirmation

- [x] 确认 v0.3.2 采用 CLI + Codex skills 双轨。
- [x] 确认本版本按 Level D 处理。
- [x] 确认本版本不修改 runtime、Graph、DB、stream、API 或前端 reducer。
- [x] 确认本版本需要 ADR 与 architecture docs。

## P1 Official Source Check

- [x] 核对 Spec Kit 官方仓库与安装文档。
- [x] 核对 Codex customization / skills 官方口径。
- [x] 记录官方资料来源。
- [x] 人工确认本版真实试跑官方 Spec Kit CLI，但采用临时安装 / 临时初始化，不做全局必装。
- [x] 人工确认官方 CLI 不允许直接覆盖当前仓库文件；如需引入生成物，必须先 review diff。

## P2 Spec Assets

- [x] 创建 `specs/032-spec-kit-cli-codex-skills-pilot/spec.md`。
- [x] 创建 `specs/032-spec-kit-cli-codex-skills-pilot/plan.md`。
- [x] 创建 `specs/032-spec-kit-cli-codex-skills-pilot/tasks.md`。
- [x] 创建 `specs/032-spec-kit-cli-codex-skills-pilot/acceptance.md`。
- [x] 创建 `specs/032-spec-kit-cli-codex-skills-pilot/decisions.md`。

## P3 Spec Kit Gates

- [x] 执行人工等价 clarify gate，记录在本版本 specs 中。
- [x] 执行人工等价 checklist gate，记录在 `acceptance.md`。
- [x] 执行人工等价 analyze gate，记录在 `decisions.md`。
- [x] 使用 `$speckit-clarify` 做 Codex skill gate 检查，并根据用户拍板补齐策略。
- [x] 使用 `$speckit-checklist` 做 Codex skill gate 检查，结论为 PASS_WITH_NOTES。
- [x] 使用 `$speckit-analyze` 做 Codex skill gate 检查，结论为 READY_WITH_NOTES。
- [x] 补跑官方 CLI 临时试跑，并记录 CLI version / init 结果。
- [x] 记录 Codex skills gate 与人工等价 gate 的关系：skills 降低执行成本，人工等价仍保留。

## P4 ADR and Architecture Docs

- [x] 新增 ADR-0006：Spec Kit CLI and Codex Skills Dual-track。
- [x] 新增 architecture doc：`docs/architecture/spec-kit-tooling.md`。
- [x] 更新 ADR README。
- [x] 更新 `specs/README.md` 版本索引。
- [x] 新增项目内 pilot Codex skills：`speckit-clarify`、`speckit-checklist`、`speckit-analyze`。
- [x] 更新 `AGENTS.md`，记录 v0.3.2 双轨 pilot 的当前仓库事实。
- [x] 根据本版试跑结果决定：v0.3.2 不把官方 CLI 提升为默认必装，是否强制化留给 v0.3.3+。

## P5 Optional Tooling Pilot

- [x] 在临时目录执行官方 CLI 安装与初始化试跑，不写入当前仓库。
- [x] 检查 CLI 生成文件形态：官方会生成完整 `.specify/` 与 `.agents/skills/speckit-*` 套件。
- [x] 用户在新 Codex 会话中验证项目内 `speckit-*` skills 是否可发现、可触发。
- [x] 比较 CLI / skills / 人工等价三种输出质量。
- [x] 记录是否值得在 v0.3.3 强制化：本版不强制，后续可评估引入官方完整 skills 套件或 pinned CLI。

## P6 Verification and Review

- [x] 执行 `git diff --check`。
- [x] 执行文档一致性搜索。
- [x] 确认本次未修改 runtime / package scripts / dependencies，因此不需要 typecheck 或 build。
- [x] 确认本次未修改 package scripts 或 tooling 配置，因此不需要额外 targeted tests。
- [x] 做人工 review：确认双轨没有变成所有小改的强制仪式。
