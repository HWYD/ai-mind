# 开源 docs 文档资产规则

## 定位

`docs/` 是 AI Mind 的开源展示文档区，用于让 GitHub 读者、开源浏览者和第一次接触项目的人快速理解项目版本演进、架构边界和发布结果。

`docs/` 不是版本开发、架构决策、任务拆解或代码实现的主参考区。

日常版本工作仍以以下内容为主：

- `README.md`
- `private-folder/plans/`
- `private-folder/tasklists/`
- `private-folder/runtime/`
- `private-folder/releases/`
- `private-folder/architecture/`
- 当前代码实现

## 更新时机

`docs/` 默认在版本功能基本完成、内部版本资产收口之后更新。

推荐顺序：

1. 完成功能实现与最小验证。
2. 同步内部版本资产：plan、tasklist、runtime note、release note、blog material。
3. 基于内部资产和真实代码实现整理公开版 `docs/`。
4. 做公开化清理扫描。

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

- GitHub Release 页面正文不直接从 `docs/releases/` 复制。
- GitHub Release 正文的主来源是 `private-folder/releases/` 中对应版本 release 文件里的可复制模块。
- 每个内部 release 文件应明确给出：
    - `Release title`：填入 GitHub Release 面板的标题输入框，例如 `AI Mind v0.0.11`
    - `Release notes`：填入 GitHub Release 面板的正文输入框
- 可复制模块必须使用明确边界标记：
    - `<!-- GITHUB_RELEASE_BODY_START -->`
    - `<!-- GITHUB_RELEASE_BODY_END -->`
- 复制到 GitHub Release 时，只复制这两个标记之间的内容，不包含标记本身。
- 可复制正文里不要再放版本同名一级或二级标题，例如不要包含 `## AI Mind v0.0.11`，避免和 GitHub Release title 重复。
- 可复制正文建议使用：
    - 一段版本概述
    - `### Highlights`
    - `### Verification`
    - `### Known Limits`
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
- `private-folder` 字样。
- 账号、token、env、机器环境等敏感或半敏感信息。
- 个人求职、简历、面试相关内容。
- 对话式内容，例如“等待确认”“你确认后继续”“我会怎么推进”。
- AI 执行过程话术。
- 临时调试记录和过细排查过程。
- 未实现能力的完成式表述。

尤其注意：

- 不要声称已经实现 Agent、workflow、多 remote server 编排、OAuth、数据库、第三方 API 或完整平台化能力。
- 如果源资料缺失或不确定，用“待补充”，不要编造。

## 与内部资产的关系

`private-folder` 是工作主力区，保存完整版本过程与内部材料。

`docs/` 是公开展示区，只保留对外可读、长期有价值、边界清晰的内容。

两者关系是：

> 先在内部资产中完成真实设计、实现、验证和收口，再从中整理出公开版 docs。

不要把 `private-folder` 原样搬到 `docs/`。

## 每次更新后的检查

更新 `docs/` 后建议至少检查：

- 目标文件是否齐全。
- 是否残留本地路径或内部目录名。
- 是否残留敏感词、对话式话术或 AI 执行话术。
- 是否夸大未完成能力。
- 版本设计、release、tasklist、architecture 的定位是否混淆。
- 中文主表达是否一致。
