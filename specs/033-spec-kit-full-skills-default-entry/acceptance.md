# Acceptance 033：Spec Kit Full Skills Default Entry

状态：已完成
版本：v0.3.3
日期：2026-06-28

## 命名空间验收

- `.agents/skills/speckit-*` 代表 official Spec Kit full skills。
- v0.3.2 lightweight pilot skills 不再占用 `speckit-*` 正式命名空间。
- 如果保留 AI Mind 专属 skill，必须使用 `ai-mind-*` 命名。
- 不存在同时用同名 `speckit-*` 表示 official 和 AI Mind local pilot 的情况。

## official baseline 验收

- official full skills 来源、版本或生成方式已记录。
- official skills 未被直接魔改。
- official generated / vendored baseline 与 AI Mind adapter layer 边界清楚。
- official skills 依赖的 `.specify/scripts`、`.specify/templates`、`.specify/integrations` 和 agent-context extension 已同步保留。
- `speckit-taskstoissues` 如存在，明确为 optional。
- `speckit-converge` 被纳入 Level C / D 收口检查。

## adapter layer 验收

- pilot skills 中有价值的 AI Mind 规则已迁移到 constitution、template overrides、ADR、workflow docs 或 AGENTS。
- `.specify/memory/constitution.md` 说明 official full skills 与 AI Mind 长期原则的关系。
- `docs/architecture/spec-kit-tooling.md` 从 v0.3.2 pilot 更新为 v0.3.3 default entry。
- `docs/architecture/ai-coding-workflow.md` 明确 Level C / D 默认 official full skills，Level A / B 不强制。
- `AGENTS.md` 指向新的事实来源和执行规则。

## 流程验收

- Level A 小改不被强制运行 full skills。
- Level B 默认 mini spec 或现有 spec，不强制 full skills。
- Level C 默认使用 official full skills 或人工等价。
- Level D 默认使用 official full skills + ADR + architecture docs + 人工 review。
- manual fallback 和 slash command 兼容路径仍被保留。

## 安全与边界验收

- 本版本未修改 runtime、Graph、GraphState、Prisma schema、PostgresSaver、stream protocol、API route 或前端 reducer。
- Codex development skills 未被描述为 AI Mind 产品内 Skill Runtime。
- official skills 输出未被描述为唯一事实源。
- skills 不默认读取 `private-folder/` 作为事实源。
- public DTO、GraphState、checkpoint、API Key、session 等安全边界未被放松。

## Tooling 验收

实施完成后需要验证：

- 新 Codex 会话可发现 official `speckit-*` skills。
- `$speckit-specify` 可触发。
- `$speckit-plan` 可触发。
- `$speckit-tasks` 可触发。
- `$speckit-analyze` 可触发。
- `$speckit-converge` 可触发。
- 人工等价 fallback 仍能按照文档执行。

如果当前环境无法完成新会话验证，必须在最终报告中明确为人工补验项。

## Release 验收

- `specs/033...` 五件套完整。
- ADR-0007 已创建并被 ADR README 引用。
- `specs/README.md` 已加入 v0.3.3。
- `README.md` 已更新当前版本和治理入口。
- `docs/versions/`、`docs/releases/`、`docs/tasklists/` 已同步 v0.3.3。
- package version 已按项目惯例更新为 `0.3.3`，或明确说明未更新原因。
- `git diff --check` 通过。

## 验收结论记录

最终收口时需要记录：

- Clarify gate 结论。
- Checklist gate 结论。
- Analyze gate 结论。
- Converge 或人工等价收口结论。
- 哪些验证成功。
- 哪些验证未执行，以及原因。
