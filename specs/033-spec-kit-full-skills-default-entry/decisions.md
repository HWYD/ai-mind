# 决策 033：Spec Kit Full Skills Default Entry

状态：已完成
版本：v0.3.3
日期：2026-06-28

## D033-01：official full skills 成为 canonical speckit-\* entry

AI Mind 引入 official Spec Kit full skills 作为 canonical `speckit-*` entry。

以后 `.agents/skills/speckit-*` 应代表 official Spec Kit skills，而不是 AI Mind lightweight pilot skills。

## D033-02：official skills 保持 generated / vendored baseline

official full skills 保持 generated / vendored baseline，不直接魔改。

AI Mind 的项目特定约束不写进 official skills 本体，而是通过 adapter layer 提供。

## D033-03：lightweight pilot skills 退出 speckit-\* 命名空间

v0.3.2 的 lightweight pilot skills 不再占用 `speckit-*` 正式命名空间。

迁移完成后，旧 pilot skills 应从 `.agents/skills/` 移除。

## D033-04：先审计迁移，再移除 pilot skills

删除旧 pilot skills 前，必须审计其内容。

有价值的 AI Mind 规则迁移到：

- `.specify/memory/constitution.md`
- `.specify/templates/overrides/`
- `docs/adr/`
- `docs/architecture/spec-kit-tooling.md`
- `docs/architecture/ai-coding-workflow.md`
- `AGENTS.md`

不得因为引入 official skills 而丢失 AI Mind 已验证有效的项目边界。

## D033-05：AI Mind 专属 skill 必须使用 ai-mind-\* 命名

如果确实需要保留 AI Mind 专属 development skill，必须改名为 `ai-mind-*`。

AI Mind 专属 skill 不得 shadow official `speckit-*`。

## D033-06：full skills 只作为 Level C / D 默认入口

official full skills 不扩展成所有任务必跑流程。

- Level A：不强制。
- Level B：默认 mini spec 或人工澄清。
- Level C：默认 official full skills 或人工等价。
- Level D：official full skills + ADR + architecture docs + 人工 review。

## D033-07：人工等价 fallback 长期保留

即使 official skills 成为 Level C / D 默认入口，人工等价 clarify / checklist / analyze / converge 仍长期保留。

原因：

- 外部 tooling 可能受网络、权限、版本或环境影响。
- reviewer 仍需要人工判断。
- AI Mind 不能把复杂版本开发完全绑定到单个工具状态。

## D033-08：slash command 兼容说明继续保留

支持 slash command 的 agent 可以使用对应 `/speckit.*` 命令。

Codex 环境优先使用 `$speckit-*` skills。

没有 tooling 时执行人工等价流程。

## D033-09：taskstoissues optional

`speckit-taskstoissues` 暂时作为 optional。

AI Mind 当前没有把 GitHub Issues 转成默认版本执行入口，因此本 skill 不进入默认主流程。

## D033-10：converge 进入 Level C / D 收口检查

`speckit-converge` 对 AI Mind 很重要，进入 Level C / D 的默认收口检查。

它用于实现后检查：

- spec 是否已经满足。
- plan 是否与实际 diff 一致。
- tasks 是否真实完成。
- non-goals 是否被守住。
- docs、ADR、release assets 是否存在 drift。

## D033-11：v0.3.3 不接 CI 强制门

本版本只让 official full skills 成为 Level C / D 默认入口，不把 Spec Kit tooling 接入 CI 强制门。

是否把 Spec Kit 检查写入 CI，留给后续版本单独评估。

## D033-12：official release pinning 优先于 dev checkout

如果 v0.3.3 需要重新生成 official full skills，应优先使用 official release tag 或可记录的版本来源。

不应继续把 v0.3.2 的临时 dev checkout `0.11.10.dev0` 作为团队基线。

本版本采用：

- Source：`github/spec-kit`
- Tag：`v0.11.9`
- CLI version：`0.11.9`

## D033-13：保留 official skills 依赖的 .specify baseline

official `speckit-plan`、`speckit-tasks`、`speckit-implement` 和 `speckit-converge` 会调用 `.specify/scripts/powershell/*.ps1` 并读取 `.specify/templates/*`。

因此 v0.3.3 不只复制 `.agents/skills/`，还同步保留 official generated `.specify/scripts`、`.specify/templates`、`.specify/integrations`、`.specify/extensions/agent-context` 和 `.specify/init-options.json`。

AI Mind 自有 `.specify/memory/constitution.md` 不被 official `constitution-template.md` 覆盖。

## D033-14：template overrides 先建立边界，不立即覆盖 core templates

本版本创建 `.specify/templates/overrides/README.md` 说明 AI Mind template override 规则，但暂不覆盖 official core templates。

原因：

- official full skills 刚接入，先保持 generated baseline 可追踪。
- AI Mind 已有 specs 五件套可以继续作为正式工作区。
- 具体 template override 应在经过实际使用后按需新增，避免过早偏离 official template。
