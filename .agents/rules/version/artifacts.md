# 版本交付物规则

## Version Spec Workspace Continuity

版本尚未收口时，版本规格必须保持单一工作区，避免同一版本出现两套互相竞争的事实源。

- 先读取 `.specify/feature.json`，把其中的 `feature_directory` 视为当前 Spec Kit 工作区指针，并核对 `AGENTS.md` 的 managed plan 指针。
- 如果当前任务的 `vX.Y.Z` 已有 canonical `specs/<version-topic>/`，且尚未完成 release closing / merge，后续 specify、clarify、plan、tasks、implement、analyze、converge 和人工修订都 MUST 复用该目录。
- 代码未提交、规格仍在讨论、tasks 尚未收口或 converge 尚未通过时，均视为版本仍在开发中；不得创建 `vX.Y.Z-1-*`、`vX.Y.Z-2-*` 等新目录来承载返工或新决策。
- 只有用户明确要求独立 follow-up，或基准版本已经 release closing 并进入新的开发窗口，才允许创建挂靠规格；创建前必须记录其独立目标、边界和与基准版本的关系。
- 方案发生冲突时，直接编辑 canonical 工作区中的 spec / plan / tasks / contracts / decisions；旧决策应删除、改写或明确标记为 superseded，不得保留为第二套默认事实源。
- 交付前检查 `specs/` 是否存在同一 semver 的 sibling directories；若存在且没有用户授权和独立边界说明，必须先合并回 canonical 工作区再继续实现或 release closing。

## 目标

保证每个有意义的版本，不只交付代码，还交付可复盘的版本材料。

## 至少要检查的资产

- `README.md`
- `.specify/memory/constitution.md`
- 对应版本的 `specs/`
- `docs/adr/`（如果是架构决策）
- `docs/architecture/`（如果影响长期结构）
- `docs/versions/`
- `docs/releases/`
- `docs/tasklists/`
- blog material（如果本版需要对外文章）
- `private-folder/` 仅在用户明确要求保留草稿、历史过程或个人内部材料时检查

## 版本级检查

完成版本时，至少回答：

- 这版解决了什么问题
- 这版刻意没做什么
- 这版的边界是否清晰
- 如果是 Level C / D，是否已执行 Spec Kit clarify / checklist / analyze gate，或已完成人工等价检查
- README 是否仍然描述的是现在的项目
- `specs/` 是否反映真实实现
- 是否留下了公开 release 说明
- 如果是长期结构变化，是否留下了 ADR 或 architecture 说明

说明：Level A / Level B 不强制执行 Spec Kit command / skill；只有边界不清或影响面升级时才需要选择性补做澄清。

## 版本号同步

正式版本收口时，检查这些版本号资产是否一致：

- 根 `package.json`
- `apps/*/package.json`
- `packages/*/package.json`

格式约定：

- 文档与配置使用 `vX.Y.Z`
- `package.json` 使用 `X.Y.Z`
- 不要批量误改历史 fixture、mock 或旧版本文档
