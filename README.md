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

## 系列博客

- 掘金专栏（持续更新各版本实现与取舍）：
  [AI Mind 系列博客](https://juejin.cn/column/7619152366395195401)

## 当前状态

当前版本：`v0.0.11`

这版的主线不是继续重构聊天主链，而是在 `v0.0.10` 已稳定的 facade / runtime / stream-core 基础上，补齐 capability model、skill metadata、local/remote MCP 能力面，并验证单个 remote MCP server 的最小闭环：

- 建立统一 `Capability Model`，覆盖 `Tool / Resource / Prompt`
- 扩展 `reader-skill` / `utility-skill` 的结构化 skill metadata
- 通过本地 MCP 暴露 `local-file-summary` Prompt
- 新增独立服务 `project-assistant-service`，验证 remote MCP Resource / Prompt / Tool
- 补齐最小 capability runtime 消费闭环
- 前端展示 Skill 命中、capability 类型、local / remote 来源和 server 信息

## 当前能力

### Chat Runtime

- `LangChain.js + Ollama`
- NDJSON 流式协议
- `reasoning / tool / resource / text` 多段式消息流
- `skill / prompt` 执行事实展示
- 统一 `error` chunk 语义
- `authoritative answer` 运行时策略
- 最近 `N=8` 轮上下文
- 最小 capability runtime 消费闭环

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
- remote `Streamable HTTP` MCP Host
- `weather-server`
- `project-files-server`
- `project-assistant-service`
- MCP Tool / MCP Resource adapter
- MCP Prompt adapter

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
- `apps/project-assistant-service/`
    - NestJS remote MCP 服务，当前用于验证单 server 最小闭环
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

## v0.0.11 的关键判断

这版有三个重要原则：

1. capability model 是统一描述层，不是统一执行链
2. Skill metadata 只描述承接范围和输出风格，不扩张成 Agent
3. Remote MCP 只验证单 server 最小闭环，不做 workflow、多 server 或真实业务数据

因此：

- `Tool / Resource / Prompt` 保持各自执行语义
- `reader-skill` 只承接本版固定的 local / remote MCP capability
- `project-assistant-service` 当前只提供 mock Resource / Prompt / Tool
- 普通问答主链不因 MCP 扩展退化

## 开发

安装依赖：

```bash
pnpm install
```

启动开发环境：

```bash
pnpm dev
```

如果需要同时验证 remote MCP 服务：

```bash
pnpm dev:pas
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

### Project Assistant Service

```bash
pnpm dev:pas
pnpm typecheck:pas
pnpm build:pas
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
