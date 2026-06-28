# 开源 docs 文档资产规则

## 定位

`docs/` 是 AI Mind 的开源展示文档区，用于让 GitHub 读者、开源浏览者和第一次接触项目的人快速理解项目版本演进、架构边界和发布结果。

`docs/` 不是单一职责目录，需要区分：

- `docs/adr/` 和 `docs/architecture/` 是长期架构约束区。
- `docs/versions/`、`docs/releases/`、`docs/tasklists/` 是公开展示区。

日常版本工作以 `.specify/memory/constitution.md`、`specs/`、当前代码实现、测试、ADR 和 architecture docs 为主。

`private-folder/` 是草稿、历史和个人内部材料区，不是默认开发事实源。

## 更新时机

`docs/` 默认在版本功能基本完成、specs、ADR 和 architecture docs 收口之后更新。

推荐顺序：

1. 完成功能实现与最小验证。
2. 同步 `specs/`、ADR、architecture docs。
3. 基于 specs、ADR、architecture docs 和真实代码实现整理公开版 `docs/`。
4. 如使用 `private-folder/` 草稿素材，先做公开化清理扫描。

不要在版本早期用 `docs/` 反向指导实现，也不要把未落地的设想写成已完成能力。

## 目录职责

### `docs/versions/`

放每个版本的公开设计文档。

内容重点：

- 为什么做这一版。
- 做什么。
- 不做什么。
- 关键设计取舍。
- 重要接口或协议变化。
- 验证方式。
- 最终结果。

推荐结构：

- `Summary`
- `Goals`
- `Non-goals`
- `Key Changes`
- `Important Interface Changes`
- `Test Plan`
- `Result / Outcome`

### `docs/architecture/`

放跨版本长期成立的架构说明。

内容重点：

- Runtime 边界。
- Stream core 边界。
- Capability / Skill / MCP 分层。
- 长期设计原则。
- 需要避免的反模式。

不要写成 tasklist，也不要记录临时实施过程。

### `docs/releases/`

放公开版 release note。

内容重点：

- 本版本最终完成了什么。
- 哪些行为或结构发生变化。
- 技术亮点。
- 已知限制。
- 下一步方向。

推荐结构：

- `Summary`
- `Completed`
- `Changed`
- `Technical Highlights`
- `Known Limits`
- `Next`

注意：

- GitHub Release 页面正文可以从 `docs/releases/` 或当前版本 specs / release 材料整理。
- 如果使用 `private-folder/` 中的草稿 release 文案，必须先确认其仍符合当前 specs 和真实实现。
- 可复制正文建议使用一段版本概述、`Highlights`、`Verification`、`Known Limits`。
- 可复制正文尽量避免过深嵌套列表，发布页里优先保持紧凑可扫读。
- `docs/releases/` 继续作为仓库公开长期归档文档，保持结构统一和公开可读。

### `docs/tasklists/`

放公开版任务清单。

内容重点：

- 只保留 major step。
- 每个 major step 下最多 2 到 3 条说明。
- 保留关键验收点。
- 删除内部执行纪律、暂停确认、临时排查记录和过细文件路径。

## 语言风格

- 以中文为主。
- 保留必要英文技术名词，例如 Runtime、Tool、Resource、Prompt、MCP、Skill、workspace package。
- 版本设计和 release 文档可以保留固定英文结构标题，例如 `Summary / Goals / Non-goals / Test Plan`，正文保持中文。
- 架构文档标题可优先使用中文，让阅读体验更自然。
- 表达保持专业、清晰、简洁，不做过度包装。

## 公开化清理规则

整理 `docs/` 时必须删除：

- 本地绝对路径。
- 面向用户、release、博客和 tasklist 的公开文档中的 `private-folder` 字样。
- 账号、token、env、机器环境等敏感或半敏感信息。
- 个人求职、简历、面试相关内容。
- 对话式内容，例如“等待确认”“你确认后继续”“我会怎么推进”。
- AI 执行过程话术。
- 临时调试记录和过细排查过程。
- 未实现能力的完成式表述。

尤其注意：

- 不要声称已经实现 Agent、workflow、多 remote server 编排、OAuth、数据库、第三方 API 或完整平台化能力。
- 如果源资料缺失或不确定，用“待补充”，不要编造。
- `docs/adr/` 和 `docs/architecture/` 可以为了说明工作区治理而提及 `private-folder` 的目录定位，但不得搬运其原文、内部协作话术、个人材料或本地细节。

## 与 private-folder 的关系

`private-folder` 是草稿、历史和个人内部材料区，不是工作主力区。

两者关系是：

> 优先依据 specs、ADR、architecture docs、代码和测试整理公开版 docs；必要时可以参考 private-folder 草稿，但不能让草稿覆盖正式事实源。

不要把 `private-folder` 原样搬到 `docs/`。

## 每次更新后的检查

更新 `docs/` 后建议至少检查：

- 目标文件是否齐全。
- 是否残留本地路径或内部目录名。
- 是否残留敏感词、对话式话术或 AI 执行话术。
- 是否夸大未完成能力。
- 版本设计、release、tasklist、architecture 的定位是否混淆。
- 中文主表达是否一致。
