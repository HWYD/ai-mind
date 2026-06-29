# ADR-0009：Public Agent Demo Resource Boundary

状态：Proposed
日期：2026-06-29

## 背景

AI Mind 的 Tasklist Agent public demo 当前使用 `/tasklist + @docs://versions/*.md` 作为入口。这让公开 Agent demo 直接读取真实 `docs/versions/`，而 `docs/` 同时也是项目公开文档区和版本展示区。

随着后续可能规划 `/plan`、`/task`、`/review`、`/delivery-chain`，如果 public Agent demo 继续读取真实 `docs/`、`specs/`、`apps/`、`packages/` 或 `private-folder/`，Agent resource 边界会持续变模糊。

v0.3.5 需要先建立一个公开 demo 的可读资源根，让后续 Agent demo 都在可审计的样例 corpus 内运行。

## 决策

AI Mind public Agent demo 的唯一程序可读文件资源根目录是：

```text
examples/agent-demo/
```

公开 Agent demo 文件资源使用唯一 scheme：

```text
@demo://
```

`@demo://` 严格映射到 `examples/agent-demo/`。resolver 必须执行 path normalize、root boundary check、extension allowlist 和 file size limit。

v0.3.5 起，Tasklist Agent public demo 入口迁移为：

```text
/tasklist + @demo://version-plans/*.md
```

`@docs://` / `docs://versions/*.md` 不再作为 public Agent resource。用户输入旧 scheme 时必须 fail closed，并提示从 `@` picker 选择 demo 版本方案输入。

`examples/agent-demo/version-plans/` 是瘦 demo corpus，不是完整历史归档。v0.3.5 初始只保留：

```text
v020-controlled-agent-graph.md
v030-hitl-checkpoint-resume.md
v034-langsmith-observability.md
test-missing-non-goals.md
test-over-scoped-runtime-change.md
```

后续 `/plan`、`/task`、`/review`、`/delivery-chain` 如果实现，也必须遵守 `@demo://` 边界。

## 影响

正向影响：

- public Agent demo 的资源读取边界清晰。
- demo 输入和真实项目文档 / 源码目录分离。
- `@` picker 可以只展示可运行 demo corpus。
- path traversal、绝对路径、未知 scheme 和真实目录读取可以 fail closed。
- 后续 Delivery Chain demo 有统一资源根。

代价：

- 需要维护一份小型 demo corpus。
- README、示例命令、测试和 prompt 中的旧 `docs://versions` 需要迁移。
- 普通 docs summary 若仍保留，需要和 public Agent resource 明确区分。

明确限制：

- 不读取真实 `docs/`、`specs/`、`apps/`、`packages/`、`private-folder/` 作为 public Agent resource。
- 不保留 `@docs://` fallback。
- 不把 future version 放入 demo version-plans。
- 不在 `examples/agent-demo/` 放真实源码。
- 不修改 Tasklist Agent Graph topology、HITL contract、stream protocol、frontend reducer、Prisma schema 或 PostgresSaver schema。

## 备选方案

继续使用 `@docs://versions/*.md`：

- 优点是改动最少。
- 缺点是 public demo 继续读取真实 docs，后续 Agent 边界仍然混乱。

新增 `docs/demo/`：

- 优点是文档位置直观。
- 缺点是仍在 `docs/` 下，无法彻底区分真实文档和 Agent demo corpus。

使用 manifest 作为唯一 allowlist：

- 优点是严格、可控。
- 缺点是 resolver 安全性过度依赖 manifest 正确性。最终选择 manifest 用于展示和测试，resolver 独立做 root boundary check。

保留 `@docs://` 到 `@demo://` fallback：

- 优点是兼容旧输入。
- 缺点是旧边界不会真正退出，测试和用户心智都会继续混用。

## 后续事项

- 在 `specs/035-agent-demo-workspace-resource-boundary/` 记录 spec、plan、tasks、acceptance、decisions。
- 实现 `examples/agent-demo/` 和 `demo-manifest.json`。
- 实现 `@demo://` resolver 和 security tests。
- 迁移 Tasklist Agent public demo 入口。
- 迁移 `@` picker 和快速访问。
- 同步 README、docs/versions、docs/releases、docs/tasklists 和 package version。
