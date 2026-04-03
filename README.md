# AI Mind

一个按版本持续演进的 AI Native Runtime Skeleton。

它从本地聊天闭环起步，逐步演进到：

- 结构化流式协议
- Tool Calling
- Multi-Tool Runtime
- Skill Runtime
- MCP / Agent / 数据层

## 当前状态

当前版本：`v0.0.8`

这一版的主线已经收敛为两条：

- Runtime：以 `utility-skill + reader-skill` 验证第二个正式 Skill
- 前端：建立正式 `shadcn/ui` 基线，并统一输入区、推理面板、Tool 卡片与错误提示

## 当前能力

### Chat Runtime

- `LangChain.js + Ollama`
- NDJSON 流式协议
- `reasoning / tool / text` 三段式 parts
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

### 前端交互

- Skill 模式：
    - `自动`
    - `实用`
    - `读取`
- 模型选择器
- “深度思考”开关
- 推理过程折叠面板
- Tool 调用卡片
- 顶部错误提示

## v0.0.8 主题

`v0.0.8` 不再继续围绕 `writer-skill` 展开，而是收敛成：

> 用 `reader-skill` 验证 Skill Runtime 对“模型自身没有的外部上下文能力”的承载方式。

这一版要验证的是：

- 模型拿不到的实时天气，能否通过 Tool 稳定补上
- 模型看不到的本地根目录文本，能否通过 Tool 安全读取
- 自动模式、显式 Skill、普通聊天回退，能否同时保持边界清晰

## reader-skill

`reader-skill` 是一个“外部上下文获取 Skill”，只负责：

- 查询城市实时天气
- 读取项目根目录下的文本文件
- 基于 Tool 结果做简洁说明、总结或提取

它不负责：

- 通用写作
- 网页抓取
- 搜索
- Agent 式多步任务

允许使用的 Tool：

- `city-weather`
- `local-text-read`

## Tool 简介

### city-weather

用途：

- 查询指定城市的实时天气

输入：

- `city`

特点：

- 使用 `wttr.in`
- 免费
- 无 API Key
- 适合为本地模型补实时信息

### local-text-read

用途：

- 读取项目根目录下的文本文件

输入：

- `filename`

边界：

- 只允许根目录直接文件
- 不允许子目录
- 不允许绝对路径
- 不允许 `../`
- 只允许文本类文件

## Skill 路由

当前策略：

1. 显式 `options.skill` 优先
2. 未传 `skill` 时走轻量规则路由
3. 高置信实用请求 -> `utility-skill`
4. 高置信天气 / 文件读取请求 -> `reader-skill`
5. 未命中 -> 回退普通聊天链路

## 前端 UI 基线

`v0.0.8` 这一轮同时把前端组件收进正式 `shadcn/ui` 基线。

当前约定：

- style：`radix-vega`
- primitive：`Radix`
- icon：`lucide-react`
- theme：`cssVariables=true`

当前已统一的区域：

- 输入区控制条
- 顶部错误条
- 推理过程面板
- Tool 结果卡片
- 空状态

这一轮还补了几项交互细节：

- 输入框上下边距收紧
- 推理面板上下边距收紧
- Tool 状态色区分：
    - 完成：绿色
    - 执行中：蓝色
    - 失败：红色
- `实用` / `读取` 模式下的输入提示文案分开

## 版本演进

- `v0.0.4`：本地聊天 + Streamdown
- `v0.0.5`：最小 Tool Calling
- `v0.0.6`：Multi-Tool Runtime
- `v0.0.7`：第一层 Skill Runtime（`utility-skill`）
- `v0.0.8`：`reader-skill` + 正式前端组件基线

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
pnpm typecheck
pnpm build
```

## Roadmap

- [x] 本地聊天闭环
- [x] Tool Calling
- [x] Multi-Tool Runtime
- [x] 第一层 Skill Runtime
- [x] `reader-skill`
- [x] `shadcn/ui` 前端基线接入
- [ ] `reader-skill` 稳定性收口
- [ ] 网页读取 / MCP 接入
- [ ] Agent Runtime 骨架

## License

MIT
