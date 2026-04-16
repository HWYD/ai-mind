# AI Mind

一个按版本持续演进的 AI Native Runtime Skeleton。

它不是一次性做完的产品，而是一套逐步生长的运行时骨架：

- 本地聊天闭环
- 结构化流式协议
- Tool Calling
- Multi-Tool Runtime
- Skill Runtime
- MCP 能力接入
- Agent / 数据层等更长线能力

## 当前状态

当前版本：`v0.0.10`

这版的主线不是新增一个单点功能，而是把聊天主链和稳定流式内核的结构正式收口：

- `chat-service` 收口为薄 facade（稳定外部入口）
- `apps/webapp/lib/ai/runtime/` 成为正式聊天运行时编排层
- `error` 协议与流终态语义统一
- 新建内部复用包 `@ai-mind/stream-core`
- 测试目录与版本文档资产统一

## 当前能力

### Chat Runtime

- `LangChain.js + Ollama`
- NDJSON 流式协议
- `reasoning / tool / resource / text` 多段式消息流
- 统一 `error` chunk 语义
- `authoritative answer` 运行时策略
- 最近 `N=8` 轮上下文

### Skills

- `utility-skill`
- `reader-skill`

### Tools

- `calculator`
- `datetime`
- `text-transform`
- `unit-convert`
- `city-weather`
- `local-text-read`

### MCP Host MVP

- `@modelcontextprotocol/sdk`
- 本地 `stdio` MCP Host
- `weather-server`
- `project-files-server`
- MCP Tool / MCP Resource adapter

### 工程化边界

- `route -> chat-service facade -> runtime -> skills / tools / mcp`
- `@ai-mind/stream-core` / `packages/stream-core` 负责稳定流式内核
- `apps/webapp/tests/**` 为唯一 webapp 自动化测试目录
- `packages/stream-core/tests/**` 为 package 测试目录

## 当前结构

### Webapp

- `apps/webapp/app/api/chat/route.ts`
    - HTTP 边界与错误映射
- `apps/webapp/lib/ai/chat-service.ts`
    - 薄 facade，负责创建内部流、构造中间 `StreamResult` 并包装 `Response`
- `apps/webapp/lib/ai/runtime/`
    - 正式聊天运行时编排层
- `apps/webapp/tests/`
    - Webapp 自动化测试

### Stream Core Package

- `packages/stream-core/src/protocol/`
    - `ChatStreamChunk` 与错误协议类型
- `packages/stream-core/src/core/`
    - lifecycle、error helper、static part writer
- `packages/stream-core/src/adapters/web/`
    - NDJSON writer
- `packages/stream-core/tests/`
    - package 单测

## v0.0.10 的关键判断

这版有两个重要原则：

1. 先在应用内收口 runtime，再抽稳定内核
2. 不为“拆得更细”而继续过度拆分

因此：

- `ChatOrchestrator`、`chat-session`、`tool-runtime` 仍然留在 `apps/webapp`
- `ChatStreamChunk`、`StreamLifecycle`、NDJSON writer 等稳定基础能力下沉到 `@ai-mind/stream-core`

## 开发

安装依赖：

```bash
pnpm install
```

启动开发环境：

```bash
pnpm dev
```

上面的命令会同时：

- 启动 `packages/*` 的 `build:watch`
- 启动 `apps/webapp`

如果只想单独启动 webapp，可以使用：

```bash
pnpm dev:webapp
```

如果只想单独开启 workspace 包 watch，可以使用：

```bash
pnpm build:watch
```

## 常用验证

### Webapp

```bash
pnpm --dir apps/webapp test
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp build
```

### Stream Core

```bash
pnpm --dir packages/stream-core test
pnpm --dir packages/stream-core typecheck
pnpm --dir packages/stream-core build
```

### Lint

```bash
pnpm lint
pnpm lint:webapp:fix
pnpm lint:packages:fix
```

## 版本演进

- `v0.0.4`：本地聊天 + Streamdown
- `v0.0.5`：最小 Tool Calling
- `v0.0.6`：Multi-Tool Runtime
- `v0.0.7`：第一层 Skill Runtime（`utility-skill`）
- `v0.0.8`：`reader-skill`
- `v0.0.9`：MCP Host MVP 接入现有 Skill Runtime
- `v0.0.10`：Chat Runtime 收口 + Stream Core package 化

## Roadmap

- [x] 本地聊天闭环
- [x] Tool Calling
- [x] Multi-Tool Runtime
- [x] 第一层 Skill Runtime
- [x] `reader-skill`
- [x] MCP Host MVP
- [x] Chat Runtime 收口
- [x] Stream Core package 化
- [ ] 更多 MCP 能力接入
- [ ] Agent Runtime 骨架
- [ ] 持久化与数据层

## License

MIT
