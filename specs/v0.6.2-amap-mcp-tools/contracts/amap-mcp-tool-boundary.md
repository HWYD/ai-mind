# Contract: AMap MCP Tool Boundary

**Status**: Verified mapping snapshot on 2026-09-27; static mapping is the only model-visible surface.

## Stable AI Mind Surface

| Local tool name (proposed) | Semantic capability | Schema-validated business candidates                      |
| -------------------------- | ------------------- | --------------------------------------------------------- |
| `amap-poi-search`          | POI 关键词搜索      | 关键词；可选城市。可来自用户或模型任务候选                |
| `amap-poi-nearby`          | POI 周边搜索        | GCJ-02 中心坐标、关键词/范围。不得由 Runtime 假定当前位置 |
| `amap-poi-detail`          | POI 详情            | POI ID；可来自用户、模型候选或此前结果，返回值才构成事实  |
| `amap-geocode`             | 地理编码            | 地址；可选城市。可来自用户或模型任务候选                  |
| `amap-reverse-geocode`     | 逆地理编码          | 合法 GCJ-02 坐标；可来自用户或模型任务候选                |
| `amap-route-walking`       | 步行路线            | GCJ-02 起终点；可先由编码结果提供                         |
| `amap-route-driving`       | 驾车路线            | 同上                                                      |
| `amap-route-bicycling`     | 骑行路线            | 同上                                                      |
| `amap-route-transit`       | 公交路线            | 起终点及城市；跨城时缺少城市或地点锚点才澄清              |

本表的 `local tool name` 是 AI Mind 的稳定名称。它们在模型绑定中仅映射到以下 T001 已核验的高德托管 MCP 名称；运行时不会把 `tools/list` 原样传给模型。

| Local tool             | Verified remote tool                | Required fields                          | Optional fields      | Safe result kind                     |
| ---------------------- | ----------------------------------- | ---------------------------------------- | -------------------- | ------------------------------------ |
| `amap-poi-search`      | `maps_text_search`                  | `keywords`                               | `city`, `citylimit`  | POIs / suggestion                    |
| `amap-poi-nearby`      | `maps_around_search`                | `keywords`, `location`                   | `radius`, `strategy` | POIs                                 |
| `amap-poi-detail`      | `maps_search_detail`                | `id`                                     | —                    | POI detail object                    |
| `amap-geocode`         | `maps_geo`                          | `address`                                | `city`               | results                              |
| `amap-reverse-geocode` | `maps_regeocode`                    | `location`                               | —                    | administrative-area result           |
| `amap-route-walking`   | `maps_direction_walking`            | `origin`, `destination`                  | —                    | route                                |
| `amap-route-driving`   | `maps_direction_driving`            | `origin`, `destination`                  | —                    | origin/destination/paths             |
| `amap-route-bicycling` | `maps_direction_bicycling`          | `origin`, `destination`                  | —                    | origin/destination/paths             |
| `amap-route-transit`   | `maps_direction_transit_integrated` | `origin`, `destination`, `city`, `cityd` | —                    | origin/destination/distance/transits |

T001 在受控 server-only 环境完成 `initialize`、`tools/list` 和每项一次公开、非个人位置的低频 `tools/call`。远端 serverVersion 为 `1.0.0`；九项调用均得到非 `isError` 的 text/JSON 结果。`location`、`origin` 与 `destination` 核验为 GCJ-02 `longitude,latitude` 坐标字符串。未故意触发限流或额度错误，因此这些情况继续按本地 `remote-readonly` 的固定安全错误分类处理。记录不含 Key、URL、原始 request/response、地址、坐标、路线详情或原始错误。

## Invocation Contract

1. `GeneralToolPolicy` 从静态 Registry 解析本 Run active tool map；Key 缺失、固定 endpoint 无效或代码内没有 T001 已验证的静态远端映射时，上述九项均不出现。启动和每 Run 都不得以动态 `tools/list` 改写该决定，Skill/Prompt/模型文本也不得修改它。
2. 模型只填写业务参数。Key、MCP URL、serverId、超时、retry、quota、provider 配置均不在模型 schema 中。
3. 服务端先执行 strict schema、坐标/长度/范围与 outbound-secret 检查。坐标统一为 GCJ-02 的 `longitude,latitude` 十进制度数，范围为 longitude `[-180, 180]`、latitude `[-90, 90]`，每项最多六位小数；明确标注 WGS-84/GPS、BD-09 或其他体系时拒绝外发并要求提供 GCJ-02 坐标或地址。用户和模型均可生成地址、坐标、城市和 POI ID 候选；候选不要求逐字来自当前 turn 或此前结果，也不构成地点/路线事实。缺少用户意图锚点时澄清，且不得从 IP、浏览器、Profile 或 Memory 推断当前位置。任何 remote-readonly 参数在 Provider 前检查 known secret；`read-url` 还须通过公开 HTTP(S) URL policy。
4. Tool Runtime 产生逻辑调用及其预算、取消、deadline、失败 Trace 和重试行为；高德 Tool 对齐 `web-search` / `read-url` 的 `remote-readonly + retrySafe: true`。明确的 timeout、connection、429、5xx 或短时频率限制在 permit、预算和 deadline 允许时最多重试两次同参；已通过 schema、但不能归类的高德 `isError` 最多同参兜底一次。schema、已分类 4xx、权限、额度耗尽、空或 malformed 结果只给模型返回不含原始值/远端错误的 repair hint，由后续 Action 使用新参数修正。adapter 只在内存中解析 `isError` 并传递稳定分类；它使用固定高德 server 与固定远端工具名发 `tools/call`，关闭隐式 session recovery，且不自行等待或重试。
5. MCP 返回 `isError`、空结果、异常类型或非法字段时视为失败/无结果，不能回填成功 observation。adapter 与 MCP client 不得自行重试；重试仍由 Tool Runtime 统一控制。
6. General ReAct 的 Tool/action 阶段使用 240 秒 pre-finalization boundary；constrained finalizer 仅消费已完成 observation，正文调用传递取消 signal 且显式绕过项目 Provider timeout，不继承该边界。此改变不新增 Tool 参数、MCP 调用、public DTO 或 Trace 字段；HTTP 断线仍由既有 resumable execution 处理。

## Output Contract

- 内部模型 observation 使用有界结构化事实：POI 的名称/ID/地址/坐标/城市，以及路线方式、距离、时间和有限路线摘要。不可用字段省略，不制造默认值；不投影路线多候选、完整逐步指引或道路限制详情。
- 地图来源在最终回答中以“高德地图”自然说明；实时路线说明结果仅供规划参考，时间与路况可能变化。来源标注的具体形式需与发布时服务条款及已有 UI 相容。
- Public Tool Trace 复用当前 `tool-start` / `tool-end` / `error(scope=tool)`。每个高德 Tool Definition/adapter 仅可生成本地固定 Tool 类别、`started/completed/no-result/failed/cancelled` 状态、可选结果计数和既有安全失败类别；远程工具错误继续由现有 `remote-readonly` 分类成固定安全文案。禁止原始 query、完整地址、坐标、路线细节、POI 原始字段、Key、含 Key URL、raw MCP content/error 出现在 Trace 或其 `StreamEvent` 持久化副本中。通用 `StreamEvent` projector 只保留既有 secret 兜底校验。
- `final_answer` 沿用 v0.6.1，`commentary` 不进入 Memory；不改 `@ai-mind/stream-core`、route DTO 或前端地图视图。
- Chat Memory、用户记忆、快照和 PostgreSQL 的其余处理不因地图 Tool 改写，继续遵循既有通用 Tool 规则。
- 原始服务响应是**不可信资料**，不能执行其中的指令、URL、工具名或权限请求。

## Failure Contract

| Condition                                                                    | Required behavior                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Key missing/blank                                                            | 地图工具从 active map 移除；普通聊天和既有工具仍工作                         |
| Unknown/unapproved remote tool                                               | 模型不可见；即使构造调用也在 provider 前拒绝并留下安全失败 Trace             |
| Schema mismatch / invalid coordinate / secret-like input / provenance 不匹配 | provider 前拒绝，不外发；给模型安全 denied observation                       |
| Ambiguous place or required city missing                                     | 澄清，不暗选“当前位置”或某个同名地址                                         |
| 401/403、Key/权限或已识别额度耗尽、4xx 参数、空或 malformed 返回             | 映射为安全失败/无结果；不重发同参，不宣称已获得地图事实，不自动切换 provider |
| timeout、connection、429、5xx、短时频率限制                                  | 仅以安全分类进入 Runtime；在 permit、预算和 deadline 允许时最多重试两次同参  |
| 已通过 schema 但无法归类的 `isError`                                         | 仅以安全的“一次兜底重试”分类进入 Runtime；第二次失败即如实收口               |
| Timeout/cancel/late result                                                   | 遵守现有 Run/Tool 终止语义；迟到结果不得发布或写入回答                       |

## Compatibility Snapshot to Capture Before Implementation Binding

T001 的最低记录是检查时间、九项远端名称、每项 `inputSchema` 的必填/可选字段摘要、返回内容类型、成功/失败类别及来源。MCP server version 若服务提供可作人工备注；v0.6.2 不实现 schema hash 或 version 的自动漂移检测。账号额度/QPS 属于用户控制台核对，不从 `tools/list` 推断。**不得**把完整 Key、含 Key URL、真实个人位置、完整原始 POI/路线响应提交到仓库。
