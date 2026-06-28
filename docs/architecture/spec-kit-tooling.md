# Spec Kit Tooling

## 摘要

AI Mind v0.3.2 采用 Spec Kit CLI + Codex skills 双轨 pilot。

这不是把外部工具变成唯一事实源，而是把 v0.3.1 已经建立的 spec-anchored workflow，进一步接入更省力、更稳定的执行入口。

## 三条执行路径

### 1. Spec Kit CLI

Spec Kit CLI 是官方 tooling 入口，适合用于：

- 初始化或检查 Spec Kit 风格项目结构
- 运行官方 clarify / checklist / analyze 类流程
- 对照官方最佳实践检查 AI Mind 的本地流程是否偏离

AI Mind 对 CLI 的使用约束：

- 不在 v0.3.2 自动安装 CLI
- 不把 CLI 输出当作唯一事实源
- 不允许 CLI 直接覆盖已有 constitution、specs、ADR 或 AGENTS rules
- 真实安装与试跑结果必须人工记录

### 2. Codex Skills

Codex skills 是 Codex 环境中的可复用工作流，适合用于：

- `$speckit-clarify`
- `$speckit-checklist`
- `$speckit-analyze`
- AI Mind step audit
- 后续复杂版本的阶段性 review

v0.3.2 当前仓库内提供三组项目内 pilot skills：

- `.agents/skills/speckit-clarify/`
- `.agents/skills/speckit-checklist/`
- `.agents/skills/speckit-analyze/`

它们是 AI Mind 本地 pilot skills，不声明为官方 CLI 生成产物。后续如果使用官方 Spec Kit CLI 生成同类 skills，必须先比较职责和 diff，再决定保留、替换或合并。

v0.3.2 试跑发现，官方 CLI 的 Codex skills mode 会生成完整 `speckit-*` 套件，包括：

- `speckit-constitution`
- `speckit-specify`
- `speckit-plan`
- `speckit-tasks`
- `speckit-implement`
- `speckit-converge`
- `speckit-clarify`
- `speckit-checklist`
- `speckit-analyze`

因此，当前仓库内三组 lightweight skills 的定位是 AI Mind 项目约束适配层，不是官方完整套件的永久替代。是否引入官方完整套件，应在后续版本中单独评估。

重要边界：

- Codex skills 属于开发者工具层，不属于 AI Mind 产品内 Skill Runtime。
- Codex skills 不修改 webapp runtime。
- Codex skills 不默认读取 `private-folder/`。
- Codex skills 必须优先读取 constitution、当前 specs、ADR 和 architecture docs。

### 3. 人工等价

人工等价路径长期保留。

当 CLI、skills、slash command 或网络不可用时，开发者仍需回答同样的问题：

- clarify：目标、用户行为、Non-goals、边界、验收是否清楚？
- checklist：需求是否完整、可验收、没有把非目标写成隐性任务？
- analyze：spec / plan / tasks / acceptance / decisions 是否一致？

人工等价不是跳过流程，而是用人工方式完成同样的质量判断。

## 推荐使用规则

Level A：

- 不使用完整 tooling。
- 说明修改范围和验证方式即可。

Level B：

- 默认不强制。
- 如果 mini spec 仍有歧义，可选择 clarify 或人工澄清。

Level C：

- 必须完成 clarify / checklist / analyze。
- 可使用 CLI、Codex skills、slash command 或人工等价。

Level D：

- 必须完成完整 Spec Kit 风格流程。
- 必须新增或更新 ADR。
- 必须更新 architecture docs。
- 必须人工 review。

## v0.3.2 Pilot 边界

v0.3.2 只验证双轨是否适合 AI Mind。

本版本不做：

- 不把 CLI 接入 `pnpm install`
- 不把 CLI 接入 CI 强制门
- 不要求所有开发者立刻安装 CLI
- 不要求所有小改都运行 tooling
- 不直接覆盖官方 CLI 生成文件

本版已用临时目录完成一次官方 CLI 试跑：

- `specify version` 成功，临时 checkout 版本显示为 `0.11.10.dev0`。
- `specify init <temp-project> --integration codex --integration-options="--skills" --ignore-agent-tools --script ps` 成功。
- 官方 CLI 生成 `.specify/`、PowerShell scripts、templates、workflows、agent-context extension 和完整 `.agents/skills/speckit-*`。
- 当前 AI Mind 仓库没有直接接收官方生成物。

如果后续要强制化，应使用官方 release tag 的 pinned install，而不是依赖临时 checkout 或 main branch dev version。

## 推荐人工安装验证记录

如果维护者决定试装官方 CLI，请在 PR 或交付说明中记录：

```text
Tool:
Version:
Install command:
Commands executed:
Files generated or modified:
Conflicts found:
Decision:
```

如果维护者决定试用 Codex skills，请记录：

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

- 回退到 v0.3.1 的人工等价流程
- 保留 `specs/`、ADR、architecture docs 作为正式事实源
- 不因为 tooling 不可用而阻塞业务版本开发
