# ADR-0007：Official Spec Kit Full Skills Default Entry

状态：Accepted
日期：2026-06-28

## 背景

v0.3.1 已经建立 AI Mind 的 Spec Kit Governance Baseline，包含 constitution、specs、ADR、architecture docs、PR checklist 和 Change Level 分级。

v0.3.2 进一步验证了 Spec Kit CLI + Codex skills dual-track pilot。该版本在当前仓库内新增了三枚 lightweight `speckit-*` skills，用来验证 clarify / checklist / analyze 是否能降低 Codex 执行成本。

pilot 结束后，仓库需要做一次命名空间收口：`speckit-*` 应长期代表 official Spec Kit skills，还是继续代表 AI Mind 本地 lightweight skills。

## 决策

AI Mind 采用 official Spec Kit full skills 作为 Level C / D 变更的默认入口。

`.agents/skills/speckit-*` 命名空间保留给 official generated / vendored skills。

v0.3.2 的 lightweight pilot skills 不再占用 `speckit-*` 正式命名空间。删除前必须审计其内容，并把有价值的 AI Mind 规则迁移到：

- `.specify/memory/constitution.md`
- `.specify/templates/overrides/`
- `specs/`
- `docs/adr/`
- `docs/architecture/`
- `AGENTS.md`

official skills 不直接魔改。AI Mind 项目约束通过 adapter layer 注入。

`speckit-converge` 进入 Level C / D 收口检查。`speckit-taskstoissues` 暂时作为 optional，不进入默认主流程。

Level A / B 不强制使用 full skills。manual fallback 和 slash command 兼容路径长期保留。

## 影响

正向影响：

- `$speckit-*` 的含义更清晰，不再同时指代官方流程和本地 pilot。
- AI Mind 更贴近 official Spec Kit best practice。
- 后续 Level C / D 版本启动成本更低。
- official skills 可升级，AI Mind 规则不必写进官方文件。
- `converge` 能帮助版本收口时检查 spec / plan / tasks / docs / diff 是否一致。

代价：

- 需要维护 official generated baseline 与 AI Mind adapter layer 的边界。
- 需要记录 official source、version 或 release tag。
- 需要迁移并移除旧 lightweight skills，避免规则丢失。
- 需要防止 full skills 被滥用到 Level A / B 小改。

## 备选方案

继续使用 lightweight pilot skills：

- 优点是轻量、贴合 AI Mind。
- 缺点是长期会偏离 official full skills，并让 `speckit-*` 命名空间语义混乱。

直接魔改 official skills：

- 优点是单文件内看起来更直接。
- 缺点是后续官方升级冲突大，也会让 generated baseline 失去可追踪性。

只保留人工等价：

- 优点是没有外部依赖。
- 缺点是复杂版本仍需要大量手写提示词，执行一致性依赖个人经验。

## 后续事项

- 在 `specs/033-spec-kit-full-skills-default-entry/` 记录 v0.3.3 规格、计划、任务、验收和决策。
- 更新 `docs/architecture/spec-kit-tooling.md` 和 `docs/architecture/ai-coding-workflow.md`。
- 更新 `.specify/memory/constitution.md` 和 `AGENTS.md`。
- 引入 official full skills 前，记录 source、version 或 release tag。
- 移除旧 lightweight `speckit-*` skills，或如确需保留项目专属 skill，改名为 `ai-mind-*`。
