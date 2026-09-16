# Contract: General ReAct Tool Catalog

## Resolution Model

```text
effective tools = GeneralToolPolicy fixed base tools ∩ active Tool Definition policy
```

- 固定候选按 `tool.name` 去重；同名映射到不同 capability 时 fail-closed。
- 只有 `isAvailable()` 成功、runtime scope 包含 `general-react-agent` 且 `executionPolicy.kind='standard-tool'` 的工具可绑定。
- Skill 选择只影响系统提示词和输出风格；不得影响 Tool allowlist、MCP discovery、Resource/Prompt 权限或 execution policy。
- Resource/Prompt 不伪装成 tool；它们只按 Composer 显式 command 或 `@resource` 的既有确定性 context 准备后进入 `createAgent`。
- `agent-tool` 不进入 v0.6.0 通用 effective tools；Tasklist/Delivery 专属 runtime scope 不因通用 Agent 出现而扩大。

`ToolRuntimeScope` 计划新增 `general-react-agent`。未声明 scope 的旧工具仍按既有 `skill-binding` 语义处理，不能因此自动进入通用集合；base tool 必须显式登记。

## Base Tool: `web-search`

### Model Input

```json
{
    "query": "string, trimmed, 1..500 chars"
}
```

`maxResults`、search depth、answer/raw content 等不由模型控制，全部由 server policy 固定。

### Provider Request Policy

```text
endpoint: Tavily Search
search_depth: basic
max_results: 5
include_answer: false
include_raw_content: false
```

只发送最小 query 和固定 provider options；不得把 history、Memory、prompt 或用户身份对象附加为 provider 参数。query 必须先通过下述 Outbound Secret Guard。

### Internal Result

```ts
interface WebSearchObservation {
    query: string
    results: Array<{
        title: string
        url: string
        snippet: string
    }>
    truncated: boolean
}
```

每个同时通过 URL policy 和 Outbound Secret Guard 的 result URL 加入当前 Agent state `_authorizedUrls`，`grantedBy='web-search'`。凭据/签名 URL 不授权、不输出完整敏感 URL；结果 URL 不得自动跨 Run 授权。

### Public Result

显示“正在搜索网页”或“已搜索到 N 个来源”；`N` 是该逻辑调用中通过安全过滤并按 canonical URL 去重后的结果数量，retry 不重复计数。可随最终 `tool-end` 携带最多 5 个 public-safe `SourceRecord` 更新，供通用 Trace 聚合；不显示完整 query history、被拒绝的 query/URL、命中规则、provider raw response 或计费信息。

## Minimal Outbound Secret Guard

### Scope

Guard 只覆盖本版本会发送到第三方 Web provider 的业务参数：

- `web-search.query`；
- `read-url.url`；
- Tavily Search 返回、准备进入 public result 或 `_authorizedUrls` 的 URL。

它不建设通用 PII/DLP、私有上下文语义追踪或用户审批流程。Tavily adapter 自身的 `TAVILY_API_KEY` 只能在 adapter 最内层作为 provider authentication 加入请求，不进入模型参数、ToolObservation、public stream 或日志，也不作为业务参数被 Guard 拒绝。

### Deterministic Deny Rules

在 schema/normalize 后，任何 fingerprint、public input preview、transcript 或 provider invocation 前检查：

- `Authorization`/Bearer/Basic 凭据值；
- Cookie/Set-Cookie/session cookie 值；
- 带明确前缀、header/parameter 名或赋值结构的 API Key、Access Token、Refresh Token、JWT；
- 与当前进程已配置 server secret 精确匹配的值；
- URL username/password；
- AWS `X-Amz-*`、GCP `X-Goog-*`、Azure SAS `sig`、CloudFront `Signature`/`Policy`/`Key-Pair-Id`，以及等价的已知签名参数组合。

URL fragment 在进入 provider payload 前移除。仅出现普通技术词汇 `token`、`cookie`、`authorization` 不构成拒绝；无标识且不等于系统已知 secret 的任意随机字符串不属于本版本保证范围。

### Denied Result

- provider invocation count 必须为 `0`；
- 返回一个与原 `callId` 配对的 `status='denied'` ToolObservation；
- ToolMessage/public summary 只使用稳定分类，例如“请求包含禁止外发的凭据”；不得回显原始参数或命中规则；
- security denial 不进入 retry；Agent 可以提出一个已移除凭据的新逻辑 tool call；
- 原始值不得进入 fingerprint、stream、UI、log、Memory 或 SourceRecord。

## Base Tool: `read-url`

### Model Input

```json
{
    "url": "absolute HTTP(S) URL already authorized in this Run"
}
```

只允许单 URL，不允许数组、通配、相对路径或模型指定 extract strategy。

### Authorization And URL Policy

执行前顺序：

1. parse + canonicalize URL；
2. 移除 fragment，执行 scheme/credential/hostname/IP 与 Outbound Secret policy；
3. 验证 canonical requested URL 存在于当前 `authorizedUrls`；
4. 调用固定 Tavily provider endpoint；
5. 把 provider 内容和 provider-reported URL 视为不可信输入；provider-reported URL 只有重新通过步骤 1～2 后才能公开或授权；
6. 无可靠 final URL 时保留 requested URL 作为 SourceRecord identity，不推断 redirect chain；
7. 限制结果体积并生成 SourceRecord。

### Provider Request Policy

```text
endpoint: Tavily Extract
format: markdown
extract_depth: basic
urls: exactly one authorized URL
```

Tavily 在远端请求目标站点。AI Mind 不观察目标请求的 redirect chain，因而本 contract 不要求或声明逐跳 redirect 校验。

### Internal Result

```ts
interface ReadUrlObservation {
    title?: string
    requestedUrl: string
    providerReportedUrl?: string // 仅在通过 URL/Secret policy 后保留；不代表已证明的 final URL
    markdown: string // <= 12,000 chars after normalization
    truncated: boolean
}
```

### Public Result

单个逻辑调用显示“正在读取页面”“已读取页面”或“读取页面失败”，成功时携带该 canonical URL 对应的 `status='read'` public-safe `SourceRecord` 更新。通用 Trace 可从当前 Run 的唯一记录确定性派生“已读取 N 个页面”和最多 5 项“已读取来源”；retry 不增加数量。Runtime 不增加“官方”标签，也不把 `markdown` 全文写入 UI，不展示 redirect 链、Secret Guard 命中细节或其他无法证明的安全信息。被拒绝时只显示通用安全拒绝或“该链接不可读取”。

## Base Tool: `calculator`

- 复用 `apps/webapp/lib/ai/tools/calculator-tool.ts` 的 name、schema、normalization、formatting 与 authoritative 语义。
- 加入 `general-react-agent` runtime scope。
- 声明 `standard-tool/local-deterministic`、`attemptTimeoutMs=1000`、`retrySafe=true`；Profile 外层上限仍为 5 秒且自动 retry 为 0。
- 表达式长度、允许语法和计算复杂度必须保持有界；同步 `mathjs.evaluate()` 不得只依赖无法抢占 event loop 的 timeout timer。
- 不复制第二份表达式解析或数学执行逻辑。

## Base Tool: `datetime`

- 复用 `apps/webapp/lib/ai/tools/datetime-tool.ts` 的 name、schema、normalization 与 formatting。
- 加入 `general-react-agent` runtime scope。
- 声明 `standard-tool/local-deterministic`、`attemptTimeoutMs=1000`、`retrySafe=true`；Profile 自动 retry 为 0。
- 当前时间类结果按工具执行时刻计算，不由模型臆测。

## General Tool Policy And Skill Boundary

| GeneralToolPolicy member                                   | Boundary                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `calculator`, `datetime`, `text-transform`, `unit-convert` | 已登记的 `standard-tool/local-deterministic`；每一轮均以本地可用性为准。             |
| `read-url`, `web-search`, `city-weather`                   | 已登记的 `standard-tool/remote-readonly`；每一轮仍接受 availability 与安全策略过滤。 |
| remote MCP Tool                                            | 不 discovery、不绑定；未来必须以独立 Tool Policy/权限设计纳入。                      |
| `agent-tool` / `validate_tasklist_structure`               | 不进入 generic catalog，继续由专用 runtime scope 消费。                              |

Skill 可提供 `systemPrompt` 和 `outputPolicy`，但没有 Tool、Resource、Prompt 或脚本的执行权限。脚本只有被一个已登记、可审计的 Tool Definition 包装后才可能进入 GeneralToolPolicy；Skill 包含脚本不构成模型可调用 Tool。

## ChatToolDefinition Extension

计划在产生模块中增加判别式执行策略和 public output 边界；字段名可按现有风格微调，但 union 语义和无默认猜测要求不可弱化：

```ts
type ToolExecutionPolicy =
    | {
          kind: 'standard-tool'
          profile: 'local-deterministic' | 'remote-readonly'
          attemptTimeoutMs?: number
          retrySafe: boolean
      }
    | {
          kind: 'agent-tool'
          profile: 'delegated-agent'
      }

interface ChatToolDefinition<TArgs = unknown> {
    // existing fields...
    executionPolicy: ToolExecutionPolicy
    formatOutput?: (result: unknown) => string // internal model observation
    formatPublicOutput?: (result: unknown) => string // public tool/resource summary
}
```

`attemptTimeoutMs` 是服务端注册元数据，禁止加入模型可填写的 Zod schema。所有现有 Tool Definition 在迁移时必须显式归类；不得把缺少配置的 Tool 静默猜成 `standard-tool`。如果最终实现选择扩展现有 `getResourceResult()` 而非新增 public formatter，也必须保持等价不变量：模型观察与 public output 不能被迫使用同一份完整文本。

## Execution Profiles

| Kind/Profile                        |    Profile attempt cap | Tool retry policy                                      | Current examples                                   |
| ----------------------------------- | ---------------------: | ------------------------------------------------------ | -------------------------------------------------- |
| `standard-tool/local-deterministic` |            5,000ms max | 0                                                      | calculator、datetime、text-transform、unit-convert |
| `standard-tool/remote-readonly`     |           20,000ms max | `retrySafe` execution failure 最多 2 次；Run 总计 4 次 | web-search、read-url、city-weather、只读 MCP Tool  |
| `agent-tool/delegated-agent`        | 不使用普通 attempt cap | 外层 0；内部由专用 Agent Runtime 管理                  | Delivery `*-subagent` Tool                         |

普通 Tool 的有效 attempt timeout：

```text
min(Profile 上限, Tool 自身 attemptTimeoutMs 或 Profile 上限, Action 剩余, Run 剩余)
```

Tool/provider adapter 只能在这个有效窗口内声明更短的 connect/request/parse 子超时，并传播派生 `AbortSignal`。远端只读 retry 优先采用 1～10 秒合法 `Retry-After`，否则使用取消感知的 1～2 秒、2～4 秒指数退避；通过前置校验后，网络异常、HTTP 4xx/5xx、provider typed error、解析异常及其他执行异常均可重试；schema、permission、security、quota、duplicate、budget 与 cancellation 在前置阶段拒绝，不进入 attempt。

## Agent Tool Boundary

- Tool 内部只要委派完整 Agent/worker run，就必须声明 `agent-tool`，不能因为使用 LangChain `tool()` 包装而当作普通 Tool。
- 外层仍执行 runtime scope、allowlist、strict schema、父级 abort/deadline 传播和一次结果配对，但不启动普通 1/5/20 秒 attempt timer，也不重试整个 Agent。
- 内部 model、contract、stage、nested tool、timeout/retry 由专用 Agent Runtime 管理。现有 Delivery `boundary/plan/review/risk/task-subagent` Tool 必须显式标记并继续只属于 `delivery-chain-manager`。
- `validate_tasklist_structure` 只是确定性校验，属于普通 Tool；Tasklist Agent 与 Image Agent 是专用 route，不包装成 Agent Tool。
- v0.6.0 只完成类型隔离，不让通用 ReAct Agent 获得 Agent Tool。未来接入必须新评审父子预算、幂等、持久化和取消语义。

## `createAgent` Tool Adapter Contract

- `createAgent` 接收的 tools 必须来自本次 `effective tools`，不得直接传整个 registry。
- v0.6.0 generic effective tools 只允许 `standard-tool/local-deterministic|remote-readonly`；当前封闭集合不新增 `parallelSafe` 字段。任何 `agent-tool` 或未来副作用 Tool 在绑定前 fail-closed。
- Tool Runtime middleware 是 `createAgent` 与现有 `executeToolCall`/display/error 语义之间的唯一 adapter。
- 处理顺序为 ensure ID → allowlist/scope → normalize → strict schema parse → Outbound Secret Guard（仅 Web Tool）→ fingerprint/budget → tool-specific authorization → execute。Guard 通过前不得生成 public input preview 或记录 raw args。
- `createAgent(version='v2')` invocation 固定 `maxConcurrency=3`；Run Policy 在派发前按 assistant ordinal 生成 batch admission，Tool adapter 只消费对应 call 的 logical/observation allowance。retry 不预分配，每次实际 retry attempt 前统一向 Run `RetryPermitPool` 原子申请。
- 每个逻辑 call 只允许一个由 Tool Runtime 管理的 attempt lifecycle、一次 public transcript 和一个最终 ToolMessage；符合策略的底层 retry attempt 不重复生成 ToolMessage 或 public part。
- unknown/invalid/denied/duplicate/budget/timeout/cancelled/error 必须由 adapter 返回配对 ToolMessage，不允许 adapter 与框架各生成一条错误。
- 现有普通聊天 authoritative bypass 在通用 Agent 中关闭；成功观察必须回到 `createAgent` model node，直到模型自然完成或 policy stop。
- `standard-tool/remote-readonly` 且 `retrySafe=true` 的任意执行 failure 最多 retry 两次，每个 Run 最多四次；本地确定性 Tool 和 Agent Tool 外层不 retry；schema、permission、duplicate、budget、auth、quota、outbound security denial 和 cancellation 等前置拒绝不进入 retry。
- public formatter 失败不得导致内部 tool success 变成失败；改为安全通用摘要并记录 formatter failure category。
- 如果现有 `executeToolCall` 会在 retry 中间提前发送 terminal error，必须把“单次底层 attempt”和“最终 public transcript”拆成有明确边界、可被现有专用 runtime 共同复用的执行原语；不得复制第二套 Tool executor。

### Dynamic MCP Tool Boundary

- `tools/list` 返回的 JSON Schema 必须递归转换为 strict schema；object 未声明字段拒绝，未知/不支持的 schema type fail-closed，不得使用 passthrough。
- MCP Tool 的 public input/output 固定为最小通用摘要，不得回退 raw args、`structuredContent`、text content、provider metadata 或 error；完整结果只作为有界 internal observation 交给模型。
- Tool Runtime 派生的 `AbortSignal` 必须贯穿 remote adapter、manager、client 到 MCP SDK `callTool`；取消后不得重建 session 或发起迟到调用。
- General ReAct remote adapter 必须传入 server-only `allowSessionRecovery=false`。MCP client 的默认 session recovery 只服务其他既有调用方，不得成为通用 Tool Runtime 之外的隐藏 retry。

## Availability Contract

- `calculator`、`datetime`: 始终按现有本地可用性判断。
- `web-search`、`read-url`: `TAVILY_API_KEY` 缺失时不绑定/不可用；不得向模型声明一个必然失败的工具。
- Web tools 不可用不影响零工具回答及本地 base tools，但模型 selection 仍必须支持 tool calling。
- `agent-tool`: 即使自身可用，也不得进入 v0.6.0 `general-react-agent` resolution；仅由明确的专用 runtime scope 消费。
- availability 状态只输出布尔/分类，不输出 key 或 provider config。

## LangChain Compatibility Gate

在迁移普通聊天前，scripted model 必须一次返回至少四个 tool calls，并证明选定 LangChain JS stable 版本在 `version='v2'`、`maxConcurrency=3` 下满足：峰值底层并发为 3、第四个等待、乱序完成仍保持 ToolMessage ID/ordinal 配对、9-call batch budget 不穿透、delta/union state update 不丢失。另用并发 execution failure（含 4xx、5xx 和未知异常）证明 actual-use `RetryPermitPool` 只向真正开始的 retry 发放 permit，单 call 不超过 2、Run 不超过 4。若失败，必须回到 Plan 评审，不能通过 provider-specific prompt 或偶然调度顺序掩盖问题。
