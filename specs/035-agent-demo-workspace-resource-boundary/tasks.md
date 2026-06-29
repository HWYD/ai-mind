# Tasks 035：Agent Demo Workspace Resource Boundary

状态：已完成
版本：v0.3.5
日期：2026-06-29

> 当前文件是 v0.3.5 的实施任务计划。所有任务已完成，并已通过测试、浏览器 smoke 和人工收口检查。

## Phase 1：Demo Workspace / Corpus

**目标**：先建立 public demo corpus，不接入 runtime。

- [x] T035-001 [P] 创建 `examples/agent-demo/README.md`，说明 demo workspace 是 public Agent demo resource root。
- [x] T035-002 [P] 创建 `examples/agent-demo/demo-manifest.json`，列出 `@demo://`、`versionPlans` 和 scenarios。
- [x] T035-003 [P] 创建 `examples/agent-demo/version-plans/v020-controlled-agent-graph.md`。
- [x] T035-004 [P] 创建 `examples/agent-demo/version-plans/v030-hitl-checkpoint-resume.md`。
- [x] T035-005 [P] 创建 `examples/agent-demo/version-plans/v034-langsmith-observability.md`。
- [x] T035-006 [P] 创建 `examples/agent-demo/version-plans/test-missing-non-goals.md`。
- [x] T035-007 [P] 创建 `examples/agent-demo/version-plans/test-over-scoped-runtime-change.md`。
- [x] T035-008 [P] 创建 `examples/agent-demo/scenarios/request-limit-banner/` 五个样例文件。
- [x] T035-009 [P] 创建 `examples/agent-demo/scenarios/langsmith-safe-mode/` 五个样例文件。
- [x] T035-010 [P] 创建 `examples/agent-demo/scenarios/delivery-chain-resource-boundary/` 五个样例文件。
- [x] T035-011 [P] 创建 `examples/agent-demo/rubrics/plan-rubric.md`、`task-rubric.md`、`review-rubric.md`。
- [x] T035-012 [P] 创建 `examples/agent-demo/governance/delivery-boundaries.md` 和 `engineering-rules.md`。
- [x] T035-013 增加 demo manifest / corpus 完整性测试，确认 manifest 文件存在、`versionPlans` 不含 v0.3.5 / v0.3.6 / future version。

**Checkpoint**：demo corpus 可被测试验证，但 runtime 仍未读取它。

## Phase 2：Demo Resource Resolver

**目标**：建立 `@demo://` 安全读取边界。

- [x] T035-014 新增 demo resource shared constants，定义 demo root、scheme、size limit、preview/content char limit。
- [x] T035-015 实现 `@demo://` path normalize、scheme validation 和 relative path validation。
- [x] T035-016 实现 final path root boundary check，确认最终路径仍在 `examples/agent-demo/` 下。
- [x] T035-017 实现 extension allowlist：Agent 内容只允许 `.md`，manifest 只允许 `demo-manifest.json`。
- [x] T035-018 实现 file size、普通文件、symlink / directory 拒绝逻辑。
- [x] T035-019 实现 demo resource read adapter，返回 content、preview、resourceName、sizeBytes、serverId 和 uri。
- [x] T035-020 [P] 增加 resolver happy path 测试，覆盖 `@demo://version-plans/v034-langsmith-observability.md`。
- [x] T035-021 [P] 增加 forbidden scheme 测试，覆盖 `@docs://`、`docs://`、`@specs://`、`file://`。
- [x] T035-022 [P] 增加 path traversal / absolute path / backslash / unknown extension / size limit 测试。
- [x] T035-023 检查 resolver 错误提示不暴露真实绝对路径、project root、raw Error 或文件内容。

**Checkpoint**：`@demo://` resolver 独立安全可用，旧 docs scheme 在 Agent resource 语义下 fail closed。

## Phase 3：Tasklist Agent Entry Migration

**目标**：将 Tasklist Agent public demo 入口从 `docs://versions/*.md` 迁移到 `@demo://version-plans/*.md`。

- [x] T035-024 更新 `apps/webapp/lib/ai/model-provider/resolve-route-type.ts`，只把 `/tasklist + @demo://version-plans/*.md` 识别为 tasklist route。
- [x] T035-025 更新 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/index.ts` 的 invocation resolver，只接受 `@demo://version-plans/*.md`。
- [x] T035-026 更新 `/tasklist` missing / invalid version plan 的边界提示文案。
- [x] T035-027 更新 `apps/webapp/lib/ai/runtime/version-plan-tasklist-agent/resources/version-plan-reader.ts`，改用 demo resource adapter。
- [x] T035-028 更新 optional context 白名单，移除真实 `docs://README.md` / `docs://architecture/*.md` 作为 Tasklist Agent optional context。
- [x] T035-029 更新 planning decision prompt 中的 resource 白名单和禁止扫描说明。
- [x] T035-030 更新 tasklist draft prompt 中的来源方案示例，从 `docs://versions/xxx.md` 改为 `@demo://version-plans/xxx.md`。
- [x] T035-031 确认 `versionPlanUri` 字段名保留，LangSmith metadata 只迁移值。
- [x] T035-032 [P] 更新 `resolve-route-type` tests，覆盖 `@demo://` ready 和 `docs://` rejected。
- [x] T035-033 [P] 更新 Tasklist Agent invocation tests，覆盖 traversal / old docs scheme / happy path。
- [x] T035-034 [P] 更新 version plan reader tests，确认不读取真实 docs adapter。
- [x] T035-035 [P] 更新 chat-orchestrator tests，覆盖 `/tasklist` missing / invalid demo reference 文案。
- [x] T035-036 [P] 更新 LangSmith observability tests，确认 `versionPlanUri=@demo://version-plans/*.md` 仍进入 metadata allowlist。

**Checkpoint**：服务端 Tasklist Agent 只能通过 `@demo://version-plans/*.md` 触发和读取。

## Phase 4：Frontend Resource Picker / Quick Access

**目标**：让 public demo UI 只展示 demo version plans，并提供 Tasklist Agent 快捷入口。

- [x] T035-037 新增或替换 demo resource catalog route，输出 `examples/agent-demo/version-plans/` 中的 demo version plan items。
- [x] T035-038 更新 `apps/webapp/components/chat/composer/menu/composer-resource-options.ts`，从 demo catalog 读取 picker options。
- [x] T035-039 移除 picker 对真实 docs catalog 的依赖，不再展示 `docs/versions`、`docs/README.md`、`docs/architecture/*.md`。
- [x] T035-040 更新 `ComposerResourceMenu` 的可见标签文案为 “Demo” 或 “示例”，但不为此修改提交 payload 或 frontend reducer 数据结构。
- [x] T035-041 在 `empty-state-suggestion-options.ts` 增加 Tasklist Agent demo 快速访问。
- [x] T035-042 将快速访问默认引用设置为 `@demo://version-plans/v034-langsmith-observability.md`。
- [x] T035-043 确认快速访问不引用 v0.3.5、v0.3.6 或 future version。
- [x] T035-044 [P] 增加 picker catalog tests，确认只返回 demo version plans。
- [x] T035-045 [P] 增加 quick access tests，确认 Tasklist Agent demo 使用 v034 demo URI。

**Checkpoint**：用户从 UI 只能选择 demo version plan 触发 public Agent demo。

## Phase 5：Small-screen UX Polish

**目标**：仅在小屏优化 public demo 入口密度，不重构 composer。

- [x] T035-046 更新 `ChatComposer` 移动端 card/content padding，桌面端保持现状。
- [x] T035-047 更新 `ComposerEditor` 移动端初始 min-height 为一行，多行仍保留自动增高和 max-height。
- [x] T035-048 更新 `ComposerToolbar` 模型选择器移动端高度、字体、padding、min-width 和 truncate。
- [x] T035-049 更新 slash command popup 移动端标题、描述、icon 和 item padding。
- [x] T035-050 更新 resource popup 移动端标题、描述、badge 和 item padding。
- [x] T035-051 [P] 增加或更新 composer / toolbar / popup 移动端相关组件测试。
- [x] T035-052 人工浏览器 smoke 检查 375x812 和 1440x900，确认小屏优化且桌面不回归。

**Checkpoint**：移动端 public demo 入口可用性提升，桌面端不受影响。

## Phase 6：Docs / Regression / Boundary Audit

**目标**：同步文档与回归验证，确保旧 scheme 没有残留成 Agent 入口。

- [x] T035-053 更新 README 中当前版本、Tasklist Agent 入口、resource picker 和示例命令。
- [x] T035-054 更新 runtime / architecture docs 中 public Agent resource boundary 说明。
- [x] T035-055 执行 `rg -n "docs://versions|@docs://|@demo://version-plans"`，人工确认旧 docs scheme 不再作为 Tasklist Agent public demo 入口。
- [x] T035-056 运行 resolver / route / Tasklist Agent reader / picker / quick access targeted tests。
- [x] T035-057 运行 `pnpm --dir apps/webapp typecheck`。
- [x] T035-058 运行 `pnpm --dir apps/webapp lint`。
- [x] T035-059 执行 `git diff --check`。
- [x] T035-060 人工检查 diff 未修改 Graph topology、HITL contract、stream protocol、frontend reducer 数据结构、Prisma schema、PostgresSaver schema。

**Checkpoint**：实现可进入 converge / release assets 前检查。

## Phase 7：Converge / Release Close

**目标**：实现完成后再做版本收口。

- [x] T035-061 执行 `speckit-converge` 或人工等价收口，确认 spec / plan / tasks / acceptance / decisions 与真实 diff 一致。
- [x] T035-062 同步 `docs/versions/v0.3.5-agent-demo-workspace-resource-boundary.md`。
- [x] T035-063 同步 `docs/releases/v0.3.5.md`。
- [x] T035-064 同步 `docs/tasklists/v0.3.5-tasklist.md`。
- [x] T035-065 更新 package version 至 `0.3.5`。
- [x] T035-066 最终记录测试、未执行验证和人工补验项。
- [x] T035-067 收口 `versions -> version-plans` 命名修正：统一 demo manifest 字段为 `versionPlans`，并同步 specs / docs / tests 中“版本方案输入”口径。

## 学习暂停点建议

- **Pause A**：完成 Phase 1 后，学习 demo corpus 为什么不是历史归档。
- **Pause B**：完成 Phase 2 后，学习 resolver 的 root boundary check 和 fail-closed 规则。
- **Pause C**：完成 Phase 3 后，学习 Tasklist Agent 如何在不改 Graph 的情况下迁移输入 scheme。
- **Pause D**：完成 Phase 5 后，做小屏 / 桌面 UI 对照。
- **Pause E**：完成 Phase 6 后，做实施后 review，再进入 release assets。

## 最小验证记录模板

实现阶段完成后在这里记录：

- [x] resolver / route / Tasklist Agent reader targeted tests
- [x] picker / quick access / mobile polish targeted tests
- [x] `pnpm --dir apps/webapp typecheck`
- [x] `pnpm --dir apps/webapp lint`
- [x] `git diff --check`
- [x] 人工 diff 检查：未修改 Graph topology、HITL decision contract、stream protocol、frontend reducer、Prisma schema / migration、PostgresSaver schema

## 人工补验项

- 在浏览器中跑一轮 `/tasklist + @demo://version-plans/v034-langsmith-observability.md`。
- 如果配置真实 `LANGSMITH_API_KEY`，确认 LangSmith metadata 中 `versionPlanUri` 为 `@demo://version-plans/*.md`，且不上传完整 demo version plan 正文。
