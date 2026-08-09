# README 同步规则

## 定位

根 `README.md` 是 AI Mind 对外入口文档，用于让第一次进入仓库的读者快速了解：

- 项目是什么。
- 项目不是什么。
- 项目解决哪些 AI Runtime 工程问题。
- 当前版本做到了哪里。
- 当前有哪些能力。
- 当前仍然明确不做什么。
- 当前代码结构和运行方式。
- 版本演进路线。
- 后续 Roadmap。
- 公开 docs 文档入口。

它不是完整方案文档，也不是 release note，更不是内部执行记录。

README 的第一目标读者包括：

- GitHub 首次访问者。
- 技术读者。
- 技术面试官或代码审阅者。

第一屏必须让读者在 30 秒内理解：AI Mind 是一个持续演进的 AI Native Runtime Skeleton，不是普通 AI Chat Demo，也不是完整商业化 Agent 平台。

## 更新时机

每次版本功能基本完成，并完成 specs、ADR、architecture docs 和公开版本资产收口后，都必须检查根 `README.md` 是否需要同步。

推荐顺序：

1. 完成功能实现与最小验证。
2. 同步 `specs/`、ADR、architecture docs。
3. 同步公开 `docs/versions`、`docs/releases`、`docs/tasklists`。
4. 更新根 `README.md`。
5. 做公开化和重复模块检查。

## 每版必须检查的 README 模块

### 第一屏项目定位

README 标题下方应优先说明：

- AI Mind 是什么：持续演进的 AI Native Runtime Skeleton。
- 它解决什么：AI 应用从单轮聊天走向能力接入、流式协议、Skill Runtime、MCP 集成和执行过程可视化时的运行时架构问题。
- 它不是什么：不是普通 AI Chat Demo，不是完整商业化 Agent 平台。
- 当前阶段：Runtime Skeleton / MVP。

要求：

- 专业、克制、清楚，不写成营销文案。
- 不夸大为生产级 Agent / workflow / RAG / 多 server 平台。
- 如果有主界面 GIF 或截图，放在第一屏项目定位后，推荐路径为 `assets/screenshots/`。

### 项目解决的问题

README 靠前位置应保留“项目解决的问题”或等价小节，说明项目关注：

- Runtime 边界如何拆分。
- Tool / Resource / Prompt 如何建模。
- 结构化流式协议如何承载 reasoning、tool、resource、prompt、text、error 等 chunk。
- Skill Runtime 如何承接任务。
- MCP 如何接入 local / remote 能力。
- 前端如何展示执行事实和可观察过程。

要求：

- 面向第一次阅读者，不假设读者熟悉项目版本史。
- 不只写版本更新，要说明工程问题。

### 项目定位与边界

README 应保留“项目定位与边界”或等价小节，明确：

- AI Mind 是 AI Native Runtime Skeleton。
- 它适合作为 AI 应用前端、AI Runtime、MCP 接入和流式协议的技术探索项目。
- 它不是普通 AI Chat Demo。
- 它不是完整商业化 Agent 平台。
- 它不是 Dify / LangGraph 的替代品。
- 当前重点不是完整生产级多 Agent 系统。

不要提及其他个人项目、求职、简历或不属于 AI Mind 自身的信息。

### 与 LangChain / LangGraph 的关系

README 应保留一个克制的小节说明与 LangChain / LangGraph 的关系。

表达原则：

- 不写竞品对比。
- 不声称 AI Mind 替代或优于 LangChain / LangGraph。
- 明确 LangChain 更适合快速构建 LLM 应用、集成模型、工具和 RAG 能力。
- 明确 LangGraph 更适合构建具备状态、分支、持久化、Human-in-the-loop 的复杂 Agent / Workflow。
- 明确 AI Mind 更小，定位是 AI Native Runtime Skeleton，关注运行时边界、结构化流式协议、capability model、Skill Runtime、MCP 接入和前端执行过程可视化。

核心表达：AI Mind 的价值在于拆解和观察 AI 应用运行时如何被前端产品化表达，而不是替代成熟框架。

### 快速阅读指南

README 应保留 5 行以内的“快速阅读指南”，帮助不同读者跳转：

- 项目定位与边界。
- 架构总览和核心设计。
- 版本演进和 docs/versions。
- 开发与常用验证。
- 系列博客。

### 架构总览

README 应保留 Mermaid 架构图。

要求：

- 图必须符合真实代码实现，不出现不存在的模块。
- 图应体现 `User Input -> API Route -> chat-service facade -> Runtime` 主入口。
- 图应体现 `Capability Side` 和 `Stream Side` 两类边界。
- `Stream Side` 至少体现 `@ai-mind/stream-core -> NDJSON Stream -> UI Events`。
- `Capability Side` 应按真实实现区分 internal tools、MCP Host、local stdio MCP、remote Streamable HTTP MCP。
- MCP 图不能只写成 `Remote MCP`，应区分：
    - internal tools。
    - local `stdio` MCP，例如 `weather-server`、`project-docs-server`。
    - remote `Streamable HTTP` MCP，例如 `project-assistant-service`。
- 图后用 5 到 8 行解释每层职责。

### 核心设计

README 应保留核心设计说明，至少覆盖：

- Runtime Layer：`route -> chat-service facade -> runtime -> skills / tools / mcp`。
- Stream Core：`@ai-mind/stream-core` 的职责和抽包价值。
- Capability Model：Tool / Resource / Prompt 的统一描述层。
- Skill Runtime：当前 Skill 职责，以及 Skill 不应偷偷长成 Agent。
- MCP Integration：local stdio MCP 和 remote Streamable HTTP MCP 的定位。

### 当前状态

需要同步：

- 当前版本号。
- 本版本主线。
- 已经完成的核心能力。
- 当前仍然明确不做的边界。
- package version；如果本地维护内部当前版本配置，也需要同步。

要求：

- 不把后续计划写成已完成能力。
- 不夸大 Agent、workflow、多 server、OAuth、数据库、完整平台化等未完成能力。
- 表述应适合第一次看到项目的读者。

### 版本号资产同步

正式版本收口时，必须检查项目版本号资产是否与当前版本一致。

当前 AI Mind 采用 lockstep project version：

- 根 `package.json`
- `apps/*/package.json`
- `packages/*/package.json`

同步规则：

- 文档、release、runtime note、README 中使用 `vX.Y.Z`。
- `package.json` 的 `version` 使用不带 `v` 的 `X.Y.Z`。
- 未进入正式版本收口时，不提前 bump package version。
- 历史文档、历史 fixture、mock 样例数据和明确描述旧版本能力的代码注释，不因为当前版本收口而批量改写。

### 当前能力

需要同步当前真实可用能力，例如：

- Chat Runtime。
- Skills。
- Tools。
- MCP Host / MCP capability。
- 工程化边界。

要求：

- 能力列表以真实实现为准。
- 不把 mock 验证能力写成完整生产平台能力。
- 对 remote / local、mock / real 的边界要写清楚。

### 当前结构

需要同步关键目录和职责。

要求：

- 只写对理解项目有帮助的结构。
- 不列过细内部路径。
- 新增 app、package、核心 runtime 边界时要更新。

### 关键代码入口

README 应提供“关键代码入口”表格，让读者可以直接跳到源码。

至少包含：

- Runtime 主编排：`apps/webapp/lib/ai/runtime`
- Stream Core：`packages/stream-core/src`
- Capability Model：`apps/webapp/lib/ai/capabilities`
- Composer V1：`apps/webapp/components/chat/composer`
- MCP Integration：`apps/webapp/lib/ai/mcp`

要求：

- 链接必须指向真实存在的目录或文件。
- 每个入口要说明读者应该看什么。

### 快速开始前置条件

README 应在“开发”前说明本地运行前置条件：

- Node.js 推荐版本。
- pnpm 版本。
- Ollama。
- 推荐模型。
- 如需 remote MCP 验证，说明需要启动对应服务。

要求：

- 以当前代码默认配置为准。
- 推荐模型要与实际默认模型一致。
- 不写不存在的云服务或生产部署要求。

### 项目文档

根 README 应保留公开 docs 入口：

- `docs/architecture`
- `docs/versions`
- `docs/releases`
- `docs/tasklists`

如果 `docs/` 结构变化，需要同步该入口。

### 版本演进

版本演进建议使用表格。

推荐列：

- `Version`
- `Theme`
- `Key Changes`

要求：

- 每次新增版本后追加一行。
- 每行只写最核心主题和关键变化。
- 完整细节引导到 `docs/`。

### Roadmap

Roadmap 需要反映当前已完成能力和后续方向。

要求：

- 已完成版本能力使用 `[x]`。
- 后续方向使用 `[ ]`。
- 后续方向要克制，不写成已完成能力。
- vNext 方向可以写，但必须保持计划语气。

### 开发与验证

当新增 app、package、脚本或验证方式时，检查：

- 开发命令是否需要更新。
- 常用验证命令是否需要更新。
- 新增服务是否需要说明启动方式。

### 可以试试这些问题

README 应保留“可以试试这些问题”或等价小节，放在“开发”之后、“常用验证”之前。

要求：

- 示例必须符合当前项目真实可触发能力。
- 不放泛泛的架构解释类问题，除非它明确引用可读取的 docs resource。
- 优先覆盖最稳定能力，例如 local MCP weather、docs summary、remote context。
- 对 `/tasklist`、`/check` 这类当前只作为 hint 的 command，要明确说明它们不等同于立即执行 remote Prompt 或 remote Tool。

### Design Notes / 设计说明

README 应保留问答式设计说明，面向技术读者和技术面试官。

建议覆盖：

- 为什么抽离 stream-core。
- 为什么建立 capability model。
- 为什么从 allowedTools 转向 capability selectors。
- 为什么接入 MCP。
- 为什么展示执行过程。
- 当前为什么不直接做完整 Agent / Workflow。

要求：

- 结合真实实现回答，不编造未完成能力。
- 语气专业、克制、可信。

## 风格规则

- 以中文为主。
- 保留必要英文技术名词。
- 入口文档要简洁，不写成方案文档。
- 适合第一次看到项目的读者。
- 不出现内部协作话术、临时排查过程或本地私有路径。
- 不出现 HelpKnow.ai、个人简历、面试经历或其他非 AI Mind 项目信息。
- 不伪造截图、Star、用户数、线上数据。
- 不把 mock 能力写成生产级能力。
- 不把计划项写成已完成能力。

## 检查清单

每次更新 README 后至少检查：

- 是否只有一个“项目文档”模块。
- 是否只有一个“版本演进”模块。
- 是否只有一个“Roadmap”模块。
- 是否保留 Mermaid 架构图，且图与真实代码一致。
- 是否保留第一屏项目定位、主图、项目边界、快速阅读指南、关键代码入口、快速开始前置条件、可以试试的问题、Design Notes。
- 是否保留 License。
- 是否没有 `private-folder`、本地绝对路径、token、env、面试、简历等不应公开内容。
- 是否没有 HelpKnow.ai、个人简历、用户数、Star 数等与项目无关或不可验证信息。
- Roadmap 是否没有把计划项写成完成项。
- 当前状态是否与最新 release / docs / 代码实现一致。
- package versions 是否与当前版本一致。
- 示例问题是否能被当前实现稳定触发。
- docs / release / README 中的当前版本、能力边界和验证命令是否一致。
