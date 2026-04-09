# AI Mind

一个按版本持续演进的 AI Native Runtime Skeleton。

它从本地聊天闭环起步，逐步演进到：

- 结构化流式协议
- Tool Calling
- Multi-Tool Runtime
- Skill Runtime
- MCP / Agent / 数据层

## 当前状态

当前版本：`v0.0.9`

这一版的主线是：

- 保持 `utility-skill + reader-skill`
- 把 `reader-skill` 正式接到本地 `stdio MCP Host MVP`
- 让天气查询走 MCP Tool
- 让根目录文本读取走 MCP Resource
- 在前端把 Tool / Resource 的来源与卡片分层表达清楚

## 当前能力

### Chat Runtime

- `LangChain.js + Ollama`
- NDJSON 流式协议
- `reasoning / tool / resource / text` 四段式 parts
- 最近 `N=8` 轮会话上下文
- `useChatStream` 前端流式消费

### Tools

- `calculator`
- `datetime`
- `text-transform`
- `unit-convert`
- `city-weather`
- `local-text-read`

### Skills

- `utility-skill`
- `reader-skill`

### MCP Host MVP

- 官方 TypeScript SDK：`@modelcontextprotocol/sdk`
- 本地 `stdio` MCP Host
- `weather-server`
- `project-files-server`
- MCP Tool / MCP Resource adapter

### 前端交互

- Skill 模式：
    - `自动`
    - `实用`
    - `读取`
- 模型选择器
- “深度思考”开关
- 推理过程折叠面板
- Tool 调用卡片
- Resource 读取卡片
- 顶部错误提示

## v0.0.9 主题

`v0.0.9` 的核心不是“项目支持了 MCP”这几个字本身，而是：

> 让现有 `reader-skill` 开始正式消费 MCP 能力来源，同时不污染 `utility-skill` 和普通聊天主链。

这一版要验证的是：

- MCP Tool 能否稳定接进当前 Tool Runtime
- MCP Resource 能否在当前消息协议和前端展示里成为独立概念
- `reader-skill` 能否成为 MCP 的第一层正式承载层
- 普通聊天与 `utility-skill` 是否仍然稳定

## reader-skill

`reader-skill` 是一个“外部上下文获取 Skill”，当前只负责：

- 查询指定城市的实时天气
- 读取项目根目录下的文本文件
- 基于 Tool / Resource 结果做简洁说明、总结或提取

它不负责：

- 通用写作
- 网页抓取
- 搜索
- Agent 式多步任务
- 任意文件系统访问

允许使用的能力：

- `city-weather`（底层走 MCP Tool）
- `local-text-read`（底层走 MCP Resource）

## MCP 能力接入策略

当前策略：

- 对模型保留原有能力名：
    - `city-weather`
    - `local-text-read`
- 只替换底层能力来源，不改变模型侧心智负担
- MCP 相关代码默认只放服务端 / Node runtime
- 优先按官方 SDK 子路径导入，不自行补假的 ambient types

## 技术分层

- `utility-skill`：继续承载实用型、确定性任务
- `reader-skill`：承载实时天气和本地文本读取
- MCP：作为能力来源接入，不直接进入主运行时语义层
- 前端：通过 Tool / Resource 两类卡片表达来源差异

## 版本演进

- `v0.0.4`：本地聊天 + Streamdown
- `v0.0.5`：最小 Tool Calling
- `v0.0.6`：Multi-Tool Runtime
- `v0.0.7`：第一层 Skill Runtime（`utility-skill`）
- `v0.0.8`：`reader-skill`
- `v0.0.9`：MCP Host MVP 接入现有 Skill Runtime

## 开发

安装依赖：

```bash
pnpm install
```

启动开发环境：

```bash
pnpm dev
```

常用验证：

```bash
pnpm lint:webapp:fix
pnpm lint:webapp
pnpm typecheck
pnpm build
```

## Roadmap

- [x] 本地聊天闭环
- [x] Tool Calling
- [x] Multi-Tool Runtime
- [x] 第一层 Skill Runtime
- [x] `reader-skill`
- [x] MCP Host MVP
- [ ] `reader-skill` MCP 稳定性收口
- [ ] 更多 MCP 能力接入
- [ ] Agent Runtime 骨架

## License

MIT
