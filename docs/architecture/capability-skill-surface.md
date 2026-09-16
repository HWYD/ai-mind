# Capability 与 Skill Surface

## Summary

AI Mind 使用 Capability Surface 描述 Tool、Resource 与 Prompt 能力的来源、类型和可用性；Skill 不拥有这些能力的执行或授权权。

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

Tool capability 表示可执行动作。v0.6.0 的 General ReAct 由独立 `GeneralToolPolicy` 从显式登记的 Tool Definition 解析本轮 active tools；Skill 选择不参与绑定。

示例：

- internal tools，例如 calculator、datetime、text transform、unit conversion。
- local MCP tool：`city-weather`。
- remote MCP tool：`check_doc_consistency`。
- Agent scope tool：`validate_tasklist_structure`。

Tool 执行仍然走 Tool Runtime 路径。Capability model 负责描述来源，Tool Policy/Registry 负责选择与权限边界，Tool Runtime 负责绑定、校验和执行。

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

Skill metadata 描述一个 Skill 的提示词任务表面和输出风格。

当前重要字段：

- `skillId`
- `name`
- `description`
- `triggerExamples`
- `fallbackPolicy`

`skillId` 是机器标识，`name` 是展示名称。

Skill 没有 `capabilitySelectors`、Tool allowlist 或 MCP 权限字段。它不是 planner、workflow engine、Tool Policy 或 Agent。

## Reader Skill

`reader-skill` 是当前资料解读/外部上下文回答的提示词 Skill。

它优先基于已由显式 Composer/`@resource` preparation 注入的上下文作答，并且不因 Reader 命中自动读取 remote MCP Resource、Prompt 或 Tool。用户明确要求验证当前公开信息或读取已授权 URL 时，仍由固定 GeneralToolPolicy 决定是否使用 Web Tool；这不是 Reader 授权，也不会扩大 Tool 集。

## Utility Skill

`utility-skill` 聚焦确定性实用任务。

它通过提示词引导模型正确使用固定基础 Tool，例如 Calculator、Date and time、Text transformation 和 Unit conversion；该 Skill 本身不授予这些 Tool。

## Tool Binding Boundary

v0.6.0 General ReAct 的 Tool 绑定遵循下面的链路：

```text
GeneralToolPolicy fixed candidates
  -> Tool Registry availability / scope / execution policy
  -> active tool definitions
  -> model.bindTools(activeTools)
  -> tool call validation / execution
```

模型绑定、tool call 校验和执行共用同一份 active tool map。Skill 命中不会让 Tool 权限或模型 schema 变化；remote MCP `tools/list` 不属于该路径。

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

当前 runtime 只对 Composer 显式 command 与 `@resource` 引用准备 Resource / Prompt 上下文，写出流式执行事实，再将结果注入最终回答上下文。

Tool 场景回到标准 Tool Runtime，由模型真实产出 tool call 后再执行。这是一条很窄的桥，不是通用 planner。

## Agent Boundary

`v0.1.0` 后，AI Mind 开始引入受控单 Agent。

Agent 可以消费 Resource、Tool 和 Runtime 中的中间状态，但它不等于 Skill，也不等于 Capability Model 本身。

当前原则：

- Skill 描述稳定提示词任务表面。
- Capability Model 描述能力来源。
- Tool Policy/Registry 决定模型可见 Tool。
- Tool Runtime 执行具体工具。
- Agent Runtime 编排一个受控多步任务。

`Version Plan to Tasklist Agent` 只在 `/tasklist + @demo://version-plans/*.md` 下启动。它会读取用户显式引用的 demo 版本方案，生成 tasklist 草稿，调用 `validate_tasklist_structure` 做结构校验，并在必要时最多修正一次。

`v0.1.1` 后，这个 Agent 增加一次 `Controlled Planner Lite` 决策。模型可以在 Runtime 白名单 action 中选择下一步，例如继续生成、读取一个白名单 optional context、提出澄清问题或边界停止。

这个 Agent 不会自动扫描资源、不会写入文件，也不会把所有 capability 暴露给模型自由选择。

optional context 也不是开放式 Resource selection。它只能读取固定白名单资源，且最多读取一次。

## Design Principle

Capability Model 统一能力描述，不能把 Tool 权限回流给 Skill。

它不会抹平 Tool、Resource、Prompt 的执行差异。这样可以让 Skill 消费能力更稳定，同时避免过早进入 Agent 或 workflow 架构。

# v0.6.0 General Tool Policy

普通聊天的 effective tools 固定为 `calculator`、`datetime`、`text-transform`、`unit-convert`、`read-url`、`web-search` 与 `city-weather`。`GeneralToolPolicy` 在本轮开始时按 Tool Registry 的 availability、`general-react-agent` scope 与 `standard-tool` policy 冻结 allowlist；`agent-tool`、未登记 remote MCP Tool 与任何写入能力都 fail-closed。

Skill 只提供系统提示词和输出风格，不再叠加 Tool、Resource 或 Prompt selector。Composer 显式命令和 `@resource` 仍可先形成安全 observation/message 再进入同一个 General ReAct loop；自然语言或 Skill 命中不会自动读取 remote MCP Resource/Prompt，也不会 discovery remote MCP Tool。

Skill/MCP 的模型可见 schema 不包含 timeout、retry、provider config 或凭据。Dynamic MCP object schema 递归使用 strict 校验，public Tool input/output 不回退 raw payload；General ReAct 调用传播 run-scoped `AbortSignal` 并关闭 MCP client session recovery。所有执行继续经过 server-side Tool Definition、scope、schema、outbound secret guard 和 run-local budget，retry 只由 Tool Runtime 拥有。
