# Acceptance 035：Agent Demo Workspace Resource Boundary

状态：已收口
版本：v0.3.5
日期：2026-06-29

## Demo Workspace 验收

- `examples/agent-demo/README.md` 存在，并说明 demo workspace 是 public Agent demo resource root。
- `examples/agent-demo/demo-manifest.json` 存在。
- `demo-manifest.json` 的 `resourceRoot` 为 `examples/agent-demo`。
- `demo-manifest.json` 的 `publicSchemes` 只包含 `@demo://`。
- `version-plans/` 只包含以下 demo version plan 输入：
    - `v020-controlled-agent-graph.md`
    - `v030-hitl-checkpoint-resume.md`
    - `v034-langsmith-observability.md`
    - `test-missing-non-goals.md`
    - `test-over-scoped-runtime-change.md`
- `version-plans/` 不包含 v0.3.5、v0.3.6 或其他未来 / 未完成版本。
- `examples/agent-demo/` 不包含真实源码。
- `scenarios/` 保持扁平，每个 scenario 只包含 `requirement.md`、`context.md`、`plan.sample.md`、`tasks.sample.md`、`review.expected.md`。

## Resource Resolver 验收

- `@demo://version-plans/v034-langsmith-observability.md` 可读取。
- `@demo://version-plans/v020-controlled-agent-graph.md` 可读取。
- `@demo://version-plans/v030-hitl-checkpoint-resume.md` 可读取。
- `@demo://version-plans/test-missing-non-goals.md` 可读取。
- `@demo://version-plans/test-over-scoped-runtime-change.md` 可读取。
- `@demo://scenarios/request-limit-banner/context.md` 可读取。
- `@demo://rubrics/plan-rubric.md` 可读取。
- `@demo://governance/engineering-rules.md` 可读取。
- `@docs://versions/v034-langsmith-observability.md` 被拒绝，并返回清晰边界提示。
- `docs://versions/v0.3.4-tasklist-agent-langsmith-observability.md` 被拒绝。
- `@specs://035-agent-demo-workspace-resource-boundary/spec.md` 被拒绝。
- `file://...` 被拒绝。
- 真实绝对路径被拒绝。
- `@demo://version-plans/../governance/engineering-rules.md` 被拒绝。
- `@demo://../../apps/webapp/package.json` 被拒绝。
- 反斜杠路径被拒绝。
- 未知 scheme 被拒绝。
- 非 `.md` Agent 内容读取被拒绝。
- 超过 128 KiB 的单文件被拒绝或明确截断策略被测试覆盖。
- resolver 验证最终 real path 仍在 `examples/agent-demo/` 下。

## Tasklist Agent 入口验收

- `/tasklist + @demo://version-plans/v034-langsmith-observability.md` 进入 Tasklist Agent。
- `/tasklist + @demo://version-plans/v020-controlled-agent-graph.md` 进入 Tasklist Agent。
- `/tasklist + @demo://version-plans/v030-hitl-checkpoint-resume.md` 进入 Tasklist Agent。
- `/tasklist + @demo://version-plans/test-missing-non-goals.md` 进入 Tasklist Agent，并触发缺失 non-goals / acceptance 的边界处理。
- `/tasklist + @demo://version-plans/test-over-scoped-runtime-change.md` 进入 Tasklist Agent，并产生 scope 过大 / manual review 类 warning。
- `/tasklist + @docs://versions/*.md` 不再进入 Tasklist Agent。
- `/tasklist` 未引用 `@demo://version-plans/*.md` 时 fail closed，并提示从 `@` picker 选择 demo 版本方案输入。
- `versionPlanUri` 字段名保留，值为 `@demo://version-plans/*.md`。
- Tasklist Agent 不读取真实 `docs/versions/*.md`。

## Runtime Non-regression 验收

- 不修改 Tasklist Agent Graph topology。
- 不修改 HITL decision schema。
- 不修改 checkpoint resume 语义。
- 不修改 AgentRun / AgentInterrupt schema。
- 不修改 stream protocol。
- 不修改 frontend reducer 数据结构。
- 不修改 Prisma schema。
- 不修改 PostgresSaver schema。
- 不修改 v0.3.4 LangSmith observer 语义。
- LangSmith metadata 继续允许 `versionPlanUri`，但值迁移为 `@demo://version-plans/*.md`。
- 普通聊天、Tool Calling、MCP、reader-skill、utility-skill 不因本版本进入 Tasklist Agent。

## Frontend 验收

- `@` picker 只展示 `examples/agent-demo/version-plans/` 下的 demo 版本方案输入文件。
- `@` picker 不展示真实 `docs/versions` 文件。
- `@` picker 不展示真实 `docs/README.md` 或 `docs/architecture/*.md`。
- 本地资源标签从“本地”调整为“Demo”或“示例”，最终文案应短且不挤压布局。
- 快速访问包含 Tasklist Agent demo。
- 快速访问默认文本为 `/tasklist + @demo://version-plans/v034-langsmith-observability.md`。
- 快速访问不使用 v0.3.5 / v0.3.6 / future version。
- 小屏 textarea 初始高度为一行。
- 小屏 textarea 多行输入后仍能自动增高。
- 小屏模型选择器字体和内边距更小。
- 小屏模型选择器不挤压发送按钮。
- 小屏 slash/resource popup 标题字体不超过 14px。
- 小屏 slash/resource popup 描述字体更小，item padding 更紧凑。
- 桌面端 composer、模型选择器、popup 不受本版本样式调整影响。

## 测试验收

实施完成后至少需要新增或更新：

- demo resolver 单元测试。
- path traversal / absolute path / unknown scheme / extension / size limit 测试。
- demo manifest 完整性测试。
- Tasklist Agent invocation resolver 测试。
- route type `/tasklist + @demo://version-plans/*.md` 测试。
- chat orchestrator `/tasklist` missing / invalid resource 回归测试。
- version plan reader 使用 demo resolver 的测试。
- LangSmith metadata 中 `versionPlanUri=@demo://...` 的测试。
- `@` picker 只展示 demo version plans 的测试。
- 快速访问 Tasklist Agent demo 的测试。
- 小屏 composer / model selector / slash popup 样式或行为测试。
- 人工检查未修改 Graph / HITL / stream / reducer / Prisma / PostgresSaver。

最小验证命令建议：

```powershell
pnpm --dir apps/webapp test tests/lib/ai/model-provider/resolve-route-type.test.ts
pnpm --dir apps/webapp test tests/lib/ai/runtime/chat-orchestrator.test.ts
pnpm --dir apps/webapp test tests/lib/ai/runtime/version-plan-tasklist-agent-graph-nodes.test.ts
pnpm --dir apps/webapp test tests/components/chat/message-list
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
git diff --check
```

具体命令可随实际测试文件位置调整，但不得低于 resolver、route、Tasklist Agent reader、picker、quick access、mobile polish 的 targeted coverage。

## 文档验收

- `specs/035-agent-demo-workspace-resource-boundary/` 五件套完整。
- `research.md`、`data-model.md`、`contracts/`、`quickstart.md` 作为实现前设计资产存在。
- ADR-0009 已创建并被 ADR README 引用。
- `specs/README.md` 索引新增 035。
- README、示例命令和错误提示在实现阶段同步为 `@demo://`。
- release 收口阶段再同步 `docs/versions/`、`docs/releases/`、`docs/tasklists/`。

## 实施前 Gate 验收

进入代码实施前必须完成：

- Specify gate：v035 spec 已创建，目标、非目标、用户故事、FR、edge cases 清楚。
- Clarify gate：版本 corpus 已收敛为瘦 corpus，`v030-hitl-checkpoint-resume.md` 文件名已定稿，无需继续追问。
- Plan gate：实现边界限定在 demo workspace、resolver、Tasklist Agent 入口、picker、quick access 和移动端样式。
- Checklist gate：requirements checklist 通过，无明显把 Non-goals 写成隐性任务。
- Tasks gate：tasks 按阶段拆分，可在每个 checkpoint 停下验证。
- Analyze gate：spec / plan / tasks / acceptance / decisions 无明显冲突。

## 验收结论记录

最终收口记录：

- Clarify gate 结论：版本 corpus 已收敛为瘦 corpus，v030 命名和 demo version plans 范围已锁定。
- Checklist gate 结论：requirements / resource-boundary checklist 已通过，未把 future delivery-chain 能力误写进本版。
- Analyze gate 结论：spec / plan / tasks / acceptance / decisions 与实际 diff 一致。
- Converge 或人工等价收口结论：已按 public demo boundary 收口；额外通过浏览器 smoke 发现并修复 picker 混入 latest-context 与移动端横向溢出。
- 已执行验证：apps/webapp typecheck、apps/webapp lint、关键 resolver / route / Tasklist Agent / picker / mobile polish 测试、375x812 与桌面 smoke、git diff --check。
- 未执行验证：未做真实 PostgreSQL + Tasklist Agent 数据库链路补验；本地 smoke 中该入口仍提示数据库暂不可用。
