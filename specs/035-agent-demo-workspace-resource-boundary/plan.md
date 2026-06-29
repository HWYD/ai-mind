# Plan 035：Agent Demo Workspace Resource Boundary

状态：已收口
版本：v0.3.5
日期：2026-06-29
Spec：[spec.md](./spec.md)

## Summary

v0.3.5 将 public Agent demo 的资源读取从真实 `docs/versions/*.md` 收口到 `examples/agent-demo/`，新增 `@demo://` resolver，并迁移 Tasklist Agent public demo 入口到 `/tasklist + @demo://version-plans/*.md`。

推荐技术路线：

- 新增 demo workspace 和 manifest。
- 新增 demo resource resolver，作为 public Agent resource 的安全边界。
- 将 Tasklist Agent route / invocation / version plan reader 从 `docs://versions` 切到 `@demo://version-plans`。
- 让 `@` picker 只展示 manifest 或 `version-plans/` 目录中的版本方案输入。
- 添加 Tasklist Agent 快速访问示例。
- 小屏移动端只做 composer / model selector / popup 样式收紧。
- 不修改 Graph topology、HITL contract、stream protocol、frontend reducer 数据结构、Prisma schema、PostgresSaver schema 或 LangSmith observer 语义。

## Technical Context

**Language / Runtime**：TypeScript，Next.js App Router，Node.js server runtime。

**Primary Dependencies**：

- 复用当前 Node `fs/promises`、`path`、Next route 和 Vitest。
- 不新增 runtime dependency。
- 不新增 database dependency。

**Storage**：不新增持久化；demo workspace 是仓库内静态示例文件，不写入数据库。

**Testing**：Vitest，现有重点测试位于：

- `apps/webapp/tests/lib/ai/model-provider/resolve-route-type.test.ts`
- `apps/webapp/tests/lib/ai/runtime/chat-orchestrator.test.ts`
- `apps/webapp/tests/lib/ai/runtime/version-plan-tasklist-agent-*.test.ts`
- `apps/webapp/tests/components/...`

**Target Platform**：webapp server runtime + public demo UI。

**Performance Goal**：

- 单文件读取限制在 128 KiB 内。
- `@` picker 使用 manifest 或受控目录列表，不扫描真实仓库目录。
- 小屏 UI polish 不增加 runtime 或 stream 开销。

**Constraints**：

- 不读取真实 `docs/`、`specs/`、`apps/`、`packages/`、`private-folder/` 作为 public Agent resource。
- 不保留 `@docs://` fallback。
- 不修改 Graph / HITL / DB / stream / reducer。
- 不引入未来 Delivery Chain runtime。
- 不把 v0.3.5 / v0.3.6 放入 demo version plans。

## Constitution Check

### Controlled Agent First

通过。

本版本正是在收紧 Agent resource boundary。Tasklist Agent 不得自由扫描目录，不得读取真实项目源码或 specs，只读取用户显式引用的 `@demo://version-plans/*.md`。

### GraphState Is Runtime Source of Truth

通过。

本版本不修改 GraphState，不向 GraphState 放入 file handle、manifest、resolver internals、raw path 或真实文件系统路径。

### Review Node Must Be Side-effect Free

通过。

review node 不读 demo resource，不调用 resolver，不写文件。资源读取仍在既有 read-version-plan / optional-context 节点对应的 runtime 边界完成。

### Business State and Checkpoint Must Stay Separate

通过。

不修改 AgentRun / AgentInterrupt，不修改 PostgresSaver checkpoint。`versionPlanUri` 只换成 `@demo://...` 值，不改变业务状态职责。

### Stream Compatibility Is a Hard Constraint

通过。

不新增 stream chunk，不修改 stream schema，不修改 reducer。

### Public DTO Must Be Strict and Safe

通过，但实现时重点验证。

resource error 只能输出脱敏错误提示，不输出真实绝对路径、内部 root、raw Error 或敏感目录内容。

### Minimal Abstraction

通过。

允许新增 demo resolver，因为它承载明确安全边界、path normalization、root boundary check 和测试价值。避免为每个目录新增无复用价值的 helper 链。

### Tests Before Broad Integration

通过。

先测 resolver / manifest / route / invocation，再接 reader 和前端 picker，最后做 UI polish 和 docs。

### Spec Drift Must Be Blocked

通过。

如果实现中发现必须修改 GraphState、stream、DB schema、HITL contract 或 LangSmith 语义，必须暂停并更新 spec，而不是顺手扩大范围。

### Official Spec Kit Skills Are Tooling Entry, Not Source of Truth

通过。

本 plan 使用 official full skills 的人工等价流程产出规格资产，真实事实仍以 specs / ADR / code / tests 为准。

## Current Code Baseline

真实代码当前状态：

- Tasklist Agent route 判断在 `apps/webapp/lib/ai/model-provider/resolve-route-type.ts` 中识别 `docs://versions/*.md`。
- Tasklist Agent invocation resolver 在 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/index.ts` 中识别 `docs://versions/*.md`。
- version plan reader 在 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/resources/version-plan-reader.ts` 中通过 `projectDocsResourceAdapter` 读取 docs resource。
- optional context reader 当前仍可读取 `docs://README.md` / `docs://architecture/*.md` 和 `project://latest-context`。
- docs catalog route 在 `apps/webapp/app/api/ai/resources/docs-catalog/route.ts` 中扫描真实 `docs/`、`docs/versions` 和 `docs/architecture`。
- composer resource menu 从 `/api/ai/resources/docs-catalog` 拉取 options，并把本地资源标记为“本地”。
- quick access 当前仍包含真实 docs 引用示例。
- composer / toolbar / slash popup 已有移动端 popup 定位逻辑，但尺寸仍偏桌面密度。

## Target Architecture

```text
examples/agent-demo/
  -> demo-manifest.json
  -> version-plans/*.md
  -> scenarios/*/*.md
  -> rubrics/*.md
  -> governance/*.md

@ picker
  -> demo resource catalog route
  -> demo manifest / demo version plans
  -> @demo://version-plans/*.md

chat route
  -> resolveRouteType
       -> /tasklist + @demo://version-plans/*.md => tasklist

chat-orchestrator
  -> resolveVersionPlanTasklistAgentInvocation
       -> ready only for @demo://version-plans/*.md
       -> missing / invalid => boundary message

Tasklist Agent readVersionPlan
  -> demo resource resolver
       -> normalize path
       -> root boundary check
       -> extension / size limit
       -> read content
```

旧 `docs://` adapter 可以继续服务非 Agent docs reader 场景，前提是它不再作为 public Agent resource 或 `@` picker 数据源。若实现中发现普通 docs reader 已不再需要，可另行评估移除，但不得在本版本顺手扩大。

## Demo Resolver Design

URI 规则：

```text
@demo://version-plans/<file>.md
@demo://scenarios/<id>/requirement.md
@demo://scenarios/<id>/context.md
@demo://scenarios/<id>/plan.sample.md
@demo://scenarios/<id>/tasks.sample.md
@demo://scenarios/<id>/review.expected.md
@demo://rubrics/<file>.md
@demo://governance/<file>.md
```

实现要求：

- strip `@demo://` 后必须得到非空 relative path。
- 禁止 `path.isAbsolute(value)`。
- 禁止 `\`、`\0`、冒号、空 segment、`..` segment。
- 使用 POSIX normalize 处理 URI path。
- 使用平台 path resolve 到 `examples/agent-demo/` 下。
- 通过 `path.relative(root, finalPath)` 验证未越界。
- 使用 `lstat` 拒绝目录和 symlink。
- `.md` 用于 Agent 内容读取。
- `demo-manifest.json` 仅用于 manifest 读取。
- 默认单文件大小上限 128 KiB。
- preview chars 继续维持 3000 左右，content chars 继续维持 12000 左右。

## Recommended File Changes

### Demo corpus

- `examples/agent-demo/README.md`
- `examples/agent-demo/demo-manifest.json`
- `examples/agent-demo/version-plans/v020-controlled-agent-graph.md`
- `examples/agent-demo/version-plans/v030-hitl-checkpoint-resume.md`
- `examples/agent-demo/version-plans/v034-langsmith-observability.md`
- `examples/agent-demo/version-plans/test-missing-non-goals.md`
- `examples/agent-demo/version-plans/test-over-scoped-runtime-change.md`
- `examples/agent-demo/scenarios/**`
- `examples/agent-demo/rubrics/**`
- `examples/agent-demo/governance/**`

### Resolver / catalog

- 新增或替换 `apps/webapp/lib/ai/mcp/adapters/demo-resource-*` 或同层 resource adapter。
- 新增或替换 `/api/ai/resources/...` catalog route，使 `@` picker 只拿 demo version plans。
- 保留旧 docs adapter 仅供非 Agent 场景时，必须确保 Tasklist Agent 和 picker 不再引用它。

### Tasklist Agent entry

- `apps/webapp/lib/ai/model-provider/resolve-route-type.ts`
- `apps/webapp/lib/ai/runtime/chat-orchestrator.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/index.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/resources/version-plan-reader.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/resources/optional-context-reader.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/contract/types.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/planner/planning-decision.ts`
- `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/tasklist/tasklist-draft-generator.ts`
- 相关 tests 和 fixtures。

### Frontend

- `apps/webapp/components/chat/composer/menu/composer-resource-options.ts`
- `apps/webapp/components/chat/composer/menu/composer-resource-menu.tsx`
- `apps/webapp/components/chat/composer/menu/composer-command-menu.tsx`
- `apps/webapp/components/chat/composer/chat-composer.tsx`
- `apps/webapp/components/chat/composer/editor/composer-editor.tsx`
- `apps/webapp/components/chat/composer/toolbar/composer-toolbar.tsx`
- `apps/webapp/components/chat/message-list/suggestions/empty-state-suggestion-options.ts`

### Docs / tests

- README 示例和能力说明。
- `docs/adr/0009-public-agent-demo-resource-boundary.md`
- `docs/adr/README.md`
- `specs/README.md`
- focused tests 覆盖 resolver、route、agent invocation、picker、quick access、mobile polish。

## Implementation Phases

### P0：Spec / ADR / Gate 准备

完成 `specs/035...` 规格资产、ADR-0009、实施前 analyze gate。

### P1：Demo Workspace / Manifest

新增 demo corpus、manifest 和 corpus completeness tests。此阶段不接入 runtime。

### P2：Demo Resource Resolver

新增 `@demo://` resolver 和 security tests，覆盖 normalize、root boundary、extension、size、symlink / directory、forbidden scheme。

### P3：Tasklist Agent Entry Migration

迁移 route type、invocation resolver、version plan reader、optional context 白名单和相关 prompt / error 文案。

### P4：Frontend Picker / Quick Access

将 `@` picker 数据源收口为 demo version plans；新增 Tasklist Agent 快速访问；本地标签改为 “Demo” 或 “示例”。

### P5：Mobile UX Polish

只在小屏调整 composer、model selector、slash/resource popup 密度；桌面端恢复原有尺寸。

### P6：Docs / Regression

同步 README、测试、typecheck、lint、`git diff --check`，人工检查未改 Graph / HITL / stream / reducer / schema。

### P7：Converge / Release Assets

实现完成后执行 converge 或人工等价收口，再同步 `docs/versions/`、`docs/releases/`、`docs/tasklists/` 和 package version。

## Risks

### 旧 `docs://` 路径残留

风险：route、prompt、tests、README 中仍有 `docs://versions/*.md`，造成双入口。

规避：

- `rg "docs://versions|@docs://"` 做实施后检查。
- 对 Tasklist Agent invalid docs scheme 增加 fail closed 测试。

### resolver 只依赖 manifest

风险：manifest 漏配或被误改时成为安全边界。

规避：

- manifest 只做展示和测试清单。
- resolver 独立做 root boundary check。

### optional context 仍读取真实 docs

风险：虽然 version plan 迁移了，但 planning decision 还能读真实 docs。

规避：

- optional context 白名单迁移到 `@demo://governance` / `@demo://rubrics` 或本版临时禁用本地 optional docs。
- tests 覆盖不读取真实 docs。

### 小屏 polish 扩大成 UI 重构

风险：移动端样式调整误伤桌面布局或组件结构。

规避：

- 只改响应式 class。
- 不改 reducer。
- 不改 composer serialization。
- 做桌面和小屏 smoke / tests。

### 普通 docs reader 语义混淆

风险：`@docs://` 同时被理解为普通 docs reader 和 public Agent resource。

规避：

- 本版本 spec 只承诺 public Agent resource 不读真实 docs。
- 如果保留普通 docs summary，必须确保它不通过 public Agent picker 暴露成 Tasklist Agent 输入。

## Out-of-scope Validation

因为本版本不改 DB / stream / HITL contract，以下不是最小实施验收：

- database migration integration test。
- stream-core protocol migration test。
- HITL schema migration test。
- PostgresSaver checkpoint schema test。

但必须执行 resolver / Tasklist Agent route / reader / picker / quick access / mobile polish focused tests，以及 typecheck、lint、`git diff --check`。
