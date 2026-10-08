# Implementation Plan: v0.6.2 AMap MCP Tools

**Branch**: `codex/v0.6.2-amap-mcp-tools` | **Date**: 2026-09-26 | **Spec**: [spec.md](./spec.md)
**Status**: T001–T057 已完成。单 Run logical Tool Call 总预算已从 18 调整为 21，并确认其跨九个 Tool-bearing rounds 累计计算。真实 `tools/list`、九项 contract call 与应用 adapter smoke 已在受控 server-only 环境完成；T040–T043 的 500ms 定向回归与外部 smoke 已通过，随后按用户决定将实际冷却调整为更保守的 800ms 且不重复测试。T048 修复已识别额度耗尽同时携带 429 时的误重试。未创建 commit、tag、remote release 或 deployment。

## Summary

在现有 General ReAct 的固定 Tool 权限路径中增加高德官方托管 MCP 的九项只读地图能力。新建静态服务定义与按能力显式声明的 Tool adapter；Key 仅保存在 server env，经固定 HTTPS 端点构建连接。运行前校验参数与 outbound secret，结果投影为有界、可信度明确的 observation；Tool Runtime 继续拥有预算、取消、超时与 Trace。可先用 fake 完成代码打通，真实 Key 的 `tools/list` 与 schema 核对是远端映射定稿和连通验收门；账号控制台与条款核对由用户在公开上线前处理。现有天气工具本版仅作诊断记录。

## Technical Context

**Language/Version**: TypeScript 5.x，Node.js，React 19 / Next.js App Router
**Primary Dependencies**: 现有 `@modelcontextprotocol/sdk`、LangChain `createAgent(version='v2')`、Zod、AI Mind Tool Runtime
**Storage**: 不新增数据库表、迁移或原始地图结果缓存；PostgreSQL、聊天记忆和快照继续走既有通用 Tool 路径。高德 Tool 仅为 `StreamEvent` 生成不含地图敏感字段的 public 投影
**Testing**: Vitest contract/unit/integration；真实 Key 的手动/受控 smoke；typecheck、lint、build、现有回归
**Target Platform**: 现有 Web/桌面宿主共享的服务端 webapp，服务端 HTTPS 出网
**Project Type**: pnpm/Turborepo workspace
**Performance Goals**: 单次地图调用遵守 `remote-readonly` profile 的 20s attempt ceiling；General ReAct 收口前阶段最多 240s，constrained finalizer 正文不设应用内时限；不新增 UI 轮询
**Constraints**: 固定只读 allowlist、server-only Key、GCJ-02 `longitude,latitude` 坐标语义、public-safe DTO、strict schema、对齐 `web-search` / `read-url` 的 `remote-readonly + retrySafe: true` 策略、无动态 Tool grant、无新 stream/API；finalizer 保留显式取消但绕过项目 Provider timeout
**Scale/Scope**: 普通 `routeType=chat`；九项语义能力须全部通过才发布；每 Run 最多 21 次 logical Tool Calls，九个 Tool-bearing rounds 内累计计算而非每轮 21 次；收口前 deadline、并发、重试与 observation 总预算保持不变；账号级 QPS/总量由用户依据控制台另行评估，不在本版新增限流实现

## Constitution Check

### Pre-design gate

| Principle                             | Result | Handling                                                                                     |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| Controlled Agent First / MCP boundary | PASS   | 仅固定九项，Skill 不赋权，MCP 不直接进入主 Runtime                                           |
| GraphState / checkpoint               | N/A    | General ReAct 不新增 GraphState/持久化                                                       |
| Stream Compatibility / Public DTO     | PASS   | 不改 public chunk/API；只复用安全 Tool Trace 与 final text                                   |
| Minimal Abstraction                   | PASS   | 一处显式地图 adapter 边界，不构建通用 provider 框架                                          |
| Tests Before Broad Integration        | PASS   | 先工具契约与安全测试，再接 General ReAct 与部署                                              |
| Spec Drift / Evidence Revalidation    | PASS   | `research.md` 比较托管 MCP、动态发现、本地 Node 与直接 API；实施后同步 ADR/architecture/docs |

### Post-design gate

上述门保持 PASS；T001/T021 已以受控 server-only Key 的低频 smoke 完成真实 Key、托管 schema 与九项映射验证。账号权限、配额与条款仍是公开上线前由用户处理的运营事项。

## Technical Plan

1. **Compatibility / T001 mapping gate**: Key 到位后，先在受控服务端读取 MCP `initialize`、`tools/list`，并以公开、非个人位置的低频样本对每项候选执行一次 contract call，逐项核验九项候选的名称、input schema、GCJ-02 坐标字段语义、结果形态与失败类别；只记录脱敏元数据和日期。T001 是静态映射定稿的外部契约门，必须在 T007 固化映射前完成，不能作为实现后的普通 smoke。它可使用不绑定模型权限的受控 provider probe；如复用 T004/T005 的固定连接实现，则仅调整物理执行顺序，仍不得晚于 T007。核验完成前仅可准备 fake 契约，不得把候选名称写入 active tool map。九项任一不可用则当前版本地图发布门不通过，不用自动发现替代；用户无需手工抄录工具清单。
2. **Server definition**: 在 `apps/webapp/lib/ai/mcp/protocol/types.ts`、`registry/server-definitions.ts` 定义专属 `amap-maps`；在 transport/配置边界由 `AI_MIND_AMAP_MCP_KEY` 构造**固定** `https://mcp.amap.com/mcp` URL，不允许配置任意 host。缺失/空白 Key 使地图能力 unavailable，任何错误、观测、诊断不得序列化含 Key URL。检查 SDK/HTTP 错误中 `url`、`cause` 的脱敏路径。
3. **Static Tool Definitions and unified business parameters**: 在 `apps/webapp/lib/ai/tools/` 建立稳定的 AI Mind 名称与 Zod schema，明确模型可填字段、默认值和限制；坐标规范化为 GCJ-02 `longitude,latitude` 的十进制度数，最多六位小数，明确标注的非 GCJ-02 坐标拒绝外发而不做隐式转换。在 MCP adapter 逐项映射至 T001 已验证的远端名称/参数。`tools/list` 不在启动或每 Run 的模型绑定路径；Key 存在而映射未核验时能力仍 inactive。用户与模型均可为当前任务生成城市、地址、坐标、POI ID、路线端点和公共 URL 等**业务参数候选**；不维护参数来源 ledger，也不将候选当外部事实。固定 allowlist、strict schema、GCJ-02/长度/范围、公开 URL policy 与出站密钥防护在 Provider 前校验。缺少用户意图锚点时澄清，不能假定设备、住址或当前位置。对齐 `web-search` / `read-url` 的 `remote-readonly + retrySafe: true`：Tool Runtime 对明确的 timeout、连接、429、5xx 与短时频率限制在 permit、预算和 deadline 允许时最多重试两次；高德 adapter 只在内存中归类 MCP `isError`，已通过 schema 的未分类只读失败最多同参兜底一次。schema、4xx、权限、已识别额度耗尽、空或 malformed 结果向模型回传不含原始值的 repair hint，由下一 Action 使用新参数修正。adapter 与 MCP client 不增加独立等待、重试或隐式 session recovery。
4. **Safety and output**: General ReAct Tool 入站对所有 `remote-readonly` 参数执行统一 `assertOutboundDataAllowed`；地图 adapter 保留纵深防护，URL 另经公共 HTTP(S) policy。地图服务响应只投影地点必要字段，以及路线方式、距离、时长和有界路线摘要；不投影路线多候选、完整逐步指引或道路限制详情。即使远端返回文本、URL 或指令，也只当数据处理；异常与 `isError` 产生安全失败 observation。高德 Tool Definition/adapter 自行实现安全 `formatInput`、`formatPublicOutput` 和按具体用途命名的展示标题，令 `tool-start`、`tool-end` 在写入 `StreamEvent` 前不含具体地址、坐标、查询、Key/含 Key URL、路线细节、POI 原始字段或 raw payload，也不展示 provider 品牌名或 `amap-*` 内部名；工具错误复用 `remote-readonly` 的固定安全分类文案，可保留安全 code 供 Runtime 分类，但不外发原始 MCP error。通用 `StreamEvent` projector 保留既有 secret 兜底，不增加地图专用字段扫描。Memory、快照与 PostgreSQL 其余行为不作地图例外。本版不实现 MCP server version/schema hash 的自动漂移检测。
5. **Binding**: 仅在 `apps/webapp/lib/ai/capabilities/tool-binding.ts` 的固定候选集合中加入九项静态名称，且受 Key availability、scope 和 standard-tool policy 筛选。模型绑定、执行 map 和 Trace 共用同一次解析。保留原七工具、Tasklist/Delivery/Image 隔离。
6. **Operations**: 实施阶段更新 `apps/webapp/.env.example`、`deploy/env/webapp.production.env.example`、`docs/architecture/production-deployment.md` 与必要的 env sync/verify 检查，明确 server-only Key、缺 Key 禁用、轮换方式和脱敏错误。将账号权限、配额/QPS、计费及条款核对列为用户负责的公开上线事项；本版不新增账号级限速、用量告警或计费控制。现有每 Run 预算不能证明多实例账号总用量安全，部署时须依据人工核对结果另行作运营决策。不改 GitHub Actions secrets 路径或部署拓扑。
7. **Verification and close**: 已完成单元/契约、scripted Runtime、真实 Key smoke、前端 Trace/重连、回归矩阵；本次收口再次执行 `speckit-analyze` 与 `speckit-converge`。Tool result prompt 把当前 Run 的 observation 作为即时、精确或外部事实的依据，并在缺失、失败或未完成时如实收口；地图 Tool use prompt 说明最小调用、候选参数、位置锚点和真实用户场景。评分、路线、位置缺失与跨城公交只作为场景示例，不把提示词变成第二个权限系统。ADR、Capability Surface、公开版本文档与 README 已同步为真实能力描述。
8. **Completed constrained finalizer presentation**: `AgentRun.status` 是面向用户的总状态事实；`completed` 即使携带 `finalizationMode='constrained'` 也显示“已完成思考”，`constrained` 继续用于保持 Trace 展开、运行审计和禁止写入 Memory。受限 finalizer 接收与 loop 相同的 Tool result facts rule；路线空结果不能基于坐标或经验补充距离、时长或路线事实。
9. **AMap safe failure and no-result projection**: `MCPHostError` 只携带 stable code、HTTP status、retryable 标记与受限 retry limit 等非敏感分类；Amap client/adapter 不保留 raw error、URL 或 response body。adapter 只在内存中读取 MCP `isError` 的结构化字段或错误文本：明确的 timeout、connection、429、5xx 和短时频率限制沿用 Runtime 最多两次指数退避；无法归类、但已通过 schema 的只读 `isError` 最多同参兜底一次；权限、额度耗尽、参数、空或 malformed result 不重试。adapter 与 MCP client 不自行等待、重试或 session recovery。逆地理编码 allowlist 投影国家、省、市、区；只有明确空 POI 数组成为 `no-result` observation。提示词将 no-result 视为成功的当前 Run 事实，禁止同参数重复调用。
10. **AMap request batch pacing**: 在 MCP Client Manager 的 `callTool` 边界实现可选的、按 `serverId` 共享的进程内批次调度；该机制只在 server definition 显式声明时启用。`amap-maps` 配置每批最多 3 条，当前批次全部 settled 后冷却 800ms，随后才允许下一批启动。队列等待响应既有 AbortSignal 与 Tool attempt deadline；取消或 deadline 到期的队列项不外发。保持 Tool Runtime 的全局并发、20 秒 attempt、retry permit 与错误分类 owner，不在 adapter、前端、StreamEvent、数据库或模型 prompt 中增加专用逻辑。受控真实验证已证明更短的 500ms 冷却下三批各三条详情调用为 9/9 成功；用户将实际配置调整为更保守的 800ms，因此只同步实现与确定性断言，不重复外部调用。该调度器只覆盖单个 Webapp 进程；多实例共用 Key 的分布式限流留待后续运营/基础设施决策。
11. **Constrained finalizer unbounded output**: `preFinalizationDeadlineMs=240_000` 仅限正文收口前的行动阶段，维持 235 秒 loop deadline 与 5 秒 handoff reserve。进入 constrained finalizer 后不创建本地 deadline timer，且以 `timeoutMs: null` 显式绕过项目 Provider 默认 timeout；取消仍经父 signal 传播并停止未完成的流。chat service 不得保留 270 秒外层 abort 或将 pre-finalization deadline 传给 durable projection，因此可恢复执行会在 HTTP 客户端断线后继续。普通无 Tool 最终回答没有进入 finalizer，仍在 loop 预算内；Tool、重试、并发、observation 与 public stream/API/DTO 均不变。

## Project Structure

### Documentation (this feature)

```text
specs/v0.6.2-amap-mcp-tools/
  spec.md  plan.md  research.md  decisions.md  data-model.md
  contracts/amap-mcp-tool-boundary.md  quickstart.md  tasks.md
  acceptance.md  checklists/requirements.md  checklists/amap-mcp.md
```

### Source Code (implemented scope)

```text
apps/webapp/lib/ai/mcp/{protocol,registry,transport,adapters}/
apps/webapp/lib/ai/tools/
apps/webapp/lib/ai/capabilities/tool-binding.ts
apps/webapp/lib/ai/runtime/general-react-agent/middleware/tool-runtime-middleware.ts
apps/webapp/tests/lib/ai/{mcp,capabilities,runtime}/
apps/webapp/.env.example
deploy/env/webapp.production.env.example
docs/{adr,architecture,versions,releases,tasklists}/
```

**Structure Decision**: 复用现有 Tool/MCP/Runtime 分层；具体新增 adapter 文件名由实施时按实际九项远端 schema 选择，不能先假设 `tools/list` 名称已验证。

## Risks and Release Gates

- Key 与托管 schema 未提供，无法完成真实连接验收。无 Key 时可实施 fake/contract 路径；真实 Key 到位后核验每个准备公开的工具。
- 账号月配额/QPS 与收费可能变化；本版无账号级总量保护，既有每 Run 预算不能替代它。用户在公开上线前依据控制台决定流量、告警及费用处置；工程侧不以公开页面推定该 Key 的实际上限，也不靠真实请求打满额度验证限流。
- 服务条款对个人免费使用、组织使用、展示、存储及封装可能有适用限制；用户在公开上线前自行核对账号类型与具体使用方式，代码实施不受该人工步骤阻塞，工程文档不宣称“非商业即自动获准”。
- `city-weather` 的 wttr.in 上游与取消/超时链路需后续独立修复；高德天气替换必须先验证是否仍能提供当前温度/湿度语义，本版只保留诊断，不改变代码。
- 本版不投影路线多候选、完整逐步指引或道路限制详情；后续若扩展这些内容，须重新评估 observation 预算、public Trace 脱敏和服务条款影响。
