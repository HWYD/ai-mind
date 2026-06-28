# Plan 033：Spec Kit Full Skills Default Entry

状态：已完成
版本：v0.3.3
日期：2026-06-28

## 目的

本计划定义 AI Mind 如何从 v0.3.2 的 lightweight pilot skills，升级到 official Spec Kit full skills 作为 Level C / D 默认入口。

核心原则：

- 先迁移 AI Mind 规则，再移除 pilot skills。
- official skills 保持原样，不直接魔改。
- AI Mind 项目差异通过 adapter layer 注入。
- full skills 只服务复杂变更，不让小改变重。

## 当前仓库基线

当前已存在：

- `.specify/memory/constitution.md`
- `specs/030...`、`031...`、`032...`
- `docs/adr/0006-spec-kit-cli-and-codex-skills-dual-track.md`
- `docs/architecture/spec-kit-tooling.md`
- `docs/architecture/ai-coding-workflow.md`
- `.agents/skills/ai-mind-step-audit/`
- `.agents/skills/speckit-clarify/`
- `.agents/skills/speckit-checklist/`
- `.agents/skills/speckit-analyze/`

当前缺口：

- 仓库内还没有 official full `speckit-*` skills。
- `.specify/` 只有 hand-written constitution，不是完整 official CLI init 产物。
- v0.3.2 pilot skills 仍占用 `speckit-*` 命名空间。
- workflow docs 仍描述为 v0.3.2 pilot，尚未升级为 v0.3.3 default entry。
- 尚未有 ADR 记录 official full skills default entry。

本版本实施中选择的 official source：

- Source：`github/spec-kit`
- Tag：`v0.11.9`
- CLI version：`0.11.9`
- 生成命令：`specify init <temp-project> --integration codex --integration-options="--skills" --ignore-agent-tools --script ps`
- 合并范围：`.agents/skills/speckit-*`、`.specify/scripts/powershell`、`.specify/templates`、`.specify/integrations`、`.specify/extensions/agent-context`、`.specify/init-options.json`
- 保留范围：AI Mind 自有 `.specify/memory/constitution.md` 不被官方模板覆盖。

## 架构分层

### Official generated / vendored baseline

职责：

- 提供 official `speckit-*` full skills。
- 保持官方生成内容原样。
- 作为 Codex 触发 Spec Kit 标准流程的 canonical entry。

限制：

- 不直接写入 AI Mind 私有工程规则。
- 不替代 constitution、specs、ADR 或 architecture docs。
- 不默认读取 `private-folder/`。

### AI Mind adapter layer

职责：

- 承载 AI Mind 长期工程约束。
- 把 official skills 的通用流程导向 AI Mind 的真实工作区和边界。
- 说明 Level A / B / C / D 如何使用 full skills。

候选位置：

- `.specify/memory/constitution.md`
- `.specify/templates/overrides/`
- `docs/adr/`
- `docs/architecture/spec-kit-tooling.md`
- `docs/architecture/ai-coding-workflow.md`
- `docs/architecture/spec-driven-development.md`
- `AGENTS.md`
- `specs/`

### Manual equivalent fallback

职责：

- 在 CLI、skills、slash command、网络或权限不可用时继续推进复杂版本。
- 保留人工澄清、质量清单、一致性分析和收口检查。
- 防止外部 tooling 不稳定阻塞业务版本。

## 推荐执行链

```text
P0 读取现有治理基线和 pilot skills
  -> P1 创建 v0.3.3 spec / plan / acceptance / decisions
  -> P2 执行 clarify gate
  -> P3 执行 checklist gate
  -> P4 编写 tasks
  -> P5 执行 analyze gate
  -> P6 审计并迁移 pilot skills 中的 AI Mind 规则
  -> P7 引入 official full skills
  -> P8 移除旧 pilot speckit-* skills
  -> P9 更新 ADR / architecture docs / AGENTS / README / release assets
  -> P10 执行 official skills discovery 与 converge 收口
```

## official skills 引入策略

本版本允许将 official full skills 合并进 `.agents/skills/speckit-*`，但必须满足：

- 记录 official source、version 或 release tag。
- 先检查生成物 diff，再合并。
- 不覆盖 AI Mind 有效规则；有效规则必须迁移到 adapter layer。
- 同名 lightweight pilot skills 不得与 official skills 共存。
- 如果保留 AI Mind 专属 skill，必须使用 `ai-mind-*` 命名。
- 如果 official skills 依赖 scripts / templates / manifests，应同步保留这些 official baseline 文件，否则 skills 会成为不可运行的孤立文档。

## workflow 更新策略

Level A：

- 不使用 full skills。
- 说明范围和验证方式即可。

Level B：

- 默认 mini spec 或引用现有 spec。
- 仅在需求明显模糊或影响面升级时选择 clarify。

Level C：

- 默认使用 official full skills。
- 至少覆盖 specify / clarify / plan / checklist / tasks / analyze。
- 实现后执行 converge 或人工等价收口。

Level D：

- official full skills + ADR + architecture docs + 人工 review。
- release close 前必须执行 converge 或人工等价。

## 兼容性

- 不改变 runtime 行为。
- 不改变 webapp、stream-core、database package 的运行时契约。
- 不改变 existing specs 的历史事实。
- 不改变 private-folder 的定位：草稿、历史和个人内部材料，不是默认事实源。
- manual fallback 与 slash command 兼容说明继续保留。

## 验证方式

最小验证：

- `git diff --check`
- 检查 `.agents/skills/` 中没有 lightweight `speckit-*` shadow official skills。
- 检查 docs / specs / ADR / AGENTS 对 Level C / D 默认入口表述一致。

skills 验证：

- 新 Codex 会话能发现 official `speckit-*` skills。
- `$speckit-specify` 可触发。
- `$speckit-plan` 可触发。
- `$speckit-tasks` 可触发。
- `$speckit-analyze` 可触发。
- `$speckit-converge` 可触发。
- manual fallback 仍可按文档执行。

如果修改 package version：

- 评估是否需要 `pnpm install --frozen-lockfile`。

如果不修改 runtime、schema、protocol、package scripts 或 dependencies：

- typecheck / build 不是本版本最小必需验证，但 release close 可作为信心检查执行。
