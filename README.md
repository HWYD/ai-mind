# AI Mind

> 一个面向未来智能体形态持续演进的 AI Native 实验项目。  
> 它从最小可用的本地大模型聊天开始，逐步向多 Tool、Skill、MCP、Agent Runtime 演进。

## 项目定位

`AI Mind` 不是一次性做完的大而全产品，而是一条清晰的版本化演进路线：

- 从本地大模型对话出发
- 逐步接入结构化流式协议
- 再引入 Tool Calling
- 然后扩展到多 Tool、Skill、MCP 与更完整的智能体能力

这个仓库更像一个持续生长的 AI 应用骨架，而不是单点功能 Demo。

## 当前状态

当前版本：`v0.0.5`

已完成的核心能力：

- `LangChain.js + Ollama` 本地模型接入
- 自定义流式聊天链路与 `useChatStream`
- `Markdown + typed parts + Streamdown` 内容渲染
- `Zod` 驱动的请求、协议、Tool 参数校验
- 首个 Tool：`calculator`
- `reasoning / tool / text` 三段式前后端消息协议
- 本地会话内多轮上下文

这意味着项目已经从“纯文本对话”升级成“具备最小 Tool Calling 闭环”的 AI 应用骨架。

## 核心理念

这个项目坚持几个原则：

- 最小可实现：每个版本只解决一个真正重要的问题
- 可扩展：当前实现必须能自然长到下一版本
- 可解释：协议、运行时、前端展示尽量清晰分层
- 面向真实工程：校验、流式、异常兜底和状态污染问题优先于炫技

## 架构概览

当前主链路可以概括为：

```text
User
  -> Web Chat UI
    -> /api/chat
      -> LangChain ChatOllama
        -> Tool Calling Runtime
          -> Local Tools
            -> Structured Stream Response
              -> typed parts rendering
```

分层来看：

- 模型接入层：`LangChain.js + Ollama`
- 运行时层：Tool Calling、参数校验、工具执行、结果回填
- 协议层：NDJSON + `reasoning / tool / text`
- 前端展示层：`useChatStream + Streamdown + Tailwind CSS`

## 版本演进

### `v0.0.4`

完成最小聊天系统闭环：

- 本地模型对话
- 自定义流式输出
- Markdown 渲染
- 本地多轮上下文

### `v0.0.5`

完成最小 Tool Calling 实践：

- 接入 `calculator`
- 建立 `tool_calls -> Zod 校验 -> ToolMessage 回填 -> 最终回答` 的闭环
- 前端支持 `reasoning / tool / text` 三类结构化展示

## 接下来会往哪里走

后续演进会重点围绕这几个方向展开：

### Multi-Tool

从单 Tool 验证版升级到多 Tool Runtime，包括：

- 工具注册与发现
- 工具选择策略
- 更稳的结果合成与错误隔离

### Skill

在 Tool 之上引入更高层的能力封装：

- 把一组提示词、约束、工具协作模式抽象为 Skill
- 让模型从“调用单个工具”升级为“调用一类稳定能力”

### MCP

把外部系统能力接入为标准上下文与执行通道：

- 文件系统
- 搜索
- 开发工具
- 知识源

这会让项目从本地实验进一步走向更开放的能力网络。

### Agent Runtime

当 Tool、Skill、MCP 都逐步稳定之后，项目会继续向更完整的智能体运行时演进，例如：

- 多步决策
- 长短期记忆协作
- 任务拆解与回放
- 可观测性与运行记录

## 仓库结构

```text
apps/
  webapp/            # 当前主应用，Next.js + React

blogs/               # 对外博客与阶段总结
private-folder/
  plans/             # 各版本方案与设计文档
  blogs/             # 草稿与内部博客文档
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动本地 Ollama

请确保本地已经安装并启动 Ollama，并准备好模型，例如：

- `qwen3:8b`

默认地址：

- `http://127.0.0.1:11434`

### 3. 启动前端应用

```bash
pnpm dev
```

然后打开：

- [http://localhost:3000/instamind](http://localhost:3000/instamind)

## 为什么值得关注这个项目

因为它并不试图一步到位做一个“全能 AI 产品”，而是沿着一条更可信的路径前进：

- 先把聊天做稳
- 再把 Tool Calling 做对
- 再把多 Tool、Skill、MCP 和 Agent Runtime 一层层搭上去

如果你也在思考：

- 本地大模型应用怎么做成真正可演进的工程
- Tool Calling 之后的下一层抽象应该是什么
- AI 应用如何从对话升级为可执行系统

这个仓库会持续给出一条真实、渐进、可复盘的实现路径。

## Roadmap

- [x] `v0.0.4` 最小聊天闭环
- [x] `v0.0.5` 最小 Tool Calling 闭环
- [ ] `v0.0.6` 多 Tool 初步扩展
- [ ] `v0.0.x` Skill / MCP 能力接入
- [ ] `v0.1.0` 面向智能体运行时的基础骨架

## License

MIT
