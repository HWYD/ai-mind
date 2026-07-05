# AI Mind Template Overrides

本目录用于放置 AI Mind 对 official Spec Kit templates 的项目级覆盖。

v0.3.3 先引入 official generated / vendored baseline，不直接覆盖 core templates。AI Mind 的长期规则优先放在：

- `.specify/memory/constitution.md`
- `specs/`
- `docs/adr/`
- `docs/architecture/`
- `AGENTS.md`

只有当 official template 与 AI Mind 的实际工作规格长期不匹配，并且该差异已经在 spec / ADR / workflow docs 中说明时，才在这里新增同名 template override。

当前策略：

- 不覆盖 `spec-template.md`。
- 不覆盖 `plan-template.md`。
- 不覆盖 `tasks-template.md`。
- 不覆盖 `checklist-template.md`。
- 使用 docs 与 constitution 约束 official skills 的执行边界。
- 不为了中文正文直接修改 official core templates。

这样可以保持 official baseline 可追踪，同时避免 AI Mind 项目规则散落到 generated skills 本体里。

## Spec Kit Language Policy

AI Mind 允许 `specs/` 正文中文为主，但模板层必须保持 official-compatible 英文骨架：

- 文件名保持 `spec.md`、`plan.md`、`tasks.md`、`acceptance.md`、`decisions.md`。
- 核心 section heading 建议保留英文，正文用中文解释。
- skill、command、script、代码标识符和技术专有名词保持英文或中英混写。

如果长期需要影响模板输出，先在本目录新增 override 或说明策略，并确认该差异已经在 constitution、specs、ADR 或 workflow docs 中说明；不要直接魔改 `.specify/templates` core templates。
