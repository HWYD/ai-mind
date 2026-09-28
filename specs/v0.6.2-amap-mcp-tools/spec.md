# Feature Specification: v0.6.2 AMap MCP Tools

**Feature Branch**: `codex/v0.6.2-amap-mcp-tools`
**Version**: `v0.6.2`
**Created**: 2026-09-26
**Status**: Local implementation, release verification, and post-closing maintenance verification completed on 2026-09-27; no commit, tag, remote release, or deployment was created.
**Input**: 在 v0.6.1 General ReAct 基线上接入高德地图官方托管 MCP，向普通 AI Mind 聊天提供受控地图查询工具。

## Clarifications

### Session 2026-09-26

- Q: 接入哪一种服务与传输？ → A: 高德官方托管 MCP，使用 Streamable HTTP；不在本版部署本地 Node.js I/O server。
- Q: 哪些地图能力进入 v0.6.2？ → A: 固定只读白名单：POI 关键词、周边、详情搜索，地理/逆地理编码，步行、驾车、骑行、公交路线规划；不开放服务端返回的其他工具。
- Q: 如何取得用户位置？ → A: 仅使用用户明确输入的位置、地址或坐标及本轮真实查询结果；不通过浏览器、IP 或其他隐式定位推断。
- Q: 如何展示结果？ → A: 继续使用聊天文字与现有 Tool Trace；不新增地图组件、工具级详情、公开协议或专门的地图页面。
- Q: Key 与公开试用如何处理？ → A: 用户稍后通过安全配置提供 Web 服务 Key；工程侧负责服务端接通、真实 `tools/list`/schema 兼容性检查和低频调用验证，不以账号控制台核额或条款核对阻塞代码编写。账号权限、配额、计费及服务条款/数据使用适用性由用户在公开上线前核对。
- Q: 天气工具是否在本版替换？ → A: v0.6.2 只诊断现有 `city-weather` 的不稳定性；高德天气替换留待后续版本单独决定，当前天气语义不得在本版静默改变。
- Q: 地图查询在服务端的存储与记忆如何处理？ → A: 高德地图按既有通用 Tool 的 PostgreSQL、聊天记忆与快照规则处理，不增加地图轮次的专门跳过或长期记忆禁令；仅在写入 `StreamEvent` 前由高德 Tool 自己生成不含敏感字段的 public 投影。
- Q: 脱敏放在哪一层？ → A: 高德 Tool Definition/adapter 负责安全的输入摘要、公开结果摘要和展示标题；远程工具错误继续复用现有 `remote-readonly` 的固定分类文案。通用 `StreamEvent` 投影仅继续承担所有 Tool 共用的 secret 兜底校验，不加入地图字段识别策略。

### Session 2026-09-27

- Q: 坐标的顺序和坐标系是什么？ → A: 本地语义统一使用 `longitude,latitude` 的十进制度数，最多六位小数；用户未标注体系时按高德 GCJ-02 解释。用户明确标注 WGS-84/GPS、BD-09 或其他体系时，本版不做隐式转换，改请其提供高德 GCJ-02 坐标或地址。
- Q: “追问地点详情”是否跨聊天轮次复用 POI ID？ → A: POI ID 可以作为用户或模型生成的业务候选再次发起查询，不以来源作为 Provider 前门禁；只有本次成功 observation 才能支持回答事实，系统不从旧 Run 自动宣称或恢复地点事实。
- Q: 九项能力是否允许部分发布？ → A: 不允许。v0.6.2 的地图能力发布以九项均完成真实 Key 成功验收为门槛；任一项远端不兼容时保持 fail closed，并先在本 canonical workspace 经范围修订后再决定是否发布缩减能力。
- Q: 高德查询是否自动重试？ → A: 对齐现有 `web-search` / `read-url` 的远程只读策略：`remote-readonly + retrySafe: true`。Tool Runtime 在重试 permit、Run budget 与 deadline 允许时最多再试两次；高德 adapter 不自行等待或发送重试，MCP client 也不作隐式 session recovery。高德 `isError` 会在 adapter 内存中归类：明确的限流、服务繁忙、超时或连接失败进入既有最多两次指数退避；无法归类且已通过 schema 的只读查询只允许一次同参兜底重试；权限、额度耗尽、参数和结果结构错误不重发。计算器的本地确定性策略不适用于远程地图调用。
- Q: 用户输入“上海”而模型参数为“上海市”时是否应拒绝？ → A: 不拒绝。该候选和其他用户/模型业务参数统一经过 schema、工具语义、GCJ-02/范围与出站安全校验；不再维护城市后缀或参数来源授权规则。
- Q: 地图 Tool Trace 如何命名？ → A: 使用面向用户的具体用途，如“地址转坐标”“驾车路线规划”“地点搜索”；public Trace 不显示 provider 品牌名或 `amap-*` 内部工具名。
- Q: 受限收口但已生成最终回答时，Trace 如何展示？ → A: `AgentRun.status='completed'` 显示“已完成思考”；`constrained` 仅保留 Runtime 预算、观测与 Memory 收口语义，不冒充运行失败。具体 Tool 的空结果或失败仍在对应 Trace 行如实展示。
- Q: `deepseek-v4-pro` 的深度思考如何启用？ → A: UI 的“深度思考”开关保持默认关闭；用户开启后，仅为声明支持该能力的该模型显式传递 `thinking: enabled`。工具选择仍由模型在 `tool_choice=auto` 下按当前输入是否足够具体决定，不能由前端或 Runtime 强制调用。
- Q: 真实用户同时要求地点、评分和路线时，提示词如何收口？ → A: 工具调用结果是即时、精确或外部事实的依据。任一用户目标缺少结果、失败或未完成时，最终回答分别说明已确认、未确认和下一步；不得以模型常识、估算、同类候选或工具调用顺序补齐。评分与路线只是这一通用规则在地图场景中的例子。
- Q: Tool 参数是否只能逐字来自用户或本 Run observation？ → A: 业务参数可由用户或模型基于当前任务生成，并统一经过 strict schema、工具语义、固定目标边界和 outbound-secret 校验。参数是查询候选，不构成外部事实；Key、endpoint、serverId、remote Tool 名、timeout、retry 与 quota 继续只能由服务端控制。
- Q: 地图 Tool 标红时是否可判断为额度耗尽？ → A: 不能根据公开 Trace 判断。Trace 只显示固定安全状态；Runtime 仅保留 HTTP 状态、MCP Host code 与受限 retry hint 等非敏感分类信息。高德 adapter 只在内存中读取 `isError` 的结构化字段或错误文本来归类，随后立即丢弃原文；明确的超时、连接、429、5xx 与短时频率限制可重试，无法归类的只读 `isError` 最多兜底重试一次，权限、额度耗尽、参数或结果级错误不可重试。
- Q: 坐标转地址或周边搜索成功但没有可用结果时如何处理？ → A: 逆地理编码允许投影远端明确返回的国家、省、市、区字段；远端明确的 POI 空数组是成功的 `no-result`，不是失败。模型不得以同一 Tool 与同一参数重复调用，可如实说明未找到，或在用户意图支持时使用实质不同的地点锚点、关键词或范围继续。
- Q: 参数错误如何重试？ → A: schema 或已分类的远端参数拒绝不重发相同参数，而是向模型返回不含原始值或远端错误的安全 repair hint；模型在下一 Action 用新参数重试，并消耗既有 Run 预算。timeout、连接、429、5xx 等 retryable 瞬态失败才可在同一逻辑调用中最多追加两次同参 attempt。

### Session 2026-09-28

- Q: 高德详情查询出现短时连续失败时，如何保持与现有 Tool 的三并发策略一致？ → A: General ReAct 的全局 `maxToolConcurrency=3` 不变；仅 `amap-maps` 在 MCP Client Manager 中使用进程内、按 `serverId` 共享的批次调度。每批最多三条 Tool 请求，上一批全部 settled 后冷却 800ms 再启动下一批。排队等待服从既有取消与 20 秒 Tool attempt deadline；不新增 adapter 私有重试、StreamEvent 字段或账号级限流。
- Q: 为什么把已验证的 500ms 调整为 800ms？ → A: 受控 server-only 验证以真实搜索返回的 POI ID 执行三批各三条详情调用，批次完成后冷却 500ms，结果 9/9 成功。800ms 是用户指定的更保守配置；由于它比已通过的冷却更长，本次只改配置与确定性断言，不重复真实调用。
- Q: 将 `maxLogicalToolCalls` 从 14 调整为 18，会不会使九个 Tool-bearing rounds 各执行 18 次？ → A: 不会。18 是单个 Run 内所有 admitted logical Tool Calls 的累计上限；九个 Tool-bearing rounds 只是模型最多可发起带 Tool Action 的轮数。并发、每 Run retry permits、20 秒 attempt、235 秒 loop deadline、270 秒 hard deadline 和 48,000 字符 observation 总预算均不调整。
- Q: 是否将累计上限由 18 继续提升到 21？ → A: 是。21 仍是单个 Run 的累计上限，不按九个 Tool-bearing rounds 相乘；它是 3 的倍数，地图请求可形成七批每批三条的调度。保持 3 并发、4 个 retry permits、800ms 地图批次冷却、20 秒 attempt、235/270 秒 deadline 和 48,000 字符 observation 总预算不变。

## Summary

AI Mind 的普通聊天需要在用户提出地点或出行问题时使用高德实时资料。v0.6.2 将官方托管 MCP 作为远程只读能力来源，经 AI Mind 自己的固定 Tool Policy、Tool Registry 和 Tool Runtime 进入 General ReAct。用户获得地点、地址与路线的文字回答，能够在现有 Trace 中看到安全的调用状态；模型不能自由发现或调用高德全部 MCP 工具。

## Goals

- 在普通聊天中回答明确地点、周边、地址坐标和四类路线问题，来源限于本轮真实的高德工具结果。
- 缺 Key、服务故障、限流、数据缺失、参数不明确时有可理解且不捏造结果的收口。
- 保持 server-only Key、固定只读权限、有限预算、可取消执行和 public DTO 安全边界。
- 沿用 v0.6.1 General ReAct、Tool Trace、Memory 与恢复语义，不引入第二套 Agent Runtime。

## Non-goals

- 天气工具替换或新增高德天气、IP 定位、距离测量、专属地图生成、导航/打车唤端链接、地图可视化、浏览器定位、地图专用的个人位置资料实体或缓存。
- 开放任意 MCP server/tool discovery、由 Skill 或模型决定工具权限、任意 URL/host 配置或用户自带 Key。
- 新建地图数据库、原始 MCP transcript 存储、长期缓存 POI/路线结果、修改 `stream-core` 或公开 API/stream DTO。
- 自动化 MCP server version / schema hash 漂移检测；T001 只记录实现静态映射所需的人工可审阅 schema 字段摘要与来源。
- 路线多候选、完整逐步指引、道路限制等详细路线投影；本版只提供方式、距离、时长和有界路线摘要。
- 地图专用的 Memory、快照或 PostgreSQL 保留策略及其专用 eligibility 测试；地图继续使用通用 Tool 存储规则。
- 账号级限速、用量告警、计费控制、真实付费或压力验证；这些仍属于后续版本或上线运营工作。

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 查找地点 (Priority: P1)

用户在普通聊天中搜索某城市的餐厅、景点或周边地点，可继续查询候选地点详情。业务参数可以由用户或模型生成；回答区分搜索建议与真实 POI，地点名称、地址和距离等只来自本轮观察到的字段。

**Why this priority**: 地点搜索是最小可用地图能力，也为详情与路线提供可靠的地点标识。

**Independent Test**: 给出明确城市的关键词，得到来自真实高德结果的文字候选和安全 Tool Trace；无结果或服务失败时不编造地点。

**Acceptance Scenarios**:

1. **Given** 用户给出城市和关键词，**When** 搜索有结果，**Then** 返回可区分的 POI 候选及实际可用的地址信息。
2. **Given** 用户给出中心点或明确地点，**When** 请求周边搜索，**Then** 只在已明确的范围内查询；缺少可确定中心点时先澄清。
3. **Given** 本轮搜索得到 POI ID，**When** 用户需要详情，**Then** 使用该 ID 查询并仅陈述真实返回字段。

### User Story 2 - 地址与坐标 (Priority: P2)

用户明确给出地址或 GCJ-02 `longitude,latitude` 坐标后，可获得地理编码或逆地理编码结果，供理解地点或继续规划路线。

**Why this priority**: 为路线提供坐标转换，且避免从会话上下文推测用户所在位置。

**Independent Test**: 地址→坐标和坐标→地址各跑一个成功与一个歧义/无结果场景；没有明确位置时不调用定位工具。

**Acceptance Scenarios**:

1. **Given** 用户提供可识别地址，**When** 编码成功，**Then** 说明匹配地址和坐标，不把候选当作精确当前位置。
2. **Given** 用户提供合法高德坐标，**When** 逆地理成功，**Then** 回答返回的行政区划或地址信息。

### User Story 3 - 规划路线 (Priority: P3)

用户给出起终点及出行方式后，可获取步行、驾车、骑行或公交路线的文字摘要；必要时先对起终点做地理编码。路线时效、限制条件与多候选应如实表达。

**Why this priority**: 在前两类能力之上形成完整出行问答，不扩大到导航执行。

**Independent Test**: 对四种方式分别给定明确起终点并得到真实路线或明确失败；跨城公交缺少必要城市信息时先澄清。

**Acceptance Scenarios**:

1. **Given** 明确的起点、终点和出行方式，**When** 路线服务成功，**Then** 返回对应方式、距离/时间和有界路线摘要；不展示多候选、完整逐步指引或道路限制详情。
2. **Given** 起终点含歧义，**When** 无法唯一编码，**Then** 请求补充地址或城市，不选择虚构的当前位置。
3. **Given** 公交跨城且缺少必需城市，**When** 准备调用，**Then** 先要求用户提供城市。

### Edge Cases

- Key 缺失、无权限、额度耗尽、服务不可用、超时、取消、MCP 连接恢复失败：本次 Tool 标为失败或不可用；不得切换到未授权的地图服务，也不得宣称路线已查到。
- 高德返回空候选、多候选、非文本内容、异常 schema 或 `isError`：拒绝把异常数据当成功 observation；给出可操作的澄清或失败说明。
- 地名重名、坐标顺序/格式/范围非法、明确标注为 WGS-84/GPS/BD-09 等非 GCJ-02 坐标、超范围路线、跨城公交参数不足：在执行前校验或澄清，必要时保留高德返回的明确限制。
- 用户在新聊天轮次引用上次地点列表：模型可用已有文字或 ID 形成查询候选，但本次必须重新执行 Tool；不得把旧 Chat Memory/旧 Run 中的地点、路线或评分直接表述为当前已验证事实。
- 地图结果中的文本是不可信资料，不能改变 Tool 权限、系统指令或调用地址。

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: 只有普通 `routeType=chat` 的 General ReAct 可以使用本版高德工具；Tasklist、Delivery、Image 与 Skill 命中不得自动获得权限。
- **FR-002**: 模型可见的高德工具必须来自本版固定只读白名单；远端 `tools/list` 的新增、改名或危险工具不得自动进入模型绑定。
- **FR-003**: 实施须支持 POI 关键词、周边、详情，地理/逆地理编码，步行/驾车/骑行/公交路线，并在真实 Key 下核对每项远端名称、输入 schema 与返回内容。v0.6.2 地图能力发布要求九项均通过；单项不兼容时该项 fail closed，当前版本不得部分发布，除非先在同一 canonical workspace 修订范围与验收。
- **FR-004**: Tool 的业务参数可由用户或模型基于当前任务生成；模型生成的城市、地址、坐标、POI ID、路线端点和 URL 只作为待验证的调用候选，不是地点、路线、页面或其他外部事实。缺少能表达用户意图的地点、起终点或网页目标时，模型应澄清而不假定当前位置、住址或用户未表达的私人资料。不得通过 IP、浏览器定位、用户 Profile 或 Memory 自动补全当前位置。
- **FR-013**: 坐标 schema 只接受 `longitude,latitude` 顺序的十进制度数，范围为 longitude `[-180, 180]`、latitude `[-90, 90]`，每项最多六位小数。未标注体系的坐标按 GCJ-02 解释；明确标注 WGS-84/GPS、BD-09 或其他体系时不隐式转换，要求用户提供高德 GCJ-02 坐标或地址。
- **FR-005**: Key 仅配置在服务端；模型参数、public stream、Tool Trace、Memory、快照和普通日志不得含 Key 或含 Key 的 MCP URL。
- **FR-006**: 所有 Tool 参数须经过严格 schema、长度/范围、工具语义和 outbound-secret 校验。任何 remote-readonly Tool 的业务参数均在 Provider 前检查已配置的 Key、Token、签名 URL 与其他已知凭据；`read-url` 还须通过公开 HTTP(S) URL policy，禁止私网、localhost、userinfo、凭据与签名 query。
- **FR-007**: Tool Runtime 区分 transport retry 和模型参数修正。仅 timeout、连接、429、5xx 等标记为 retryable 的瞬态失败可在 permit、预算和 deadline 允许时最多追加两次同参 attempt；schema 或远端 4xx/参数拒绝不得重发同参，须向模型返回安全 repair hint 并允许下一 Action 使用新参数。adapter 与 MCP client 不得另行重试或隐式 session recovery；public 文案不能外发远端原始错误。失败、限流与未知执行状态不得捏造成功，也不得静默切换 provider。
- **FR-008**: 返回内容只作为不可信 observation；高德 Tool Definition/adapter 必须为 `tool-start`、`tool-end` 生成固定安全的 public 输入/输出摘要，不含原始 query、完整地址、坐标、路线细节、POI 原始字段、Key/含 Key URL 或原始 MCP payload。public Trace 以具体中文用途命名，不显示 provider 品牌名或内部 `amap-*` 名称。Trace 总标题按 `AgentRun` 终态表达：`completed` 显示“已完成思考”，只有真实 `failed` 显示“处理未完成”；`constrained` 不改变终态文案。远程调用错误继续走现有 `remote-readonly` 的固定安全分类文案，不外发原始 MCP 错误。最终回答可引用必要的地点和路线事实，并继续按既有通用 Tool 的 Memory/快照策略处理。
- **FR-009**: Key 缺失/配置无效，或代码内尚未固化经 T001 验证的静态远端映射时，高德工具均不进入 active tool map；Key 本身不等于工具已验证可用。其余七个既有工具与普通问答不受影响。
- **FR-010**: 本版不新增 public API、stream chunk、数据库表或前端地图视图；既有正常完成、重连、Memory 和快照投影保持 v0.6.1 规则。
- **FR-011**: 工程侧须提供 server-only Key 配置、缺 Key 时禁用地图能力、固定端点、错误脱敏和真实 Key 的连接/工具契约 smoke。部署资料说明用户需自行核对账号权限、配额/QPS、计费、轮换与条款；本版不新增账号级限速、用量告警或计费控制。
- **FR-012**: 业务参数来源不作为 Provider 前的授权条件；固定 Tool allowlist、server-only 配置、strict schema、坐标系/范围、URL policy、outbound-secret guard、Tool Runtime 预算与 public projection 是执行边界。模型生成的参数不得改变权限、选择未批准 Tool 或创建对用户位置、POI、路线、网页内容的事实声明。
- **FR-014**: Tool prompt 必须区分参数候选和 observation 事实：模型可按当前用户意图规范化或补全业务参数，但结果缺失、失败或未完成时不得把候选、模型常识、估算、同类候选或调用顺序说成事实。受限 finalizer 也必须获得同一 Tool result 事实规则；路线未返回距离或时长时，不得根据坐标、直线距离、道路经验或同类路线推算。缺少任务锚点时先澄清，尤其不得假定当前位置或私人位置；地图场景只用来说明最小调用和结果收口。
- **FR-015**: MCP client 与 AMap adapter 只能向 Tool Runtime 传递非敏感失败分类：稳定 MCP Host code、HTTP status、retryable 标记与受限 retry limit。高德 adapter 可仅在内存中检查 `isError` 的结构化字段或错误文本，并立即丢弃原始内容。明确的 timeout、connection、429、5xx 或短时频率限制沿用最多两次同参指数退避；已通过 schema 但无法归类的高德只读 `isError` 最多同参兜底一次。401/403、Key/权限问题、已识别的额度耗尽、4xx 参数错误、缺失或 malformed result 不可重试；模型可在后续 Action 使用新参数修正参数问题。不得把原始错误、请求 URL、响应正文、Key 或其派生信息写入 `StreamEvent`、Trace、Memory、快照或普通日志。
- **FR-016**: 逆地理编码仅投影远端明确返回的 `country`、`province`、`city`、`district` 行政区字段，不拼接或猜测完整地址、坐标或当前位置。POI 搜索/周边搜索只有在远端明确返回空 `pois`/`results` 数组时才输出结构化 `no-result` observation；缺失字段、错误类型或非空但不可投影记录必须作为安全失败。`no-result` 是当前 Run 的成功事实，模型不得用相同 Tool 与归一化后相同参数再次查询。
- **FR-017**: `amap-maps` 的 MCP Tool 请求必须在单一 Webapp 进程内按 `serverId` 共用批次队列：每批最多 3 条，当前批次所有请求 settled 后冷却 800ms 才可启动下一批。调度只作用于该 server 的 `callTool`，不得改变 General ReAct 的全局并发、其他 MCP server、Tool schema、adapter 映射、公开 stream/Trace DTO 或既有 retry 分类。排队请求收到 abort 或 deadline signal 后不得外发。
- **FR-018**: General ReAct 的 `maxLogicalToolCalls` 为单个 Run 所有 admitted logical Tool Calls 的累计上限 21，不按九个 Tool-bearing rounds 相乘。每个 batch 只可取得剩余累计 slots，超出第 21 次的调用在 Provider 前以既有 `tool_call_limit` 拒绝。`maxToolBearingRounds=9`、`maxToolConcurrency=3`、`maxToolRetries=4`、20 秒 attempt、235 秒 loop deadline、270 秒 hard deadline 与 observation 预算保持不变。

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 三类 POI、两类编码、四类路线共九项能力均有至少一个真实 Key 成功验收记录；任一项远端不兼容、无权限或结果契约不满足时 v0.6.2 地图能力不发布，须先修订同一 canonical workspace 的范围与验收。
- **SC-002**: 固定白名单之外的 MCP 工具在模型绑定与执行入口的授权数为 0；Key 缺失时高德 active tools 数为 0。
- **SC-003**: 每个高德 Tool 的 `tool-start`、`tool-end` 与 `error(scope=tool)` 写入 public stream/Trace/StreamEvent 前，Key、含 Key URL、原始 MCP payload/error、原始 query、完整地址、坐标、路线细节和 POI 原始字段出现次数为 0。通用 secret 保护继续覆盖日志、Memory 与快照；用户主动输入、最终文字及地图 Tool 的其他持久化行为遵循既有通用 Tool 规则。
- **SC-004**: 四种路线、空/歧义/失败、取消、超时和重连场景均无虚构的服务成功或隐式当前位置；`longitude,latitude` 顺序、六位小数限制、GCJ-02 默认解释与显式非 GCJ-02 拒绝均有自动化证据。用户或模型生成的业务参数可通过 schema 后调用 Tool，最终文字仍只依据真实 observation。
- **SC-005**: 现有七个通用 Tool、无地图需求问答、Tasklist/Delivery/Image 与 stream contract 回归通过。
- **SC-006**: Key、Token、signed/private URL 或其他 known secret 在 Provider 前被拒绝，Key 缺失时地图工具不可见，且现有 Tool Runtime 的 logical-call、attempt、deadline 与 repair 预算仍生效。
- **SC-007**: 提示词契约测试覆盖工具结果事实依据、缺失/失败收口、位置缺失和跨城公交示例，并断言 loop 与受限 finalizer 都不会用常识、估算、同类候选或工具调用顺序替代未确认事实；Trace 展示测试覆盖 completed constrained Run 与真实 failed Run 的不同文案。
- **SC-008**: 自动化测试证明 AMap 的 timeout、connection、429、5xx 与已识别的短时频率限制仅以安全类别进入 Runtime 并可重试；已通过 schema 的无法归类 `isError` 最多只重试一次；4xx、权限、额度耗尽、空或 malformed result 不重试。行政区事实与明确空 POI 的 `no-result` 可被模型消费，所有 public Trace、StreamEvent、Memory/snapshot 测试断言中均不含原始错误、URL、Key、地址或坐标。
- **SC-009**: 确定性测试证明 `amap-maps` 不会启动超过 3 条并发 Tool 请求，下一批在前一批全部 settled 后至少等待 800ms，取消/过期队列项不外发；受控 server-only external smoke 的三批各三条真实 POI 详情调用通过，记录不含 Key、URL、POI ID、地址、坐标或原始错误。800ms 是在已通过 500ms 外部证据上的更保守配置，本次不重复外部调用。
- **SC-010**: 自动化测试证明单 batch 的前 21 个 logical Tool Calls 可被 admission，第 22 个在 Provider 前被 `tool_call_limit` 拒绝；在第九个 Tool-bearing round 之前已使用 19 次调用时，同一累计上限只再准入两次，不能形成 `21 × 9` 次调用。并发、重试、deadline 和 observation 预算断言保持原值。

## Assumptions

- v0.6.1 已作为 `main` 基线完成本地 release closing；v0.6.2 使用同一 server-side General ReAct Runtime。
- 受控 server-only 环境已配置可用于高德官方托管 MCP 的 Web 服务 Key；T001 与应用 adapter 的低频 smoke 已核验远端 `tools/list`、实际 schema 与九项映射。账号额度与公开出网策略仍由用户上线前自行核对。
- 用户已选择准备面向公众的非商业试用，并自行负责账号与条款核对；[当前服务协议](https://developer.amap.com/pages/terms/) 对账号用途、结果保留和对外封装有适用条件。工程验收不代替该人工判断，公开上线许可不能由“非商业”直接推定。

## Dependencies

- 高德开发者账号、应用与 Web 服务 Key；服务端到 `mcp.amap.com` 的 HTTPS 出网；可查看账号控制台中的配额/计费信息。
- 现有 MCP Client Manager、Streamable HTTP transport、GeneralToolPolicy、Tool Runtime 和 v0.6.1 安全 Trace。

## Risks

- 托管服务的 `tools/list`、schema、数据字段或配额可能变动；必须以真实 Key smoke 固定当前契约并 fail closed。
- 高德服务协议对公开使用、数据展示/存储、服务封装的条款可能影响上线方式；用户在公开上线前自行核对当前条款与实际账号授权，工程验收不代替该人工判断。
- 现有 `city-weather` 通过本地 MCP 调用 wttr.in；其上游波动和取消/超时边界待单独修复。高德 MCP 概述的天气能力描述为预报，不足以证明可等价替代当前温度/湿度查询，本版不改变天气工具。
- 高德实时资料可能不准确或过期；最终回答应呈现数据来源与适用限制，不能替代实际交通/导航判断。
