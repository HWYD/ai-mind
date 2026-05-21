# AI Mind Docs

这个目录是 AI Mind 的长期文档导航区，用于帮助读者理解项目的架构边界、版本设计、发布记录和公开任务清单。

根 `README.md` 负责说明项目当前状态、当前能力、版本路线和常用开发方式；本文件只负责说明 `docs/` 下各类文档应该怎么阅读。

## 推荐阅读顺序

第一次了解项目时，建议按下面顺序阅读：

1. 先看根 [README](../README.md)，了解项目定位、当前状态和 Roadmap。
2. 再看 [Architecture](./architecture)，理解长期架构边界和核心分层。
3. 如果想了解某个版本为什么这样设计，看 [Versions](./versions)。
4. 如果只想快速了解每个版本交付了什么，看 [Releases](./releases)。
5. 如果想看公开版任务拆分和验收范围，看 [Tasklists](./tasklists)。

## 目录说明

### Architecture

[Architecture](./architecture) 存放跨版本长期成立的架构说明。

这里关注的是稳定边界，例如 runtime boundary、stream-core、capability / skill surface、controlled agent runtime 等内容。

### Versions

[Versions](./versions) 存放各版本公开设计方案。

这里更适合了解某一版为什么做、做什么、不做什么、关键设计取舍和验证方式。

### Releases

[Releases](./releases) 存放公开版发布说明。

这里更适合快速了解每个版本最终完成了什么、技术亮点、已知边界和下一步方向。

### Tasklists

[Tasklists](./tasklists) 存放公开版任务清单。

这里保留主要阶段和验收点，不包含内部执行过程或临时排查记录。

## 维护原则

- `docs/README.md` 保持长期稳定，只做文档导航。
- 根 `README.md` 负责当前状态和版本路线。
- 版本细节放在 `versions / releases / tasklists` 中。
- 长期架构边界放在 `architecture` 中。
- 文档内容以真实实现和已完成验证为准，不把计划项写成已完成能力。
