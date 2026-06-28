# Spec Kit Tooling

## 摘要

AI Mind v0.3.3 采用 official Spec Kit full skills 作为 Level C / D 变更的默认入口。

这不是把外部工具变成唯一事实源，而是把 v0.3.1 的 spec-anchored workflow 和 v0.3.2 的 dual-track pilot，收口为更清晰的三层模型：

```text
official generated / vendored skills
  -> canonical speckit-* entry

AI Mind adapter layer
  -> constitution / specs / ADR / architecture docs / template overrides / AGENTS

manual equivalent fallback
  -> tooling 不可用时继续执行同等质量判断
```

## Official Spec Kit CLI

Spec Kit CLI 是官方 tooling 入口，适合用于：

- 初始化或检查 Spec Kit 风格项目结构。
- 生成 official full skills。
- 对照官方最佳实践检查 AI Mind 的本地流程是否偏离。

AI Mind 对 CLI 的使用约束：

- CLI 输出不是唯一事实源。
- CLI 生成物不得直接覆盖已有 constitution、specs、ADR、AGENTS 或项目规则。
- 真实安装、版本、命令和生成文件必须记录。
- 如果需要重新生成 official full skills，优先使用 official release tag 或可追踪版本来源，不依赖 main branch dev checkout。
- 本版本不把 CLI 接入 CI 强制门。

## Official Codex Skills

v0.3.3 起，`.agents/skills/speckit-*` 命名空间保留给 official Spec Kit full skills。

official full skills 应作为 generated / vendored baseline 保持原样，不直接写入 AI Mind 私有规则。

默认关注的 full skills：

- `speckit-agent-context-update`
- `speckit-constitution`
- `speckit-specify`
- `speckit-clarify`
- `speckit-plan`
- `speckit-checklist`
- `speckit-tasks`
- `speckit-analyze`
- `speckit-implement`
- `speckit-converge`

optional：

- `speckit-taskstoissues`

重要边界：

- Codex development skills 不属于 AI Mind 产品内 Skill Runtime。
- Codex development skills 不修改 webapp runtime。
- Codex development skills 不默认读取 `private-folder/` 作为事实源。
- `speckit-implement` 只能实现当前明确 task，不允许默认一次性完成整个版本。
- `speckit-converge` 用于 Level C / D 实现后的收口检查。
- `speckit-taskstoissues` 暂时不进入默认主流程。
- `speckit-agent-context-update` 是 official agent-context extension helper，用于更新 agent context，不是 AI Mind 产品内 Skill Runtime。

## v0.3.3 Official Baseline

本版本采用以下官方来源：

```text
Source: github/spec-kit
Tag: v0.11.9
CLI version: 0.11.9
Generation command:
specify init <temp-project> --integration codex --integration-options="--skills" --ignore-agent-tools --script ps
```

合并范围：

- `.agents/skills/speckit-*`
- `.specify/scripts/powershell`
- `.specify/templates`
- `.specify/integrations`
- `.specify/extensions/agent-context`
- `.specify/init-options.json`

保留范围：

- AI Mind 自有 `.specify/memory/constitution.md` 不被 official `constitution-template.md` 覆盖。
- AI Mind 规则继续通过 adapter layer 生效。

## Feature Context

official Spec Kit scripts 会优先通过 `SPECIFY_FEATURE_DIRECTORY` 或 `.specify/feature.json` 定位当前 feature。

AI Mind 当前仍以 `specs/<version-topic>/` 作为正式版本工作区。执行 official scripts 时，可以显式设置 `SPECIFY_FEATURE_DIRECTORY` 指向当前版本目录；`.specify/feature.json` 只是本地当前 feature 指针，不是长期事实源，也不应提交。

## AI Mind Adapter Layer

AI Mind 的项目约束不写进 official skills 本体，而是放在 adapter layer：

- `.specify/memory/constitution.md`：长期工程原则。
- `.specify/templates/overrides/`：如官方模板机制适用，用于覆盖 spec / plan / tasks 等模板结构。
- `specs/`：正式 AI coding 工作规格区。
- `docs/adr/`：长期架构决策。
- `docs/architecture/`：当前架构事实和工具链说明。
- `AGENTS.md`：Codex 默认事实来源、读取顺序和执行边界。

这样做的目的：

- 让 official skills 可升级。
- 让 AI Mind 规则不丢失。
- 避免同名 `speckit-*` 同时代表官方和项目内 pilot。
- 避免小改被 full skills 过度加重。

## 人工等价

人工等价路径长期保留。

当 CLI、skills、slash command、网络或权限不可用时，开发者仍需回答同样的问题：

- specify：当前变更是否需要正式 specs 工作区？
- clarify：目标、用户行为、Non-goals、边界、验收是否清楚？
- plan：真实实施路径、职责边界、兼容性和验证策略是否明确？
- checklist：需求是否完整、可验收、没有把非目标写成隐性任务？
- tasks：任务是否按最小可验证步骤拆分？
- analyze：spec / plan / tasks / acceptance / decisions 是否一致？
- converge：实现、docs、ADR、release assets 和 diff 是否收口？

人工等价不是跳过流程，而是用人工方式完成同样的质量判断。

## 推荐使用规则

Level A：

- 不使用完整 tooling。
- 说明修改范围和验证方式即可。

Level B：

- 默认不强制。
- 使用 mini spec 或引用现有 spec。
- 如果 mini spec 仍有歧义，可选择 clarify 或人工澄清。

Level C：

- 默认使用 official full skills。
- 覆盖 specify / clarify / plan / checklist / tasks / analyze。
- 实现后执行 converge 或人工等价收口。

Level D：

- 默认使用 official full skills。
- 必须新增或更新 ADR。
- 必须更新 architecture docs。
- 必须人工 review。
- release close 前执行 converge 或人工等价收口。

## v0.3.2 Pilot 迁移结论

v0.3.2 的三枚本地 lightweight skills：

- `.agents/skills/speckit-clarify/`
- `.agents/skills/speckit-checklist/`
- `.agents/skills/speckit-analyze/`

已经完成 pilot 使命。它们提供的有价值规则包括：

- Level C / D gate 时机。
- constitution -> specs -> ADR -> architecture docs 的读取顺序。
- `private-folder/` 非默认事实源。
- development skills 不等于产品 Skill Runtime。
- tooling 不可用时保留人工等价。

这些规则在 v0.3.3 迁移到 constitution、ADR、architecture docs 和 AGENTS。旧 pilot skills 不再占用 `speckit-*` 正式命名空间。

## 推荐验证记录

如果维护者生成 official full skills，请在 PR 或交付说明中记录：

```text
Tool:
Source:
Version or tag:
Command:
Generated files:
Conflicts found:
Decision:
```

如果维护者验证 Codex skills，请记录：

```text
Skill:
Trigger:
Input spec:
Output summary:
Useful:
Issues:
Decision:
```

## 失败回退

如果 CLI 或 skills 不稳定：

- 回退到人工等价流程。
- 保留 `specs/`、ADR、architecture docs 作为正式事实源。
- 不因为 tooling 不可用而阻塞业务版本开发。
- 不用 AI Mind 本地 `speckit-*` shadow official skills；如确需项目专属 skill，必须使用 `ai-mind-*` 命名。
