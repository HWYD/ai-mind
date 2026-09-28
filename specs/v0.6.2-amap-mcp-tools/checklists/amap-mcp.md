# Integration Checklist: v0.6.2 AMap MCP Tools

**Purpose**: 检查需求文字是否充分约束高德 MCP 的权限、位置、结果与发布风险。
**Created**: 2026-09-26
**Feature**: [spec.md](../spec.md)

## Scope and Authorization

- [x] CHK001 是否明确九项只读地图语义和排除的有副作用/隐式定位能力？
- [x] CHK002 是否禁止把 `tools/list` 当作运行时授权与模型工具清单？
- [x] CHK003 是否区分官方概述的能力描述与真实托管端点的名称/schema？
- [x] CHK004 是否限定 Key、endpoint 和 serverId 的归属，不暴露给模型或前端？

## Data and Failure Semantics

- [x] CHK005 是否定义仅用户明确位置或本轮真实 observation 可作位置来源？
- [x] CHK006 是否规定空/歧义/限流/无权限/超时/取消时不得声称成功？
- [x] CHK007 是否将地图字段脱敏限定在 Tool 自有 public Trace/`StreamEvent` 投影，并保持 Memory/快照遵循通用 Tool 规则？
- [x] CHK008 是否明确最终文字可能保留派生地点事实，并列入发布条款核对？

## Compatibility and Operations

- [x] CHK009 是否保留 v0.6.1 General ReAct、原七 Tool、Tool Trace 与 stream 语义？
- [x] CHK010 是否区分工程侧真实连接/Key 脱敏验收与用户负责的账号配额、QPS、计费、条款上线核对？
- [x] CHK012 是否把天气工具诊断和后续替换条件记录为本版非目标？
- [x] CHK011 是否说明文档完成与运行能力完成的状态差异？
- [x] CHK013 是否明确坐标顺序、精度、默认坐标系和非 GCJ-02 的处理？
- [x] CHK014 是否明确跨 Run 位置/POI 授权、与 `web-search` / `read-url` 一致的远程 Tool 重试策略与九项发布门？

## Notes

本清单评审需求表述，14/14 项通过；真实执行结果以 [acceptance.md](../acceptance.md) 为准。
