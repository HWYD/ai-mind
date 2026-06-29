# Capability 与 Skill Surface

## Summary

AI Mind 使用 Capability Surface 描述 Skill 可以消费哪些能力。

在接入 MCP 之后，runtime 需要稳定描述来自不同来源的能力：internal tools、local MCP servers 和 remote MCP servers。Capability model 提供的就是这一层描述。

Capability Surface 不意味着所有能力都以同一种方式执行。Tool、Resource、Prompt 仍然保留各自不同的执行语义。

## Capability Model

一个 capability 描述一个可用能力。

当前 capability 类型：

- `tool`
- `resource`
- `prompt`

当前 provider kind：

- `internal`
- `mcp`

当前 location：

- `local`
- `remote`

重要字段：

- `capabilityId`
- `name`
- `capabilityType`
- `providerKind`
- `location`
- `serverId`
- `title`
- `description`
- `availability`

`capabilityId` 会包含来源和位置等信息，避免来自不同 provider 的同名能力互相冲突。

## Tool Capability

Tool capability 表示可执行动作。`v0.0.12` 之后，Skill 不再通过 `allowedTools` 直接声明可用工具，而是通过 `capabilitySelectors` 解析本轮 active tools。

示例：

- internal tools，例如 calculator、datetime、text transform、unit conversion。
- local MCP tool：`city-weather`。
- remote MCP tool：`check_doc_consistency`。
- Agent scope tool：`validate_tasklist_structure`。

Tool 执行仍然走 Tool Runtime 路径。Capability model 负责描述和选择边界，Tool Runtime 负责绑定、校验和执行。

## Resource Capability

Resource capability 表示可读取上下文。

示例：

- 通过 `demo://...` 读取受控 demo 文档。
- remote mock context：`project://latest-context`。

Resource 执行是读取操作。它的结果可以显示为 Resource part，也可以注入最终回答上下文。Resource 不进入模型 tool binding。

## Prompt Capability

Prompt capability 表示可复用的 prompt message 或 prompt template。

示例：

- local prompt：`local-file-summary`。
- remote prompt：`tasklist-draft`。

Prompt 执行不是 Tool call。Runtime 获取 prompt messages，注入允许参数，再把这些 messages 作为后续模型上下文。Prompt 不进入模型 tool binding。

## Skill Metadata

Skill metadata 描述一个 Skill 是什么，以及它可以消费哪些能力。

当前重要字段：

- `skillId`
- `name`
- `description`
- `triggerExamples`
- `sourceKinds`
- `capabilitySelectors`
- `fallbackPolicy`

`skillId` 是机器标识，`name` 是展示名称。

`capabilitySelectors` 声明 Skill 可以消费的 capability 范围。它不是 planner、workflow engine 或 Agent。

## Reader Skill

`reader-skill` 是当前主要消费 MCP-backed 能力的 Skill。

它覆盖：

- 通过 local MCP Tool 查询天气。
- 通过 local MCP Resource 读取 `examples/agent-demo/**/*.md` 白名单文档。
- 通过 local MCP Prompt 总结本地文件。
- 通过 remote MCP Resource 获取项目上下文。
- 通过 remote MCP Prompt 生成 tasklist 草稿。
- 通过 remote MCP Tool 检查文档一致性。

它的职责是为阅读和文档类场景补充外部上下文，而不是执行开放式任务规划。

## Utility Skill

`utility-skill` 聚焦确定性实用任务。

它消费 internal local tools，例如：

- Calculator。
- Date and time。
- Text transformation。
- Unit conversion。

当前设计中，它刻意不进入 MCP 迁移路径。

## Tool Binding Boundary

`v0.0.12` 之后，Tool 绑定遵循下面的链路：

```text
skill.capabilitySelectors
  -> capability catalog
  -> active tool definitions
  -> model.bindTools(activeTools)
  -> tool call validation / execution
```

模型绑定、tool call 校验和执行共用同一份 active tool map。这样可以避免 selector 命中了一个 capability，但执行时又按短名取到另一个来源的同名工具。

Resource / Prompt 不会被放进 `bindTools()`。如果需要消费 Resource / Prompt，由 runtime 按它们自己的语义读取或注入上下文。

## Local MCP Boundary

Local MCP 当前提供受控的本地能力：

- 来自 `weather-server` 的天气 Tool。
- 来自 `project-docs-server` 的 demo Resource 和 local Prompt。

本地文件访问仍然受严格边界保护。当前 public demo 只允许 `demo://...` 读取 `examples/agent-demo/` 下的白名单资源，MCP 不意味着可以任意访问文件系统。

## Remote MCP Boundary

Remote MCP 当前只通过 `project-assistant-service` 验证一个最小 remote capability 闭环。

它提供 mock Resource、Prompt 和 Tool capability。它不是完整远程业务平台、多 server discovery 系统，也不是 remote workflow 层。

## Runtime Consumption

Capability metadata 不能只用于 UI 展示，也需要能被 runtime 消费。

当前 runtime 可以解析固定的 `reader-skill` Resource / Prompt 场景，写出流式执行事实，并将结果注入最终回答上下文。

Tool 场景回到标准 Tool Runtime，由模型真实产出 tool call 后再执行。这是一条很窄的桥，不是通用 planner。

## Agent Boundary

`v0.1.0` 后，AI Mind 开始引入受控单 Agent。

Agent 可以消费 Resource、Tool 和 Runtime 中的中间状态，但它不等于 Skill，也不等于 Capability Model 本身。

当前原则：

- Skill 描述稳定任务表面。
- Capability Model 描述可用能力。
- Tool Runtime 执行具体工具。
- Agent Runtime 编排一个受控多步任务。

`Version Plan to Tasklist Agent` 只在 `/tasklist + @demo://version-plans/*.md` 下启动。它会读取用户显式引用的 demo 版本方案，生成 tasklist 草稿，调用 `validate_tasklist_structure` 做结构校验，并在必要时最多修正一次。

`v0.1.1` 后，这个 Agent 增加一次 `Controlled Planner Lite` 决策。模型可以在 Runtime 白名单 action 中选择下一步，例如继续生成、读取一个白名单 optional context、提出澄清问题或边界停止。

这个 Agent 不会自动扫描资源、不会写入文件，也不会把所有 capability 暴露给模型自由选择。

optional context 也不是开放式 Resource selection。它只能读取固定白名单资源，且最多读取一次。

## Design Principle

Capability Model 统一能力描述。

它不会抹平 Tool、Resource、Prompt 的执行差异。这样可以让 Skill 消费能力更稳定，同时避免过早进入 Agent 或 workflow 架构。
