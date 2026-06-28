# AGENTS

## 适用范围

本文件适用于 `docs/` 下的架构文档、ADR、版本说明、公开 release 和公开 tasklist。

## 核心定位

- `docs/` 不是单一职责目录，需要按子目录区分事实源角色。
- `docs/adr/` 和 `docs/architecture/` 是长期架构约束区，可以作为跨版本架构事实来源。
- `docs/versions/`、`docs/releases/`、`docs/tasklists/` 是公开展示区，不是版本开发任务拆解的默认事实源。
- 公开展示区默认在 specs、ADR、architecture docs 和真实实现基本收口后更新。

## 公开化规则

- 不原样搬运 `private-folder` 草稿。
- 删除本地路径、私有目录名、内部协作话术、临时排查过程和 AI 执行过程。
- 不声称未完成能力已经实现。
- 保留必要英文技术名词，但正文以中文为主。

## 目录职责

- `docs/adr/`：长期架构决策
- `docs/architecture/`：当前架构事实和长期边界
- `docs/versions/`：公开版版本设计与版本总结
- `docs/releases/`：公开 release 归档
- `docs/tasklists/`：公开版任务清单

详细同步与公开化规则见 `.agents/rules/docs/open-source-docs.md` 与 `.agents/rules/docs/readme-sync.md`。
