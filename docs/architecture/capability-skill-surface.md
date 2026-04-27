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

Tool capability 表示可执行动作。

示例：

- internal tools，例如 calculator、datetime、text transform、unit conversion。
- local MCP tool：`city-weather`。
- remote MCP tool：`check_doc_consistency`。

Tool 执行仍然走 Tool Runtime 路径。Capability model 只负责描述它。

## Resource Capability

Resource capability 表示可读取上下文。

示例：

- 通过 `local-text-read` 读取本地项目文件。
- remote mock context：`project://latest-context`。

Resource 执行是读取操作。它的结果可以显示为 Resource part，也可以注入最终回答上下文。

## Prompt Capability

Prompt capability 表示可复用的 prompt message 或 prompt template。

示例：

- local prompt：`local-file-summary`。
- remote prompt：`tasklist-draft`。

Prompt 执行不是 Tool call。Runtime 获取 prompt messages，注入允许参数，再把这些 messages 作为后续模型上下文。

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
- 通过 local MCP Resource 读取本地项目文件。
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

## Local MCP Boundary

Local MCP 当前提供受控的本地能力：

- 来自 `weather-server` 的天气 Tool。
- 来自 `project-files-server` 的项目文件 Resource 和 local Prompt。

本地文件访问仍然受严格边界保护。MCP 不意味着可以任意访问文件系统。

## Remote MCP Boundary

Remote MCP 当前只通过 `project-assistant-service` 验证一个最小 remote capability 闭环。

它提供 mock Resource、Prompt 和 Tool capability。它不是完整远程业务平台、多 server discovery 系统，也不是 remote workflow 层。

## Runtime Consumption

Capability metadata 不能只用于 UI 展示，也需要能被 runtime 消费。

当前 runtime 可以解析固定的 `reader-skill` capability 场景，执行这些 capability，写出流式执行事实，并将结果注入最终回答上下文。

这是一条很窄的桥，不是通用 planner。

## Design Principle

Capability Model 统一能力描述。

它不会抹平 Tool、Resource、Prompt 的执行差异。这样可以让 Skill 消费能力更稳定，同时避免过早进入 Agent 或 workflow 架构。
