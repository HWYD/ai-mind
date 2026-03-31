# AI Mind

> 一个按版本持续演进的 AI Native Runtime Skeleton。  
> 它从本地聊天闭环出发，逐步长成支持 Tool、Skill、MCP、Agent 的可扩展运行时骨架。

## 项目定位

`AI Mind` 不是一次性做完的大而全产品，而是一条清晰的版本化演进路线：

- 本地聊天闭环
- 结构化流式协议
- Tool Calling
- Multi-Tool Runtime
- Skill Runtime
- MCP 能力接入
- Agent Runtime
- 持久化与业务系统集成

当前代码库更适合理解成一个持续生长的 Runtime Skeleton，而不是单点 Demo。

## 当前状态

当前版本：`v0.0.7`

这一版已经完成的核心能力：

- `LangChain.js + Ollama` 本地模型接入
- 自定义流式协议与 `useChatStream`
- `Markdown + typed parts + Streamdown` 内容渲染
- `Zod` 驱动的请求、流式 chunk、Tool 参数校验
- Multi-Tool Runtime
    - `calculator`
    - `datetime`
    - `text-transform`
    - `unit-convert`
- 第一层 Skill Runtime
    - `utility-skill`
- Tool Registry + Skill Registry 的轻插件化骨架
- `reasoning / tool / text` 三段式前后端协议
- 最近 `N=8` 轮上下文窗口
- Runtime 错误收束
    - 非法 tool call
    - tool 参数不合法
    - tool 执行失败
    - 请求取消
    - 流式错误收束

当前项目已经从“能跑通聊天和单 Tool Calling”的原型，继续升级成“具备 Skill 雏形的可扩展 AI Runtime”。

## 当前版本主题

`v0.0.7` 的重点不是继续增加更多 Tool，也不是直接跳到 Agent，而是：

> 在 `v0.0.6` Multi-Tool Runtime 的基础上，引入第一层 Skill Runtime，并验证“高层能力封装”是否成立。

这一版只落了一个正式 Skill：

- `utility-skill`

它对应的是一类稳定的日常确定性实用任务：

- 精确计算
- 时间与日期处理
- 文本转换与提取
- 单位换算
- 上述任务之间的轻量组合

## 架构概览

当前主链路可以概括为：

```text
User
  -> Web Chat UI
    -> /api/chat
      -> chat-service
        -> ChatOllama
          -> Tool Registry / Skill Registry
            -> Tool Calling Runtime
              -> Structured NDJSON Stream
                -> useChatStream
                  -> reasoning / tool / text 渲染
```

分层来看：

- 模型接入层：`LangChain.js + Ollama`
- Runtime 层：planning、tool calling、参数校验、执行、回填、错误收束
- Tool 层：独立 definition + registry
- Skill 层：高层约束、允许工具集合、输出策略
- 协议层：NDJSON + typed parts
- 前端展示层：`useChatStream + Streamdown + Tailwind CSS`

## 当前支持的 Tool

### `calculator`

负责确定性数值计算：

- 四则运算
- 括号运算
- 连续追问中的继续计算

### `datetime`

负责时间与日期相关任务：

- 当前时间
- 当前日期
- 星期判断
- 日期加减
- 相对日期表达

### `text-transform`

负责文本转换与提取：

- `markdown-to-text`
- `extract-links`
- `extract-code-blocks`
- `json-pretty`

### `unit-convert`

负责第一版单位换算：

- 长度：`mm / cm / m / km`
- 重量：`mg / g / kg`
- 温度：`C / F / K`

## 当前支持的 Skill

### `utility-skill`

这是 `v0.0.7` 新引入的第一层 Skill Runtime。
它不是简单的 prompt 片段，而是一种稳定能力模式：

- 定义高层任务域
- 约束允许使用的 Tool 集
- 提供统一输出风格
- 保持普通开放式对话仍可自然回答

当前 `/instamind` 默认启用：

- `options.skill = 'utility-skill'`

## 版本演进

### `v0.0.4`

最小聊天闭环：

- 本地模型对话
- 自定义流式输出
- Markdown 渲染
- 本地多轮上下文

### `v0.0.5`

最小 Tool Calling 闭环：

- 接入 `calculator`
- 跑通 `tool_calls -> 校验 -> 执行 -> ToolMessage 回填 -> 最终回答`

### `v0.0.6`

Multi-Tool Runtime：

- Tool Registry
- `calculator / datetime / text-transform`
- 前端多 Tool 展示
- 最近 `N=8` 轮上下文窗口
- 更完整的 Runtime 错误收束

### `v0.0.7`

第一层 Skill Runtime：

- Skill Definition / Skill Registry
- `utility-skill`
- `unit-convert`
- Skill 下按 `allowedTools` 过滤工具
- Skill prompt 注入主聊天链路

## 核心设计原则

这个项目始终坚持几条原则：

- 版本主题单一：每个版本只解决一个真正重要的问题
- Runtime 边界清晰：优先 registry、schema、结构化错误，而不是主流程特例
- 最小但稳定：先做最小可实现，再把边界做稳
- 普通问答主链不退化：新能力不能明显破坏开放式对话
- 为后续 Skill / MCP / Agent 留出自然演进空间

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 准备本地 Ollama

请确保本地已安装并启动 Ollama，并准备好模型，例如：

- `qwen3:8b`

默认地址：

- `http://127.0.0.1:11434`

### 3. 启动应用

```bash
pnpm dev
```

然后打开：

- [http://localhost:3000/instamind](http://localhost:3000/instamind)

### 4. 常用验证命令

```bash
pnpm typecheck
pnpm build
```

## 为什么值得关注这个项目

因为它不是试图一步做成“全能 AI 产品”，而是沿着一条更可信的路径往前走：

- 先把聊天做稳
- 再把 Tool Calling 做对
- 再把 Multi-Tool Runtime 做清楚
- 再引入 Skill
- 再往 MCP 和 Agent 演进

如果你也在思考这些问题：

- 本地大模型应用怎么做成真正可演进的工程
- Tool Calling 之后的下一层抽象应该是什么
- AI 应用如何从聊天升级成运行时系统

这个仓库会持续给出一条真实、渐进、可复盘的实现路径。

## Roadmap

- [x] `v0.0.4` 最小聊天闭环
- [x] `v0.0.5` 最小 Tool Calling
- [x] `v0.0.6` Multi-Tool Runtime
- [x] `v0.0.7` 第一层 Skill Runtime
- [ ] `v0.0.x` Skill 稳定性收口
- [ ] `v0.0.x` MCP 能力接入
- [ ] `v0.1.0` Agent Runtime 基础骨架

## License

MIT
