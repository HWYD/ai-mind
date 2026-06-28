## Summary / 摘要

请简要说明本 PR 完成了什么。

## Change Level / 变更等级

- [ ] Level A：Small Change
- [ ] Level B：Module Change
- [ ] Level C：Cross-boundary Change
- [ ] Level D：Architecture Change

## Related Spec / 关联规格

- Spec：
- Plan：
- Tasks：
- ADR：

## Spec Kit Gates / Spec Kit 闸门

仅 Level C / Level D 必填；Level A / Level B 可填写 N/A。

- [ ] clarify gate 已执行，或已完成人工等价澄清：
- [ ] checklist gate 已执行，或已完成人工等价质量清单：
- [ ] analyze gate 已执行，或已完成人工等价一致性分析：
- 采用方式：Codex skills `$speckit-*` / slash command `/speckit.*` / 人工等价 / N/A
- [ ] 如果未执行，原因和风险已说明：

## Scope / 范围

- 本次修改范围：
- 主要影响路径：

## Non-goals / 非目标

- 本 PR 明确不做：

## Constitution Check / Constitution 检查

- [ ] 未破坏 Controlled Agent 边界。
- [ ] 未绕过 GraphState source of truth。
- [ ] 未在 review node 中引入副作用。
- [ ] 未混淆 AgentRun 业务状态和 LangGraph checkpoint。
- [ ] 未破坏 stream-core 向后兼容。
- [ ] 未泄露 raw GraphState / checkpoint / error / API Key / session。
- [ ] 未新增无复用价值 helper / mapper / util。

## Spec Drift Check / 规格漂移检查

- [ ] API contract 已同步，或确认不受影响。
- [ ] stream protocol 已同步，或确认不受影响。
- [ ] GraphState 文档已同步，或确认不受影响。
- [ ] Prisma schema / migration 文档已同步，或确认不受影响。
- [ ] AgentRun 状态机文档已同步，或确认不受影响。
- [ ] ADR 已新增 / 更新，或确认不需要。
- [ ] docs/versions 已同步，或确认不需要。
- [ ] README 已评估，或确认不需要。

## Verification / 验证

- [ ] targeted tests：
- [ ] typecheck：
- [ ] lint：
- [ ] build：
- [ ] stream-core tests：
- [ ] database generate / validate：
- [ ] migration integration test：
- [ ] browser smoke：
- [ ] `git diff --check`：

## Notes / 备注

- 已知风险 / 后续补验：
