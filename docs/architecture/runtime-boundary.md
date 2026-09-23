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
- Composer 显式 command 与 `@resource` 的 Resource / Prompt context 消费。
- Composer payload hint 消费。
- 受控 Agent path 的入口识别、状态推进和失败收束。

代表性模块：

- `chat-session`：构建模型输入、active tools 和 Skill prompt 快照。
- `chat-orchestrator`：编排聊天主链阶段与终态流行为。
- `assistant-stream`：消费模型输出并写出 text 或 reasoning chunk。
- `tool-runtime`：校验并执行 Tool / Resource 调用，映射展示字段。
- `authoritative-answer`：判断确定性工具结果是否可以绕过模型改写。
- `composer-context`：消费 Composer command 与 resource reference，生成本轮受控上下文。
- `version-plan-tasklist-agent`：承接 `/tasklist + @demo://version-plans/*.md` 的受控单 Agent 路径。

v0.6.1 的普通聊天路径在上述 runtime boundary 内使用 `general-react-agent` 子模块。`ChatOrchestrator` 只负责准备 context、创建 run-owned context 并调用 runner；不会在自身维护第二套 while-loop。runner 的 `createAgent(version='v2')` 是唯一普通 Tool loop：自然完成且无 Tool 的公开正文在同一模型轮次直接成为 `final_answer`，含 Tool 的公开行动说明在 dispatch 前收口为 `commentary`，不再固定执行未绑定 Tool 的 Answer stream。loop/hard deadline、execution gate、Tool Runtime policy 和 durable projection scope 都只服务当前请求，不进入 route 或前端。

`chat-session` 为 General ReAct 创建 server-owned 的模型上下文与安全资料投影。网页、Tool observation、Resource/Prompt 中的文本均为资料而非指令，不能改写回答策略、Tool 权限、授权 URL、预算或数据访问范围；raw reasoning、原始 Tool 数据和 provider 原始事件不进入 public stream、Memory 或快照。当前 user 明确提供且通过 public-web/secret policy 的 URL 自动成为 `read-url` 候选；同一已验证 conversation 最多补充八个 server Chat Memory 原始 user URL，并在本 Run 再次 canonicalize。summary、assistant、pinned、UserMemory、Tool output、客户端历史和被 compacted 的 raw turn 都不能授权，也不构成“此前已读取”的执行证据。

## Chat Thread Memory

`v0.4.2` 为普通 text chat 引入了单会话 chat memory baseline；`v0.4.3` 继续把它扩展到安全 final turn。但它仍然属于 runtime support boundary，不是新的业务数据层或 Agent runtime。

它负责：

- 基于当前浏览器 session 派生 chat thread id。
- 以 LangGraph checkpointer 保存普通 chat 的 bounded ThreadState。
- 在刷新时通过 `GET /api/chat/thread` 返回安全 hydration DTO。
- 在 eligible turn 完成后只追加“用户输入文本 + 最终用户可见文本”，来源可以是 ordinary chat、tool/resource final answer、Tasklist final answer summary 或 Delivery final report。对 General ReAct，这只能是 normal `final_answer`；pending、commentary、interrupted、constrained final 和失败/取消终态都不是长期 Memory eligible turn。
- 在超阈值时做 summary compaction。
- 在下一轮普通 text chat 中以后端 ThreadState 为历史事实源，注入 summary、pinned decisions 和 recent messages，并只从前端请求取本轮最新 user input。

它不负责：

- 保存完整 ChatSession / ChatMessage 业务历史。
- 保存 tool transcript、MCP raw transcript、Tasklist artifact markdown、Tasklist GraphState、HITL checkpoint、Delivery RuntimeArtifact、workflow progress、subagent raw result 或 raw provider/runtime internals。
- 改变 Tasklist Agent checkpoint / resume 语义。
- 改变 Delivery Chain 的 run-local artifact 边界。
- 扩展 stream-core chunk union。

长期规则是：chat memory checkpoint 只是普通聊天 runtime 的 bounded memory state，不是产品历史表，也不是 Agent checkpoint 的复用层。

### Token-aware context budget and compaction

v0.5.4 已把上面的“超阈值”从固定 recent turn/message count 改为模型感知的 token budget。模型物理窗口、产品运行上限与单请求完整输入预算由 Runtime 分开处理。

当前边界如下：

- Model Catalog 保存 server-only 物理 context window；普通云端聊天使用不超过 128K 的运行窗口，Ollama 使用不超过 32K 的运行窗口并显式配置 `numCtx`。
- 统一 budget policy 预留 4096 输出 tokens 与 `max(8192, 10% effective window)` runtime headroom，再从 hard input budget 派生 70% compaction trigger 和 35% post-compaction target。
- Chat Orchestrator 在 General ReAct 模型调用与 Composer Context 注入前执行完整输入 preflight；Skill 不会引入额外的 Capability Context 调用。
- Chat Memory 按估算 token 触发持久化 compaction；候选只保留完整 user/assistant turns，并且只有在合法、位于目标内且严格缩小时才保存。
- 持久化 compaction 失败不覆盖原 summary、pinned decisions 或 `lastCompactedAt`；当前请求使用不持久化的 ephemeral fit 继续。Candidate save 与回答完成后的 raw final-turn append 是两个独立写入阶段，第二次写入也失败时保留 last durable checkpoint 且不撤销回答。
- 只有排除 chat memory 后，system/tool/capability/UserMemory/latest input 自身仍超出 hard input budget 时，才返回现有输入过长错误。
- ThreadState 字段、hydration DTO、公开 API、`thread-memory-status`、frontend reducer、数据库 schema，以及 ADR-0013 的安全 final-turn 边界保持不变。

精确公式与 fallback 契约以 [ADR-0018](../adr/0018-token-aware-chat-context-budget-and-compaction.md) 为准；实现验收记录见 [v0.5.4 spec](../../specs/v0.5.4-token-aware-memory-compaction/spec.md)。

## Long-term UserMemory Semantic Retrieval

`v0.4.5` 的 `UserMemory Store` 与 conversation-scoped `ThreadState` 分离；`v0.4.6` 只在该 Store 边界内增加 semantic retrieval。它是 runtime-controlled supplemental context，不是聊天历史搜索、RAG、主 assistant tool 或新的业务数据层。

它负责：

- 只从当前 browser session namespace 的 active UserMemory 中检索。
- 只对 `text` 与 `tags` 建立 semantic index，并使用 `PostgresStore` vector search 作为唯一正式 candidate source。
- 使用独立的 embedding 配置，固定模型为 `doubao-embedding-vision`；不跟随聊天模型选择器。
- 在 ordinary text chat 与 tool-assisted ordinary chat 中，以最多 3 条、总计最多 900 字符的补充上下文注入。
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
- 声明 fallback policy。

它们不直接执行工具、不管理 MCP client，也不编排多阶段 runtime。

Skill 是提示词组织层，不应该偷偷长成 Agent、Tool Policy 或 MCP 权限层。v0.6.1 的 General ReAct Tool binding 由 server-owned `GeneralToolPolicy -> Tool Registry -> Tool Runtime` 解析；Skill 命中不改变模型 Tool schema，也不触发 remote context。

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
