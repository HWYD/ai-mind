# Runtime 边界

## Summary

AI Mind 将聊天主链长期拆成下面几个清晰层次：

`route -> chat-service facade -> runtime -> skills / tools / mcp`

这个边界的目的，是避免 API route 或 service 入口重新变成混合控制器，同时承担 HTTP、streaming、prompt 构建、tool execution、Skill routing 和 MCP 协议细节。

## Route Layer

Route 层只负责 HTTP 相关职责：

- 请求解析。
- 请求校验。
- HTTP 状态码映射。
- request 级 JSON 错误响应。
- 调用 chat service 入口。

判断原则很简单：如果一段逻辑离开 HTTP 之后仍然成立，它就不应该留在 route 层。

## Chat Service Facade

`chat-service` 是薄 facade。

它负责：

- 提供稳定外部服务入口。
- 创建 stream。
- 构造内部 `StreamResult`。
- 兜底处理顶层 runtime 异常。
- 将 stream 包装成 `Response`。

它不负责：

- prompt 和 session 构建。
- runtime 阶段编排。
- Tool 或 Resource 执行细节。
- Skill routing 规则。
- MCP 协议细节。

长期规则是：新的聊天行为通常应该扩展 runtime，而不是让 `chat-service` 再次变胖。

## Runtime Layer

Runtime 层负责“一个聊天请求到底怎么运行”。

当前职责包括：

- session 和 prompt 构建。
- planning、fallback、tool execution、final answer 阶段编排。
- assistant 输出流消费。
- Tool、Resource、Prompt 执行映射。
- authoritative answer 策略。
- runtime 错误收口。
- 固定 Skill 场景下的 Resource / Prompt context 消费。
- Composer payload hint 消费。
- 受控 Agent path 的入口识别、状态推进和失败收束。

代表性模块：

- `chat-session`：构建模型输入、active tools 和 Skill prompt 快照。
- `chat-orchestrator`：编排聊天主链阶段与终态流行为。
- `assistant-stream`：消费模型输出并写出 text 或 reasoning chunk。
- `tool-runtime`：校验并执行 Tool / Resource 调用，映射展示字段。
- `authoritative-answer`：判断确定性工具结果是否可以绕过模型改写。
- `capability-context`：为 `reader-skill` 消费固定 Resource / Prompt context。
- `composer-context`：消费 Composer command 与 resource reference，生成本轮受控上下文。
- `version-plan-tasklist-agent`：承接 `/tasklist + @demo://version-plans/*.md` 的受控单 Agent 路径。

## Chat Thread Memory

`v0.4.2` 为普通 text chat 引入了单会话 chat memory baseline；`v0.4.3` 继续把它扩展到安全 final turn。但它仍然属于 runtime support boundary，不是新的业务数据层或 Agent runtime。

它负责：

- 基于当前浏览器 session 派生 chat thread id。
- 以 LangGraph checkpointer 保存普通 chat 的 bounded ThreadState。
- 在刷新时通过 `GET /api/chat/thread` 返回安全 hydration DTO。
- 在 eligible turn 完成后只追加“用户输入文本 + 最终用户可见文本”，来源可以是 ordinary chat、tool/resource final answer、Tasklist final answer summary 或 Delivery final report。
- 在超阈值时做 summary compaction。
- 在下一轮普通 text chat 中以后端 ThreadState 为历史事实源，注入 summary、pinned decisions 和 recent messages，并只从前端请求取本轮最新 user input。

它不负责：

- 保存完整 ChatSession / ChatMessage 业务历史。
- 保存 tool transcript、MCP raw transcript、Tasklist artifact markdown、Tasklist GraphState、HITL checkpoint、Delivery RuntimeArtifact、workflow progress、subagent raw result 或 raw provider/runtime internals。
- 改变 Tasklist Agent checkpoint / resume 语义。
- 改变 Delivery Chain 的 run-local artifact 边界。
- 扩展 stream-core chunk union。

长期规则是：chat memory checkpoint 只是普通聊天 runtime 的 bounded memory state，不是产品历史表，也不是 Agent checkpoint 的复用层。

## Long-term UserMemory Semantic Retrieval

`v0.4.5` 的 `UserMemory Store` 与 conversation-scoped `ThreadState` 分离；`v0.4.6` 只在该 Store 边界内增加 semantic retrieval。它是 runtime-controlled supplemental context，不是聊天历史搜索、RAG、主 assistant tool 或新的业务数据层。

它负责：

- 只从当前 browser session namespace 的 active UserMemory 中检索。
- 只对 `text` 与 `tags` 建立 semantic index，并使用 `PostgresStore` vector search 作为唯一正式 candidate source。
- 使用独立的 embedding 配置，固定模型为 `doubao-embedding-vision`；不跟随聊天模型选择器。
- 在 ordinary text chat、tool-assisted ordinary chat，及仍位于 ordinary chat boundary 的 capability-context final answer 中，以最多 3 条、总计最多 900 字符的补充上下文注入。
- 在 Store、embedding、timeout、score 异常或边界无法确认时，安全返回 0 条注入，不阻断 ordinary chat。

它不负责：

- 索引或检索完整 conversation transcript、ThreadState、原始 user/assistant text、Tool/MCP 原始结果、GraphState、RuntimeArtifact、workflow progress、prompt、provider response 或配置密钥。
- 修改 hydration DTO、Conversation Registry、stream-core chunk、frontend reducer public shape 或 selected conversation 的 ThreadState 事实源。
- 为 Tasklist、Delivery、HITL、原始 Tool/MCP fetch/input path 提供 retrieval；这些路径必须在 embedding query 和 Store search 前被排除。
- 提供 `semantic-memory-search` 或 memory-write assistant tool，或扩展为独立 vector database / RAG 平台。

正式过滤顺序固定为：runtime eligibility → query 轻量规范化与长度裁剪 → browser-session namespace → vector search → active/confidence/suppression 与 score 过滤 → `stableKey` 去重 → conflict handling → context budget。latest user input 始终高于 selected UserMemory，后者不覆盖 ThreadState 的 summary、pinned decisions 或 recent messages。

## Controlled Agent Runtime

`v0.1.0` 后，Runtime 可以承接受控单 Agent。

当前 Agent 不是自由 Planner，也不是完整多 Agent 系统。它只在明确入口下启动，并由 Runtime 控制执行顺序、状态转移、资源边界、工具作用域和停止条件。

`v0.1.1` 后，受控 Agent 可以做一次白名单 Planning Decision，但这仍然属于 Runtime-controlled path，不等于开放式 Planner。

当前代表路径：

```text
/tasklist + @demo://version-plans/*.md
  -> read version plan
  -> evaluate readiness
  -> planning decision
  -> decide tasklist strategy
  -> draft tasklist
  -> validate structure
  -> optional revise once
  -> evaluate revision effect
  -> final answer
  -> text artifact delivery
```

Agent 不应该绕过 runtime 直接读取资源、自由绑定工具或写入项目文件。它可以复用 Tool Runtime、Resource adapter 和 stream-core，但必须由 Runtime 控制边界。

## Skills

Skills 描述任务表面。

它们负责：

- 声明任务模式。
- 提供 system prompt 和 output policy。
- 声明 capability selector 边界。
- 声明 fallback policy。

它们不直接执行工具、不管理 MCP client，也不编排多阶段 runtime。

Skill 是能力组织层，不应该偷偷长成 Agent。

`v0.0.12` 之后，Skill 不再通过 `allowedTools` 直接控制模型可用工具。本轮 Tool 绑定由 `capabilitySelectors -> capability catalog -> Tool Runtime` 解析。

## Tools

Tools 是原子能力。

它们负责：

- 输入 schema。
- 执行函数。
- 输出结构。
- 最小展示元信息。

它们不负责 runtime orchestration、HTTP 行为、Skill routing 或流式协议细节。

## MCP

MCP 在项目中被视为能力来源层。

它负责：

- server definitions。
- client 与 transport 生命周期。
- local / remote MCP 连接细节。
- 将 MCP 响应通过 adapter 映射为 runtime 可消费结果。

MCP 不应该替代 chat runtime，原始 MCP 协议细节也不应该泄漏到 `chat-service`、Skills 或前端组件。

## Stream Core

`@ai-mind/stream-core` 是 facade 与 runtime 共同消费的稳定流式内核。

它负责协议类型、stream lifecycle、error helpers 和 writer 工具。它不负责聊天编排或业务能力决策。

## Long-Term Rule

长期结构原则是：

> facade 保持薄，runtime 承担聊天运行时编排，stream-core 承担稳定流式内核，skills / tools / mcp 各守其层。
