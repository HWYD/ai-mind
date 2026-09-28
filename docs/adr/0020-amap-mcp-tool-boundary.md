# ADR-0020: Controlled AMap MCP Tool Boundary

## Status

Accepted and implemented for v0.6.2 on 2026-09-27. The verified MCP server version is 1.0.0 and all nine static mappings completed controlled low-frequency contract calls.

## Context

AI Mind v0.6.1 的 General ReAct 只绑定七个静态基础 Tool；MCP Host 已能连接 remote Streamable HTTP server，但 generic remote Tool adapter 根据 `tools/list` 动态生成定义。高德官方托管 MCP 同时提供地点/路线只读资料和本版不需要的 IP 定位、地图生成、导航与打车唤端能力。直接把远端列表暴露给模型会越过现有固定 Tool Policy，也会让高德后续加工具变成 AI Mind 权限变化。

## Decision

- 使用高德官方托管 Streamable HTTP endpoint，服务器固定 `https://mcp.amap.com/mcp`；Web 服务 Key 仅在服务端配置。整个含 Key URL 按 secret 对待。
- 在 AI Mind Registry 中显式声明九项只读地图 Tool，分别覆盖 POI 关键词/周边/详情、地理/逆地理编码和步行/驾车/骑行/公交路线。`tools/list` 用于兼容性检查，不用于每 Run 的模型绑定或授权。
- 继续由 `GeneralToolPolicy -> Tool Registry -> Tool Runtime -> MCP Client` 管理 scope、参数校验、预算、取消、失败与可见性。Skill、Prompt、Resource 和远端返回文本都不能扩权。
- 用户和模型均可生成地点、地址、坐标、POI ID、路线端点和公共 URL 等业务参数候选；Provider 前统一执行 fixed allowlist、strict schema、GCJ-02/范围、公开 URL policy 与 outbound-secret 检查。候选不构成外部事实，且不得用 IP、浏览器、Profile 或 Memory 补全当前位置。高德 Tool 自己为 public Trace/`StreamEvent` 生成不含原始 query、完整地址、坐标、路线细节、POI 原始字段、Key/含 Key URL 和 raw MCP payload 的安全输入/结果摘要，远程错误复用 `remote-readonly` 的固定安全文案。通用 `StreamEvent` projector 保持 secret 兜底，Memory、快照与 PostgreSQL 其余行为沿用通用 Tool 规则。
- 本地坐标统一为 GCJ-02 `longitude,latitude`，最多六位小数；明确标注 WGS-84/GPS、BD-09 或其他体系时不隐式转换。地图 Tool 对齐 `web-search` / `read-url` 的 `remote-readonly + retrySafe: true`：timeout、连接、429、5xx 与已识别的短时频率限制由 Tool Runtime 在条件允许时最多追加两次同参 attempt；已通过 schema 但无法归类的只读 MCP `isError` 最多追加一次。schema、4xx、权限、已识别额度耗尽、空或 malformed 结果只返回安全 repair hint，模型下一 Action 使用新参数修正。adapter 与 MCP client 不自行等待、重试或恢复。`MCPHostError` 仅跨层保留稳定 code、状态与受限 retry 元数据；原始 `isError` 只在 adapter 内存中短暂归类。明确空 POI 数组是成功的 `no-result`，而不是服务失败。v0.6.2 地图能力要求九项均通过真实 Key 验收后发布。
- `amap-maps` 在 MCP Client Manager 以 server definition 的 `toolCallBatchPolicy` 启用进程内共享队列：每批最多 3 条，当前批全部 settled 后再冷却 800ms。排队项继承已有 AbortSignal 与 Tool attempt deadline，取消或关闭时不外发；其他 MCP server、General ReAct 的三并发、重试、错误分类和 public StreamEvent 均不改变。500ms 的真实 smoke 已通过，800ms 是更保守的用户配置，本次不重复外部调用。它不构成跨 Webapp 实例的账号级限流。
- v0.6.2 不增加 MCP server version/schema hash 自动漂移检测、路线多候选/完整逐步指引/道路限制投影或地图专用存储 eligibility 测试；T001 的人工契约记录、有限路线摘要和现有通用 Tool 存储覆盖是本版范围边界。
- 缺 Key、schema 漂移或服务错误时受影响 Tool fail closed，不自动改用任意 MCP Tool、Web 服务 API 或另一地图 provider。
- 工程侧负责固定端点、server-only Key、缺 Key 禁用、错误脱敏和真实 `tools/list` 兼容性核验。账号权限、配额/QPS、计费及条款由用户在公开上线前自行核对；本版不新增账号级限速或告警。

## Alternatives

1. **动态绑定整个高德 `tools/list`**：集成快，但危险能力及未来新增 Tool 会越过固定权限，拒绝。
2. **本地 Node.js I/O 高德包**：仍需相同白名单与安全投影，且增加进程和部署成本；保留为托管不可用时的独立后续决策。
3. **直接接 Web 服务 API**：可控但不满足当前 MCP 目标，需要自行维护九类 endpoint 与错误语义，拒绝本版采用。

比较的完整证据与运维/迁移影响见 [v0.6.2 research](../../specs/v0.6.2-amap-mcp-tools/research.md)。

## Consequences

AI Mind 可复用 MCP Host 与 General ReAct 安全边界，同时必须维护九项稳定本地 schema、远端映射、统一参数校验、Key/URL 脱敏和结果投影。受控 Key 的 `tools/list`、schema 摘要、低频 contract call 与应用 adapter smoke 已记录在版本契约；账号配额/QPS 与服务协议由用户在公开上线前自行核对。现有每 Run 预算不等于账号级总量保护。高德[服务协议](https://developer.amap.com/pages/terms/) 对个人免费、组织使用、展示、存储和对外封装可能有限制；本 ADR 不宣称“非商业即已获授权”，也不把人工核对写成代码实施前提。天气工具替换留待后续版本。

## Relationship to ADR-0019

ADR-0019 的固定 General ReAct Tool 权限、无 remote discovery 赋权和 Tool Runtime ownership 继续有效。它记录的七工具列表是 v0.6.1 的历史状态；v0.6.2 已通过新增静态高德能力更新当前事实。

## Verification

以 [v0.6.2 acceptance](../../specs/v0.6.2-amap-mcp-tools/acceptance.md) 为准。
