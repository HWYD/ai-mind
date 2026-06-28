# 版本交付物规则

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
- `private-folder/agent-config/project-agent-config.yaml` 的 `current_version`（如果本地维护该配置）

格式约定：

- 文档与配置使用 `vX.Y.Z`
- `package.json` 使用 `X.Y.Z`
- 不要批量误改历史 fixture、mock 或旧版本文档
