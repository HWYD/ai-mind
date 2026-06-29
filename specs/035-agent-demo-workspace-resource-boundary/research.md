# Research 035：Agent Demo Workspace Resource Boundary

状态：已收口
版本：v0.3.5
日期：2026-06-29

## R035-01：public Agent demo resource root

**Decision**：public Agent demo 的唯一程序可读文件资源根目录为 `examples/agent-demo/`。

**Rationale**：

- 公开 demo 输入需要可展示、可裁剪、可测试。
- 真实 `docs/`、`specs/`、`apps/`、`packages/` 同时承担项目事实、源码和治理职责，不应作为 public Agent 读取空间。
- 后续 `/plan`、`/task`、`/review`、`/delivery-chain` 可以复用同一个 demo boundary。

**Alternatives considered**：

- 继续读取 `docs/versions/`：实现最小，但保留旧边界风险。
- 新增 `docs/demo/`：仍在 `docs/` 下，语义容易继续混淆。
- 使用 `private-folder/`：不适合作为 public demo 输入。

## R035-02：resource scheme

**Decision**：新增 `@demo://`，不保留 `@docs://` fallback。

**Rationale**：

- `@demo://` 明确表示 public demo resource。
- fail closed 可以强制调用方和测试更新，避免旧入口静默继续生效。
- `@docs://` / `docs://` 不再承担 public Agent resource 语义。

**Alternatives considered**：

- `demo://`：少了 composer inline resource 的 `@` 语义，和现有用户输入习惯不一致。
- `@docs://demo/...`：仍保留 docs scheme，无法形成清晰边界。
- 兼容 `@docs://`：迁移平滑但边界不干净。

## R035-03：manifest role

**Decision**：`demo-manifest.json` 用于 UI 展示、picker 候选和 corpus 完整性测试；resolver 安全边界必须独立完成。

**Rationale**：

- manifest 适合描述 public demo 可用资源。
- resolver 需要对所有 URI 做 fail-closed 安全检查，不能把 manifest 当唯一 ACL。
- 测试可以通过 manifest 确认列出的资源存在且不含未来版本。

**Alternatives considered**：

- runtime 自由扫描 `examples/agent-demo/`：简单但会让后续新文件自动暴露。
- resolver 只允许 manifest 白名单：安全但对后续场景和手动 URI 测试不够灵活。

## R035-04：version-plans corpus

**Decision**：version-plans 采用瘦 corpus：

```text
v020-controlled-agent-graph.md
v030-hitl-checkpoint-resume.md
v034-langsmith-observability.md
test-missing-non-goals.md
test-over-scoped-runtime-change.md
```

**Rationale**：

- demo version plans 是 Agent 输入，不是完整历史归档。
- `v020`、`v030`、`v034` 覆盖 Graph、HITL checkpoint resume、LangSmith observability 三类代表性输入。
- `v031-v033` 是治理 / tooling 过程型版本，对 Tasklist Agent demo 输入差异不大。
- 两个 test version 覆盖 readiness / warning 边界。

**Alternatives considered**：

- 放入 v031-v034 全部版本：更完整但 picker 重复、噪音大。
- 只保留 v034：最简但不能覆盖 HITL 和 Graph 演进语境。

## R035-05：`v030-hitl-checkpoint-resume.md` 文件名

**Decision**：文件名不写 `tasklist`，使用 `v030-hitl-checkpoint-resume.md`。

**Rationale**：

- `version-plans/` 中的文件是版本方案输入，不是生成出来的 tasklist artifact。
- 文件名里写 `tasklist` 容易与 `docs/tasklists/` 或 tasklist draft 混淆。
- 正文标题仍可说明原版本名包含 Tasklist Agent。

**Alternatives considered**：

- `v030-tasklist-hitl-checkpoint-resume.md`：语义完整但易误解 artifact 类型。
- `v030-agent-hitl-resume.md`：短，但少了 checkpoint 关键信息。

## R035-06：mobile UX polish scope

**Decision**：移动端 polish 只调整小屏响应式尺寸，不做整体 UI 重构。

**Rationale**：

- public demo 入口在小屏上确实需要更紧凑。
- 本版本核心是 resource boundary，不应扩大成 composer redesign。
- 只使用断点 class 可以降低桌面回归风险。

**Alternatives considered**：

- 重构 composer toolbar：收益不属于 v0.3.5 主目标。
- 不做移动端 polish：边界更纯，但 demo 可用性问题会继续存在。
