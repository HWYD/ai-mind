# Quickstart: v0.6.2 AMap MCP Validation

**Status**: 2026-09-27 已完成本地验证；本指南保留为复验步骤。未创建 commit、tag、remote release 或 deployment。

## Prerequisites

- 高德开发者账号与可用 Web 服务 Key，真实值通过服务端安全渠道配置为 `AI_MIND_AMAP_MCP_KEY`；不要写入仓库文件或命令行参数。
- 服务端可通过 HTTPS 到达高德官方托管 MCP。用户在公开上线前自行核实账号权限、配额、QPS 和计费规则；这不阻塞代码编写。
- 使用公开固定地点样本；不使用个人实时位置或含凭据的测试文本。

## Compatibility Smoke

1. 执行 T001：在受控环境完成 MCP `initialize` 与 `tools/list`，并以公开、非个人位置样本对每项候选执行一次低频 contract call；仅保存[边界契约](./contracts/amap-mcp-tool-boundary.md)要求的脱敏 snapshot。该步骤在静态映射进入代码前完成，不以实现后的应用 smoke 替代。
2. 对 POI 关键词、周边、详情，地理/逆地理编码及四类路线各执行至少一次代表性调用；使用 GCJ-02 `longitude,latitude` 的公开样本，核对名称、strict schema、坐标字段语义、返回内容类型与错误语义。明确标注 WGS-84/GPS、BD-09 的 fake 输入必须在 provider 前拒绝。
3. 用本地 fake/scripted response 验证缺 Key、错误 Key、限流/额度错误、空结果、歧义、超时和取消；真实 Key 只做低频正常请求，不刻意打满额度或 QPS，也不对高德服务进行压力测试。确认高德 Tool 生成的 `tool-start`、`tool-end`、`error(scope=tool)` 及其 `StreamEvent` 副本不出现 Key/含 Key URL、原始 MCP 错误、原始 query、完整地址、坐标、路线细节或 POI 原始字段。
4. 将低频 smoke 的脱敏工具契约交给工程验收；账号控制台及当前[服务协议](https://developer.amap.com/pages/terms/)的适用性由用户在公开上线前自行处理。程序不能从成功调用推定账号余量或公开使用许可。

## App Acceptance Matrix

| Scenario                                | Expected result                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 城市 + 关键词，周边中心点，追问详情     | 三类 POI 能以真实结果回答；Trace 只显示安全状态                                                                               |
| 明确地址 / GCJ-02 坐标                  | 地理与逆地理编码正确区分候选和精确结果；坐标按 `longitude,latitude` 解析                                                      |
| 明确 WGS-84/GPS/BD-09 坐标              | 不隐式转换或外发；要求提供高德 GCJ-02 坐标或地址                                                                              |
| 明确起终点 + 四种方式                   | 仅对该方式调用，回答真实距离/时间和有界摘要；不展示多候选、完整步骤或道路限制详情；跨城公交信息不足时澄清                     |
| 未提供位置                              | 不触发 IP/浏览器定位，不猜当前位置                                                                                            |
| 无 Key/服务失败                         | 高德工具不可用或安全失败，普通问答与原七 Tool 可用                                                                            |
| 断线重连 / 取消                         | 现有 Trace 与 final answer 的回放/终态一致，无迟到结果                                                                        |
| constrained finalizer 长正文 / 显式取消 | 收口前阶段最多 240 秒；已进入 constrained finalizer 的正文不受项目内 deadline 或 Provider 默认 timeout 截断，显式取消仍停止流 |
| Prompt injection / secret-like 地图参数 | 不改变权限，不外泄数据，不执行返回文本指令                                                                                    |
| 模型生成 POI ID/坐标、地址或城市候选    | 通过 strict schema、GCJ-02/范围和出站安全校验后可调用；结果才作为事实                                                         |
| schema 或远端 4xx 参数错误              | 不重发同一参数；模型获得安全 repair hint 后可用不同参数再试，计入既有 Run 预算                                                |
| 多实例公开试用流量                      | 本版无账号级总量控制；用户按控制台配额自行决定上线流量，不通过真实压测验证                                                    |
| 任一九项远端能力不兼容                  | 该能力 fail closed；当前版本不发布地图能力，先修订 canonical spec                                                             |

## Repository Checks (implementation phase)

本次已经执行地图定向 Vitest、local persistence、应用 adapter 的真实 Key smoke、`pnpm typecheck`、`pnpm build`、稳定回归和 `git diff --check`；具体命令与结果在 [acceptance.md](./acceptance.md)。真实 Key smoke 不进 CI，也不把 Key 放入 GitHub Actions。后续复验仍应运行相关 Vitest、`pnpm typecheck`、`pnpm lint:webapp`、`pnpm build` 与 `git diff --check`；浏览器人工 smoke 不属于本版发布门。
