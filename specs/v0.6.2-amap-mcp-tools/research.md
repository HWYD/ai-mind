# Research: v0.6.2 AMap MCP Tools

**Date**: 2026-09-26
**Scope**: 官方高德资料、AI Mind v0.6.1 代码基线，以及 2026-09-27 的受控 server-only 真实契约与应用 adapter 低频验证。

## Official Evidence

| Topic     | Evidence                                                                                                                                                                        | Engineering implication                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| MCP 能力  | [高德 MCP 概述](https://developer.amap.com/api/mcp-server/summary)列出关键词/周边/详情搜索、地理/逆地理编码、四类路线，也列出天气、IP 定位、地图与唤端能力                      | 仅选择本版九项只读语义，不能把高德全部能力直接暴露给模型                                                                |
| 接入方式  | [快速接入](https://developer.amap.com/api/mcp-server/gettingstarted)推荐 Streamable HTTP，示例端点为 `https://mcp.amap.com/mcp?key=<Web 服务 Key>`；另有 Node.js I/O            | 托管端点匹配现有 MCP HTTP client；URL 中含 Key，必须作为 secret 处理                                                    |
| Key 准备  | [创建应用和 Key](https://developer.amap.com/api/mcp-server/create-project-and-key)与[Web 服务 Key 指南](https://developer.amap.com/api/webservice/guide/create-project/get-key) | 需高德开发者账号、应用和服务平台为 Web 服务的 Key；真实值只放服务端 env                                                 |
| 协议变化  | [更新日志](https://developer.amap.com/api/mcp-server/changelog)与快速接入页在 2026-03-17 更新；官方推荐 Streamable HTTP                                                         | 不把旧 SSE 作为本版 fallback；实施时重新检查服务端实际响应                                                              |
| 配额/收费 | [服务升级](https://developer.amap.com/upgrade)列出基础服务**月配额**、QPS 与升级入口                                                                                            | 用户在公开上线前从账号控制台核实权限、配额/QPS 和成本；工程侧不从公开页面推定该 Key 的实际上限，也不对真实服务压测      |
| 条款/合规 | [服务协议](https://developer.amap.com/pages/terms/) 及[合规中心](https://developer.amap.com/api/compliance-center/check-and-reference/compliance)                               | 用户自行判断账号与公开试用、结果展示/保留的适用性；工程侧记录风险，不将“非商业”视为自动授权，也不以人工核对阻塞代码实施 |

官方概述描述的是**能力语义**，没有提供可据此冻结的托管 `tools/list` 名称和完整 JSON Schema。第三方示例以及官方 Node 包的历史名称不能代替当前托管端点契约；本版因此固定九项 AI Mind 本地名称，并以受控 server-only 环境完成 `initialize`、`tools/list`、九项低频 contract call 和应用 adapter smoke 定稿远端映射。用户无需手工列举远端工具名；绝不能因为工具名不匹配而放开整个远端列表。

## Live validation record

- 2026-09-27 受控低频验证记录 MCP server version `1.0.0`、`tools/list` 的九项固定映射、GCJ-02 `longitude,latitude` 字段语义，以及每项正常 `tools/call` 的 text/JSON 成功结果类别。
- 应用层 external smoke 使用同一固定映射调用全部九项 adapter，测试通过。记录与测试输出均未保存 Key、URL、原始请求/响应、完整地址、坐标、路线详情、POI 原始字段或原始错误。
- 该记录只证明当日服务契约与连通性，不替代用户上线前对账号权限、配额、计费或服务条款的核对。

## Post-closing request pacing validation (2026-09-28)

- 使用 server-only Key 和真实 `maps_text_search` 返回的 POI ID 做受控详情调用时，三条并发详情可成功；直接发起超过三条的突发调用曾得到没有 HTTP status 的安全 `REQUEST_FAILED`，短暂冷却后可恢复。因 MCP `isError` 的 raw 内容不允许保存，不能将该现象断言为月度额度或特定原始服务错误。
- 按“每批最多 3 条，前一批全部完成后等待 1000ms”的真实调用，三批各三条详情为 9/9 成功；同一实验把冷却缩短为 500ms，仍为 9/9 成功。结果支持采用批次屏障而不是只使用 semaphore：普通三并发 semaphore 会在某条先完成时立即启动下一条，从而重新形成短时突发。
- 推荐在 MCP Client Manager 的 `callTool` 边界实现按 `serverId` 的可选进程内批次队列；`amap-maps` 显式配置 `maxBatchSize=3`、`cooldownMs=800`。500ms 的真实验证已经通过，800ms 是用户指定的更保守值，本次不重复外部调用。该选择不改变 Tool Runtime 的 retry、deadline、全局并发或 adapter 语义，也不属于跨实例账号限流；后者需要共享基础设施，留待后续版本。

## Existing Baseline

- `apps/webapp/lib/ai/mcp/transport/streamable-http-transport.ts` 使用官方 MCP SDK 的 Streamable HTTP client，但现有 bearer auth 逻辑不解决高德 URL query Key 的脱敏问题。
- `apps/webapp/lib/ai/mcp/registry/server-definitions.ts` 采用静态 server 定义；`MCPServerId` 是类型联合。可增加专属高德 server，而不引入任意地址配置。
- `apps/webapp/lib/ai/mcp/adapters/remote-mcp-tool-adapter.ts` 依赖远端 `tools/list` 的元数据转 schema，支持基础 JSON Schema 子集。它适合现有远程 mock 能力验证；直接给 General ReAct 绑定会产生动态工具与 schema 漂移风险。
- `apps/webapp/lib/ai/capabilities/tool-binding.ts` 只从 `tools/index.ts` 的显式 Tool Definition 和固定名称中选择 General ReAct 工具；当前七项为 calculator、datetime、text-transform、unit-convert、read-url、web-search、city-weather。Skill 不拥有权限。
- `apps/webapp/lib/ai/runtime/general-react-agent/middleware/tool-runtime-middleware.ts` 在 Provider 前统一校验用户/模型生成的业务参数：地图来源门禁与 `read-url` 授权 ledger 已移除，固定 allowlist、strict schema、公开 URL policy 和 outbound-secret 策略保留；模型已请求但被拒的 Tool 有安全失败 Trace 与不含原始值的 repair observation。
- `apps/webapp/lib/ai/tools/registry.ts` 的 Tool Definition 已有 `formatInput`、`formatPublicOutput` 与 `getDisplayConfig` 扩展点；Tool Runtime 在 `tool-start` 前调用前两者并将 `tool-end` 的公开输出与内部 observation 分离。高德可在自己的 Definition/adapter 封装 `StreamEvent` 所需的输入/结果字段脱敏，不改通用 stream schema；`remote-readonly` 的执行错误已有固定安全分类文案。
- `apps/webapp/lib/ai/tools/registry.ts` 定义 `remote-readonly` profile；Tool Runtime 是超时、重试、取消与预算 owner。`web-search` 与 `read-url` 使用 `remote-readonly + retrySafe: true`，仅在 permit、预算和 deadline 允许且错误为 retryable 时最多重试两次；计算器是本地确定性 profile，不能作为远程地图的超时/重试基线。v0.6.2 高德 Tool 对齐前者，adapter 与 MCP client 不另设重试或 session recovery。当前 generic remote MCP adapter 的 `retrySafe: false` 不成为地图选择的依据，因为本版仍须建立高德自己的静态 schema 与 public projection 边界。
- `StreamEventProjector` 已有通用 secret-like redaction/forbidden-key 兜底，但不识别地址、坐标或路线字段；地图字段的 public 脱敏应由高德 Tool 产生安全摘要。v0.6.1 的 Memory/snapshot 继续按通用 Tool 规则处理，不需要新增 stream chunk。
- 为控制本版实现量，不新增 MCP server version/schema hash 自动漂移检测、路线多候选/完整逐步指引/道路限制投影，或地图专用存储 eligibility 测试。T001 的人工可审阅契约记录、有限路线摘要和既有通用 Tool 存储覆盖足以支撑本版九项静态工具与安全门。

## Alternatives and Decision

| Candidate                              | Requirement fit                | Boundary/security                                          | Compatibility/operations                                    | Validation and migration                        |
| -------------------------------------- | ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| A. 托管 MCP + 九项显式 adapter（推荐） | 直接使用官方 MCP，覆盖所需能力 | Key server-only、固定白名单、严格参数与输出投影            | 复用 MCP Client 和 General Tool Runtime；无需新 server 进程 | 需真实 Key 核对远端名称/schema 和出网；改动集中 |
| B. 把远端 `tools/list` 全部动态绑定    | 可能覆盖更多，但超出本版范围   | 远端新增 Tool 会自动扩大权限，尤其包含唤端和地图生成       | 工具 schema/名字变化影响模型与 Trace                        | 验证面大，回归风险高；拒绝                      |
| C. 本地 Node.js I/O 高德 MCP           | 覆盖类似能力                   | Key 在本地进程 env，仍需白名单                             | 新增进程、依赖与部署维护；官方更推荐 HTTP                   | 运维与升级成本较高；作为托管不可用时的后续备选  |
| D. 直接调用高德 Web 服务 API           | 可精细控制响应                 | 必须自建每个 endpoint adapter；绕开用户指定的 MCP 接入目标 | 少一层 MCP，但增加 API 版本/错误映射维护                    | 不满足当前“引入高德 MCP”要求；本版不选          |

评估维度覆盖需求匹配、架构边界、安全、兼容性、可运维性、验证成本与迁移风险。A 最符合用户目标和现有受控架构；选择 A 不意味着现有 generic remote adapter 可原样投入 General ReAct。

## Materials to Prepare

1. 高德开放平台开发者账号与应用，创建 **Web 服务 Key**；提供到服务端安全配置渠道，不能贴进仓库、截图、issue、日志或聊天工具参数。
2. 用户在公开上线前自行从实际账号控制台确认 MCP 权限、月配额、可能的日限额、QPS、计费/欠费处理与 Key 限制策略；工程侧不把这项人工核对当作代码实施前置条件。
3. 目标部署环境能够到达 `https://mcp.amap.com/mcp`；通过真实 Key 低频检查 `initialize`、`tools/list` 和九项代表性正常调用。空结果、无权限、限流、取消与超时主要用 fake/scripted response 验证，不刻意使真实服务超额或过载。
4. 准备不会暴露个人常住/实时位置的固定验收样本：一个城市关键词、一个公开 POI/坐标、同城与跨城公交样本。真实地点结果随时间变化，测试只断言结构和事实一致性。
5. 用户在公开上线前自行核对当时服务协议、合规中心及账号授权对公开非商业试用、AI 摘要展示与结果保留的适用性，并决定是否需要额外许可；这不阻塞工程实现，也不等于当前已证明公开上线许可。

## Coordinate Semantics

- 高德官方 Web 服务文档把坐标写为经度在前、纬度在后，且小数点后不超过六位；高德 JS API 明确采用 GCJ-02 坐标系。托管 MCP 的远端 schema 须由 T001 实测，本地 Tool 契约固定为 GCJ-02 `longitude,latitude`，由 adapter 映射到实测字段。[周边搜索文档](https://developer.amap.com/api/webservice/guide/api/search/) [坐标系说明](https://developer.amap.com/api/javascript-api-v2/guide/abc/basetype)
- 用户明确说明 WGS-84/GPS、BD-09 或其他坐标系时不在本版引入坐标转换 Tool；要求提供高德 GCJ-02 坐标或地址。这样避免把未验证的坐标转换悄悄混入地图查询主链。

## Weather diagnosis and later option

- 当前 `city-weather` 通过 `weather-tool-adapter.ts` 调用本地 stdio MCP `weather-server.mjs`；后者以 `https://wttr.in/<city>?format=j1&lang=zh-cn` 获取 `current_condition`。wttr.in 的[项目说明](https://github.com/chubin/wttr.in/blob/master/README.md)确认 `format=j1` 包含 `current_condition`、温度、湿度和 observation time，因此现有模型侧“当前天气/温湿度”有明确含义。
- 代码中的 `fetch` 没有单独的 AbortSignal/超时；Tool Runtime 取消/超时没有通过 adapter 传入该 fetch。远端请求卡住时，外围 20s Tool attempt 与 MCP 15s request timeout 可能结束调用，却不能保证子进程内的 HTTP 请求同时停止。`city-weather` 的 `retrySafe: true` 还可使失败调用最多执行三次。`weather-server.mjs` 将用户输入的 city 原样作为结果城市，不验证上游解析出的地点及观测时间。这些是可从代码确认的风险，但没有用户线上错误日志，尚不能断言是哪一项造成所报不稳定。
- 当前测试目录没有天气专用的成功、错误、超时或取消回归用例；后续修复应先用实际失败样本或受控 fake 复现，再验证超时传播、地点/时间字段与现有 `city-weather` 契约。单次公共 wttr.in 请求成功只能证明当时可达，不能证明持续稳定。
- [高德 MCP 概述](https://developer.amap.com/api/mcp-server/summary)将天气输出写为 `forecasts`（预报）；[高德 Web 服务天气 API](https://developer.amap.com/api/webservice/guide/api/weatherinfo)则区分 `extensions=base` 的实况与 `extensions=all` 的预报，实况有更新时间。故高德具备实况 API，不代表托管 MCP 的天气 Tool 已暴露同等字段；要替换 `city-weather`，须先用真实 Key 验证 MCP 是否返回当前温度、湿度、地点和 reporttime。
- 后续版本候选：A. 若 MCP 满足实况契约，保留 AI Mind `city-weather` 名称并更换后端；B. 若 MCP 仅有预报，单独评估直接高德 Web 服务 API 或修复现有 wttr.in 链路；C. 若仅需预报，新增不同语义的工具。依据需求匹配、现有 Tool 边界、安全、兼容、运维和迁移成本，优先在实测后选 A；不在 v0.6.2 改动天气代码。

## Remaining clarification assessment

九项本地能力、位置来源、文字展示、失败策略及天气范围均已有用户决策，不再需要用户先提供一份具体远端工具名单。唯一影响远端映射定稿的事实是安全提供 Web 服务 Key 后取得的托管 `tools/list`、schema 和结果形态；这是工程实测项，不是产品需求澄清。若实测缺少任一九项能力、返回字段不足以满足验收，或用户后续改变公开数据保留方式，应回到同一 canonical spec 工作区修订范围与验收，不让代码凭猜测扩权。

## Post-closing diagnostic: trace, provenance, and thinking (2026-09-27)

- 用户截图中的三次 `amap-geocode` 失败可由旧来源守卫确定性复现：用户写“上海”，模型将参数规范为“上海市”后，旧实现按原字符串逐字比较，在请求发到 MCP 前拒绝。该拒绝路径也没有复用 Tool Definition 的展示配置，所以暴露内部名。该临时城市后缀等价修复已由 D-017 supersede：模型和用户参数统一走 schema、GCJ-02/范围、outbound-secret 与固定 Tool 边界，不再以原文字面来源拒绝候选。
- 在受控 server-only 环境中，以同一 MCP client session 并发执行三次公开城市编码，连同九个静态 adapter smoke 一起通过。该证据排除了本次复现中的单 session 并发/QPS 根因，但不替代运营侧对账号配额与真实生产网络的持续监控。
- `deepseek-v4-pro` 由现有 OpenAI-compatible provider 经火山方舟配置调用。UI 的“深度思考”默认关闭，关闭时会明确传 `thinking: disabled`；修复后，该模型被单独声明为支持 reasoning，用户开启时明确传 `thinking: enabled`。工具仍使用 `tool_choice=auto`：行程条件不足时模型可以先澄清，不应把模型的一次澄清回答判断为 Runtime 未提供工具。
- [DeepSeek 思考模式文档](https://api-docs.deepseek.com/guides/thinking_mode/) 说明思考模式使用 `thinking` 开关，并支持工具调用；[Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/) 列出 `deepseek-v4-pro`、`thinking` 与 `tool_choice` 参数。当前诊断只验证本地 provider payload 和单元测试，未用账号模型凭据发起会消耗配额的真实模型请求。
- 原地图 Tool prompt 对九项能力只有“当前可用工具”的 fallback，缺少用途、候选参数和事实边界。现补齐地点搜索、编码和四类路线的用途描述：模型可生成业务参数候选，Tool observation 才构成外部事实；缺少位置锚点时澄清。这提高输入充分时的正确选择率，不改变 `tool_choice=auto` 的模型自主性。

## Prompt scenario refinement (2026-09-27)

- 真实组合请求“找三里屯评分最高的日料，再告诉我从天安门开车过去要多久”包含地点候选、评分和路线等多个待核验事实。对这些事实以及其他 Tool 场景，统一以当前 Run 的 observation 为依据；结果没有提供、失败或未完成的内容如实说明，不能借由模型常识、估算、同类候选或调用顺序补齐。
- 路线 Tool 的失败、空结果或 denied observation 不含距离/时长事实。最终回答若在此时给出“约 10 公里”“高峰约 40 分钟”等数值，是模型用稳定知识或估算填补精确工具缺口，违反通用事实边界。解决方式是强化通用 Tool result rule，不建立地图专属的回答分支。
- 提示词用四类简短示例帮助模型分辨：评分排序、明确驾车路线、缺少位置的“附近”查询、跨城公交。示例只解释用户任务和所需事实，不是关键词触发器，不扩大 active tool map，也不替代 schema、统一安全校验或 Runtime 的硬边界。

## Unified business parameter and repair decision (2026-09-27)

- 用户确认所有 Tool 的业务参数都可来自用户表达或模型为当前任务生成的候选。服务器拥有 Key、endpoint、serverId、远端 Tool 名、timeout、retry 和 quota；模型不能用候选改变这些边界。
- 候选先走 strict schema、工具语义、GCJ-02/范围、公开 URL policy 与 remote-readonly outbound-secret guard。候选不是页面、地点、POI、路线、距离或时间事实；只有成功 observation 可作为最终回答依据。
- schema/4xx 参数失败不重发同一请求。Runtime 返回字段级但不含原始值/远端错误的 repair observation，模型可在下一 Action 使用不同参数，这会消耗原有 Action/Tool/model 预算。timeout、连接、429、5xx 等 retryable 瞬态失败才在同一逻辑调用中最多补两次 attempt。
- 回归覆盖模型生成地图坐标/地址、公共 URL、通用 remote-readonly secret guard、模型修正后的单次 Provider 调用、4xx 单 attempt 与 429/5xx/timeout retry。此决定取代所有 Run-scoped 参数 provenance 规则；固定 Tool allowlist、public Trace 脱敏和 observation 事实边界不变。

## MCP `isError` retry re-evaluation (2026-09-28)

- 非受控突发调用曾表现为没有 HTTP status 的安全 `REQUEST_FAILED`，而批次节流后恢复；这说明只凭 transport HTTP status 不能覆盖所有短时高频失败。MCP `isError` 的正文不能进入 public 或持久化数据，但 adapter 可以在内存中读取后立刻归一为安全标量。
- 比较了两种做法：将所有 `isError` 一律重试，会放大无效参数、Key/权限和额度耗尽；只保持全部不可重试，则会丢失短时频率限制和服务繁忙的恢复机会。选择按稳定 status/code 和受控文本信号分类：明确的限流、服务、timeout、connection 使用现有最多两次指数退避；Key、权限、额度、4xx、空或 malformed 结果不重发；其余已通过 schema 的只读 `isError` 只允许一次兜底。
- 该方案保持 Runtime 作为唯一等待、deadline、预算和 retry owner。adapter 既不自行发送重试，也不保存原始错误；所有重新调用仍经过 `amap-maps` 的三条一批、800ms 调度。测试覆盖分类、一次上限和脱敏，未为本次决策调用真实服务。

## Delegability

本任务为 Level C/D 跨边界规划，已将官方资料调研委派给独立只读 agent；本 agent 负责代码基线、各规格文件与最终整合。当前文档彼此强耦合，采用单一 owner 写入，后续以独立审阅进行一致性检查；没有并发写同一文件。

## Constrained finalizer deadline re-evaluation (2026-10-08)

- 运行证据显示地图场景的 finalizer 首 token 已消耗约 24.6 秒；固定 30 秒 phase timer 使正文仅输出约 5 秒即被终止。将 finalizer 延长到剩余 270 秒只能缓解早结束 loop，仍会在长前置阶段或长正文时截断。
- 评估过“保留 270 秒整轮 timer、仅移除 30 秒 finalizer cap”和“收口前 240 秒、constrained finalizer 不设应用内 timer”两种方案。前者仍让 Chat Service abort 与 durable projection deadline 在正文阶段失败，不能满足正文无时间上限；后者保持 Tool/action 的 235 秒 loop、5 秒 handoff reserve、20 秒 attempt、并发和 retry 边界，同时不人为截断已进入收口的正文，因此采纳后者。
- `timeoutMs: null` 是跨 Provider 边界的显式语义：`undefined` 继续使用 `AI_MIND_LLM_TIMEOUT_MS`，`null` 表示当前 constrained finalizer 不向 OpenAI-compatible client 传入项目 timeout。父 AbortSignal 仍传入模型流；HTTP client 断线继续由既有 StreamExecutionCoordinator 的后台 resumable 执行处理。Provider、网关、负载均衡器或进程自身的独立限制不在此改动的承诺范围。
- 该改动涉及同一条 chat-service → General ReAct → model-provider 主链，拆分并发写入会增加共享边界冲突；由单一 owner 整合，测试覆盖作为独立验证而非并发修改。
