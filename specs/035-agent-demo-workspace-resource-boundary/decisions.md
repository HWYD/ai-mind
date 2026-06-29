# 决策 035：Agent Demo Workspace Resource Boundary

状态：已收口
版本：v0.3.5
日期：2026-06-29

## D035-01：v0.3.5 定为 Level C，并新增 ADR

v0.3.5 按 **Level C：Cross-boundary Resource Boundary** 处理。

原因：

- 涉及 Tasklist Agent public demo 入口识别。
- 涉及 resource resolver scheme 和安全边界。
- 涉及前端 `@` picker 数据源。
- 涉及 README、示例命令、错误提示和测试。
- 涉及 public demo 可读资源根目录这一长期边界。

本版本不修改 Graph topology、HITL contract、stream protocol、frontend reducer 数据结构、Prisma schema 或 PostgresSaver schema，因此不升级为 Level D。

但由于这是长期 Agent resource 安全边界，新增 ADR-0009 记录决策。

## D035-02：`examples/agent-demo/` 是 public Agent demo 唯一资源根

公开 demo 中程序可读取的 Agent 文件资源统一收口到：

```text
examples/agent-demo/
```

不再允许 public Agent resource 直接读取真实：

- `docs/`
- `specs/`
- `apps/`
- `packages/`
- `private-folder/`
- `.git/`
- `.env*`
- `node_modules/`

这样做的目的不是删除这些目录的文档价值，而是把“项目真实资料”和“公开 Agent demo 输入”分离。

## D035-03：移除 `@docs://` / `docs://versions` 作为 Tasklist Agent public demo 输入

v0.3.5 不保留 `@docs://` 到 `@demo://` 的兼容 fallback。

如果用户输入 `@docs://` 或 `docs://versions/*.md`，系统必须 fail closed，并提示：

```text
Public demo Agent 资源已收口到 @demo://。请从 @ picker 选择 examples/agent-demo/version-plans/ 下的 demo 版本方案输入文件。
```

原因：

- 兼容 fallback 会让旧边界长期存在。
- 公开 demo 用户看不出资源到底来自真实 docs 还是 demo workspace。
- 后续 Delivery Chain 入口容易继续误用真实项目文档。

## D035-04：新增 `@demo://`，resolver 不只依赖 manifest

`@demo://` 是 public demo Agent resource scheme，严格映射到 `examples/agent-demo/`。

`demo-manifest.json` 用于：

- `@` picker 展示候选。
- corpus 完整性测试。
- 后续 UI / demo 页面解释可用资源。

但 resolver 安全性不能只依赖 manifest。resolver 必须独立执行：

- scheme 校验。
- path normalize。
- root boundary check。
- extension allowlist。
- size limit。
- symlink / directory 拒绝。

原因是 manifest 是展示清单，不应成为唯一安全边界。

## D035-05：version-plans 保持瘦 corpus

`examples/agent-demo/version-plans/` 不做完整历史归档，只保留三个代表性已完成版本和两个测试输入：

```text
v020-controlled-agent-graph.md
v030-hitl-checkpoint-resume.md
v034-langsmith-observability.md
test-missing-non-goals.md
test-over-scoped-runtime-change.md
```

选择理由：

- `v020` 代表 Graph 编排基线。
- `v030` 代表 HITL + checkpoint resume。
- `v034` 代表 LangSmith observability 和 soft fail metadata 边界。
- 两个 test 文件用于验证缺少 non-goals / acceptance、以及 scope 过大时的 manual review 能力。

不放 `v031` / `v032` / `v033` 的原因：

- 它们主要是 Spec Kit governance / tooling 过程型版本。
- 对 Tasklist Agent demo 的输入差异不够大。
- 后续如果需要治理上下文，应放入 `governance/` 或 scenario `context.md`，而不是挤进 version picker。

## D035-06：`v030-hitl-checkpoint-resume.md` 不在文件名里写 `tasklist`

最终文件名使用：

```text
v030-hitl-checkpoint-resume.md
```

正文标题仍可写：

```markdown
# v0.3.0：Tasklist Agent HITL Checkpoint Resume
```

原因：

- 文件名里写 `tasklist` 容易被误解为 tasklist artifact。
- demo `version-plans/` 下的文件都是“版本方案输入”，不是生成出来的任务清单。

## D035-07：保留 `versionPlanUri` 字段名

`versionPlanUri` 字段名继续保留。

它表达的是“版本方案 URI”，不是 `docs://` scheme。v0.3.5 只把值从：

```text
docs://versions/*.md
```

迁移为：

```text
@demo://version-plans/*.md
```

这样可以避免不必要地修改 AgentRun、LangSmith metadata、artifact、trace 和测试中的字段语义。

## D035-08：Tasklist Agent Graph / HITL / checkpoint 不动

v0.3.5 的迁移层次限定为：

- composer references。
- route type / invocation resolution。
- version plan reader resource adapter。
- optional context 白名单。
- picker / quick access。
- 文档和测试。

不触碰：

- graph nodes。
- graph edges。
- HITL review nodes。
- resume contract。
- AgentRun / AgentInterrupt schema。
- stream chunk schema。
- frontend reducer。
- checkpoint provider。

## D035-09：移动端 UX polish 只做小屏样式收紧

本版本允许做小屏 public demo 入口 polish，但必须满足：

- 只影响移动端断点。
- 桌面端恢复原尺寸和密度。
- 不改前端 reducer 数据结构。
- 不重构 composer。
- 不引入新的布局系统。

原因是这个 polish 只是让 public demo 更可用，不应扩大成整体 UI redesign。

## D035-10：ADR-0009 记录 public Agent demo resource boundary

新增 ADR-0009，记录长期约束：

- public Agent demo resource root 是 `examples/agent-demo/`。
- `@demo://` 是唯一 public Agent demo 文件资源 scheme。
- `@docs://` / `docs://` 不再作为 public Agent resource。
- resolver 必须 fail closed。
- 后续 `/plan`、`/task`、`/review`、`/delivery-chain` 也必须遵守 `@demo://` 边界。
