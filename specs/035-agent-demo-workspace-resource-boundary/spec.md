# Spec 035：Agent Demo Workspace Resource Boundary

状态：已收口
版本：v0.3.5
日期：2026-06-29
Change Level：Level C（Cross-boundary Resource Boundary）

## 摘要

v0.3.5 建立 AI Mind public Agent demo 的资源边界：

```text
examples/agent-demo/
```

成为公开 demo 中唯一允许程序读取的 Agent resource root。

本版本将 Tasklist Agent public demo 入口从 `/tasklist + @docs://versions/*.md` 迁移为：

```text
/tasklist + @demo://version-plans/*.md
```

同时移除程序层 `@docs://` / `docs://versions/*.md` 作为 public Agent resource 的能力，新增 `@demo://` scheme，并让 `@` resource picker 只展示 demo version plan 输入。

本版本不是 Delivery Chain runtime 版本，不实现 `/plan`、`/task`、`/review`、`/delivery-chain`，也不新增 artifact handoff 或真实 artifact persistence。

## 背景

v0.3.4 已完成 Tasklist Agent HITL checkpoint resume 链路的 LangSmith observability。当前公开 demo 仍围绕 `/tasklist + @docs://versions/*.md` 展示 Tasklist Agent，这让 public demo 的 Agent resource 直接指向真实 `docs/versions/`。

随着后续可能规划 `/plan`、`/task`、`/review`、`/delivery-chain`，继续让公开 Agent runtime 读取真实 `docs/`、`specs/`、`apps/` 或 `packages/` 会让 demo 边界变模糊：

- demo 输入和项目真实文档混在一起。
- resource picker 容易展示真实仓库资料。
- 后续 Agent 扩展容易误把真实项目目录当成可读工作区。
- `@docs://` 的语义会在“普通文档读取”和“公开 Agent resource”之间漂移。

v0.3.5 先收紧 public Agent resource root，确保公开 demo 只消费可展示、可审计、可裁剪的样例 corpus。

## Clarifications

### Session 2026-06-29

- Q：`examples/agent-demo/version-plans/` 是否需要放入 v031-v034 全部版本？ -> A：不需要完整归档，保持瘦 corpus。
- Q：`v030-tasklist-hitl-checkpoint-resume.md` 文件名是否容易和 tasklist artifact 混淆？ -> A：改为 `v030-hitl-checkpoint-resume.md`，正文标题仍说明 Tasklist Agent。

## 目标

- 新增 `examples/agent-demo/`，作为 public Agent demo 的唯一资源根目录。
- 新增 `@demo://` scheme，严格映射到 `examples/agent-demo/`。
- 移除 `@docs://` / `docs://versions/*.md` 作为 Tasklist Agent public demo 输入的能力。
- 公开 Agent 文件资源只允许读取 demo root 下的 `.md` / manifest `.json`。
- `/tasklist` public demo 入口迁移为 `/tasklist + @demo://version-plans/*.md`。
- `@` resource picker 只展示 `examples/agent-demo/version-plans/` 下的 demo 版本方案输入文件。
- 快速访问新增 Tasklist Agent demo 示例，默认使用 `@demo://version-plans/v034-langsmith-observability.md`。
- 小屏移动端优化 ChatComposer、模型选择器、slash/resource popup 的尺寸和间距。
- 保持 Tasklist Agent Graph topology、HITL contract、checkpoint resume、AgentRun / AgentInterrupt、stream protocol、frontend reducer、Prisma schema、PostgresSaver schema 和 v0.3.4 LangSmith observer 语义不变。

## 非目标

v0.3.5 不做：

- 不新增 ControlledDeliveryChainAgent。
- 不实现 `/plan`。
- 不实现 `/task`。
- 不实现 `/review`。
- 不实现 `/delivery-chain`。
- 不实现 `@artifact://`。
- 不做 artifact handoff。
- 不新增真实 artifact persistence。
- 不新增 HITL。
- 不修改 Tasklist Agent HITL 流程。
- 不修改 Tasklist Agent Graph topology。
- 不修改 HITL decision schema。
- 不修改 stream protocol。
- 不修改 frontend reducer 数据结构。
- 不修改 Prisma schema。
- 不修改 PostgresSaver schema。
- 不修改 v0.3.4 LangSmith observer 语义。
- 不读取真实 `docs/`、`specs/`、`apps/`、`packages/`、`private-folder/` 作为 public Agent resource。
- 不在 `examples/agent-demo/` 中放真实源码。
- 不做源码级 code review。
- 不实现后续 Delivery Chain runtime。
- 不把未来版本文档放进 `examples/agent-demo/version-plans/` 当作可运行 demo 输入。
- 不保留 `@docs://` 到 `@demo://` 的兼容 fallback。
- 不做整体 UI 重构。

## 用户故事

### US1：公开 demo 用户选择受控 demo version plan（P1）

作为公开 demo 用户，我希望 `@` picker 只展示少量可运行的 demo version plan，这样我可以用明确、安全的样例输入触发 Tasklist Agent，而不会误读真实项目文档目录。

独立验收：

- `@` picker 只列出 `@demo://version-plans/*.md`。
- 默认快速访问填入 `/tasklist + @demo://version-plans/v034-langsmith-observability.md`。
- picker 不展示真实 `docs/versions/`、`docs/README.md` 或 `docs/architecture/*.md`。

### US2：Tasklist Agent 只读取 demo root（P1）

作为维护者，我希望 Tasklist Agent public demo 只能读取 `examples/agent-demo/` 下的资源，这样 demo 不会越界读取真实项目目录或敏感草稿。

独立验收：

- `/tasklist + @demo://version-plans/v034-langsmith-observability.md` 能进入 Tasklist Agent。
- `/tasklist + @docs://versions/*.md` 不再进入 Tasklist Agent，并返回清晰边界提示。
- path traversal、绝对路径、未知 scheme、`file://`、`@specs://` 均被拒绝。

### US3：维护者维护 demo corpus（P1）

作为维护者，我希望 demo corpus 小而有代表性，这样后续 demo、测试和文档不会变成另一套完整历史归档。

独立验收：

- `version-plans/` 只包含：
    - `v020-controlled-agent-graph.md`
    - `v030-hitl-checkpoint-resume.md`
    - `v034-langsmith-observability.md`
    - `test-missing-non-goals.md`
    - `test-over-scoped-runtime-change.md`
- `version-plans/` 不包含 v0.3.5、v0.3.6 或未来版本。
- `demo-manifest.json` 列出可展示的 `versionPlans` 和 scenarios，避免运行时自由扫描真实仓库目录。

### US4：小屏用户可正常使用 public demo 入口（P2）

作为小屏移动端用户，我希望 composer、模型选择器和 slash/resource popup 更紧凑，这样 Tasklist Agent demo 入口不会被输入框或模型选择器挤压。

独立验收：

- 小屏 textarea 初始高度为一行，多行输入仍可自动增高。
- 小屏模型选择器字体和内边距更小，不挤压发送按钮。
- 小屏 slash/resource popup 标题不超过 14px，描述更小，item padding 更紧凑。
- 桌面端样式和交互不受影响。

### US5：reviewer 验证边界未突破既有 runtime contract（P1）

作为 reviewer，我希望 v0.3.5 的所有变化都停留在 resource boundary、入口识别、demo corpus 和小屏 UI polish，不影响 v0.3.0-v0.3.4 的核心 runtime contract。

独立验收：

- Graph topology 未修改。
- HITL decision contract 未修改。
- checkpoint resume 未修改。
- AgentRun / AgentInterrupt schema 未修改。
- stream protocol 未修改。
- frontend reducer 数据结构未修改。
- Prisma schema / PostgresSaver schema 未修改。
- LangSmith observer 语义未修改。

## 功能性要求

- `FR-035-01`：系统必须新增 `examples/agent-demo/` 作为 public Agent demo 的唯一程序可读资源根目录。
- `FR-035-02`：`examples/agent-demo/version-plans/` 必须只包含 `v020-controlled-agent-graph.md`、`v030-hitl-checkpoint-resume.md`、`v034-langsmith-observability.md`、`test-missing-non-goals.md`、`test-over-scoped-runtime-change.md`。
- `FR-035-03`：`examples/agent-demo/version-plans/` 不得包含 v0.3.5、v0.3.6 或其他未来 / 未完成版本。
- `FR-035-04`：系统必须新增 `examples/agent-demo/demo-manifest.json`，列出 public demo 可用 `versionPlans` 和 scenarios。
- `FR-035-05`：系统必须新增 `@demo://` scheme，并将其严格映射到 `examples/agent-demo/`。
- `FR-035-06`：resolver 必须 normalize path，并验证最终路径仍在 `examples/agent-demo/` 下。
- `FR-035-07`：resolver 必须拒绝 `../`、绝对路径、反斜杠路径、空路径、未知 scheme、`file://`、`@specs://`、`@docs://` 和 `docs://`。
- `FR-035-08`：resolver 必须限制允许的文件类型；Agent 内容读取只允许 `.md`，manifest 读取只允许 `demo-manifest.json`。
- `FR-035-09`：resolver 必须限制单文件大小，默认上限为 128 KiB，内容注入和 preview 继续使用受控字符上限。
- `FR-035-10`：Tasklist Agent 入口识别必须从 `docs://versions/*.md` 迁移到 `@demo://version-plans/*.md`。
- `FR-035-11`：用户输入 `/tasklist` 但未引用 `@demo://version-plans/*.md` 时，系统必须 fail closed，并提示从 `@` picker 选择 demo 版本方案输入。
- `FR-035-12`：`versionPlanUri` 字段名可以继续保留，但值必须是 `@demo://version-plans/*.md`。
- `FR-035-13`：Tasklist Agent version plan reader 必须读取 `@demo://version-plans/*.md`，不得读取真实 `docs/versions/*.md`。
- `FR-035-14`：Tasklist Agent optional context 若保留文件读取，必须迁移到 `@demo://governance/*.md` 或 `@demo://rubrics/*.md`；不得读取真实 `docs/`。
- `FR-035-15`：`@` resource picker 必须只展示 `examples/agent-demo/version-plans/` 下的 demo 版本方案输入文件。
- `FR-035-16`：快速访问必须新增 Tasklist Agent demo，默认使用 `/tasklist + @demo://version-plans/v034-langsmith-observability.md`。
- `FR-035-17`：小屏 ChatComposer textarea 初始高度必须压缩为一行，多行输入仍能自动增高。
- `FR-035-18`：小屏模型选择器必须缩小字体和内边距，并避免挤压发送按钮。
- `FR-035-19`：小屏 slash/resource popup 标题字体不得超过 14px，描述字体更小，item padding 更紧凑。
- `FR-035-20`：桌面端 composer、模型选择器和 popup 样式不得因本版本 polish 出现布局回归。
- `FR-035-21`：本版本不得修改 Graph topology、HITL decision schema、stream protocol、frontend reducer 数据结构、Prisma schema 或 PostgresSaver schema。
- `FR-035-22`：v0.3.4 LangSmith observer 必须继续使用相同 lifecycle metadata 语义，`versionPlanUri` 仅发生 scheme/value 变化。
- `FR-035-23`：测试、README、示例命令和错误提示必须更新为 `@demo://`。

## Key Entities / Contracts

本版本不新增数据库实体。

本版本新增或调整以下非持久化 contract：

- `DemoResourceRoot`：`examples/agent-demo/`，public Agent demo 唯一资源根。
- `DemoResourceUri`：`@demo://<relative-path>`，只允许映射到 demo root 内。
- `DemoManifest`：列出 public demo version plans 和 scenarios 的 JSON 清单。
- `DemoVersionResource`：`@demo://version-plans/*.md`，可作为 Tasklist Agent version plan 输入。
- `DemoScenarioResource`：`@demo://scenarios/*/{requirement,context,plan.sample,tasks.sample,review.expected}.md`，预留给后续 Delivery Chain demo。
- `DemoRubricResource`：`@demo://rubrics/*.md`，预留给后续 plan/task/review rubric。
- `DemoGovernanceResource`：`@demo://governance/*.md`，用于 demo 级治理约束，不指向真实项目源码或 specs。

## Demo Workspace 结构

```text
examples/agent-demo/
  README.md
  demo-manifest.json

  version-plans/
    v020-controlled-agent-graph.md
    v030-hitl-checkpoint-resume.md
    v034-langsmith-observability.md
    test-missing-non-goals.md
    test-over-scoped-runtime-change.md

  scenarios/
    request-limit-banner/
      requirement.md
      context.md
      plan.sample.md
      tasks.sample.md
      review.expected.md
    langsmith-safe-mode/
      requirement.md
      context.md
      plan.sample.md
      tasks.sample.md
      review.expected.md
    delivery-chain-resource-boundary/
      requirement.md
      context.md
      plan.sample.md
      tasks.sample.md
      review.expected.md

  rubrics/
    plan-rubric.md
    task-rubric.md
    review-rubric.md

  governance/
    delivery-boundaries.md
    engineering-rules.md
```

## Edge Cases

- 用户输入 `@docs://versions/*.md`：返回 public demo 已收口到 `@demo://` 的边界提示。
- 用户输入 `docs://versions/*.md`：拒绝，并提示使用 `@demo://version-plans/*.md`。
- 用户输入 `@demo://version-plans/../governance/engineering-rules.md`：拒绝 path traversal。
- 用户输入 `@demo://../../apps/webapp/package.json`：拒绝 root escape。
- 用户输入 Windows 绝对路径或 `C:\...`：拒绝绝对路径 / 反斜杠。
- 用户输入 `file://...`、`@specs://...`、`@artifact://...`：拒绝未知或非本版本 scheme。
- demo 版本方案输入文件超过大小上限：拒绝读取，并返回可理解错误。
- demo manifest 列出不存在文件：manifest / corpus 测试失败。
- `@` picker 请求失败：前端降级为空候选，不展示真实 docs fallback。
- 小屏模型名过长：选择器必须 truncate，不挤压发送按钮。
- LangSmith enabled 场景：`versionPlanUri=@demo://...` 仍按 v0.3.4 metadata 白名单上传，不上传完整正文。

## 成功标准

v0.3.5 完成后，项目应该能回答：

- public demo Agent 能读哪些资源？
- 为什么 `docs/`、`specs/`、`apps/`、`packages/`、`private-folder/` 不再是 public Agent resource？
- `@demo://` 如何映射到 `examples/agent-demo/`？
- `@docs://` / `docs://` 输入为什么会被拒绝？
- `/tasklist + @demo://version-plans/*.md` 为什么不需要修改 Graph topology 或 HITL contract？
- `@` picker 为什么只展示 demo version plans？
- demo version plans 为什么保持瘦 corpus，而不是完整历史归档？
- 小屏 UX polish 为什么不影响桌面端和前端 reducer？

## 假设

- public demo 的 `@` picker 不再承担普通 docs summary 的真实项目文档选择职责。
- 如果普通 `/summary + @docs://...` 仍需保留，应另行定义非 Agent docs reader 边界；v0.3.5 只保证 public Agent resource 不再读取真实 docs。
- `@demo://` 是 public demo Agent resource scheme，不代表未来所有本地文件能力。
- `demo-manifest.json` 可用于 UI 展示和 corpus 完整性测试，但 resolver 安全边界不能只依赖 manifest。
- 后续 `/plan`、`/task`、`/review`、`/delivery-chain` 若实现，必须继续只读取 `@demo://`，但不在 v0.3.5 实现这些命令。
