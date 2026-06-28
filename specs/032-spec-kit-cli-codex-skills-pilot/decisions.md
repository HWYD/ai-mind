# 决策 032：Spec Kit CLI + Codex Skills Dual-track Pilot

状态：已完成
版本：v0.3.2
日期：2026-06-28

## D032-01：采用 CLI + Codex skills 双轨

AI Mind 不在 CLI 与 skills 之间二选一。

CLI 更适合贴近官方 Spec Kit 标准流程；Codex skills 更适合在 Codex 环境中降低重复提示词成本。两者服务同一套 `specs/` 工作区。

## D032-02：CLI 和 skills 都不是事实源

事实源仍按仓库优先级判断：

1. 用户明确要求
2. 当前代码与测试
3. constitution
4. `specs/`
5. ADR 与 architecture docs
6. README 与公开版本资料

CLI 和 skills 是执行工具，不替代事实源。

## D032-03：人工等价路径必须长期保留

外部 tooling 可能因为网络、权限、版本、账号或平台差异不可用。AI Mind 不能把复杂版本开发完全绑定到某个本地工具状态。

因此，即使未来 CLI / skills 成为推荐入口，也必须保留人工等价 clarify / checklist / analyze。

## D032-04：v0.3.2 不接 CI 强制门

本版本是 pilot，不在 CI 中强制检查 CLI 产物，也不因缺少 CLI / skills 阻断 PR。

是否强制化留给后续版本，根据真实使用体验决定。

## D032-05：不混淆 Codex skills 与产品 Skill Runtime

Codex skills 是开发者工具层能力，位于 `.agents/skills/` 或 Codex 环境中。

AI Mind 产品内 Skill Runtime 是 webapp runtime 的用户能力层。两者名字相似，但职责完全不同，文档必须区分。

## D032-06：不让小改变重

Level A / B 继续保持轻量。CLI + skills 双轨主要服务 Level C / D，不扩展成所有任务必跑的仪式。

## D032-07：官方生成文件必须先 review

如果后续使用 `specify init` 或其他官方命令生成文件，必须先检查 diff，再决定合并、改写或丢弃。

禁止直接覆盖已有 constitution、specs、ADR、AGENTS 或 project-specific rules。

## D032-08：v0.3.3 再决定是否强制化

v0.3.2 只回答“能否双轨跑通、是否降低负担、是否与现有规则兼容”。

是否升级为团队默认必装、必跑、CI 强约束，放到 v0.3.3 或后续治理版本判断。

## D032-09：官方 CLI 试跑采用临时安装，不改当前仓库

本版已试跑官方 Spec Kit CLI，但采用低风险方式：

- 从官方 `github/spec-kit` 仓库拉取临时 checkout。
- 使用 Codex bundled Python 安装到临时目录。
- 通过 `specify version` 验证 CLI 可运行。
- 在临时项目目录执行 `specify init ... --integration codex --integration-options="--skills" --script ps`。

该试跑只用于验证官方 CLI 和 Codex skills 的产物形态，不代表当前仓库已经采用官方生成物。

## D032-10：AI Mind 本地 skills 是 lightweight pilot，不是官方完整替代品

当前仓库内的 `.agents/skills/speckit-clarify`、`speckit-checklist`、`speckit-analyze` 是贴合 AI Mind 现有 specs / ADR / architecture docs 的 lightweight pilot skills。

官方 CLI 生成的是完整 Spec Kit skills 套件，包含 `speckit-constitution`、`speckit-specify`、`speckit-plan`、`speckit-tasks`、`speckit-implement`、`speckit-converge`、`speckit-clarify`、`speckit-checklist`、`speckit-analyze` 等。

v0.3.2 不直接用官方生成物覆盖当前本地 skills。后续如果要引入官方完整套件，必须先比较职责、diff 和 AI Mind 项目约束，再决定保留、替换或合并。

## D032-11：当前不把 dev checkout 版本作为团队基线

本版试跑得到的 CLI 版本来自临时 checkout，显示为 `0.11.10.dev0`。

如果 v0.3.3+ 要把 CLI 升级为团队默认必装，应改用官方 release tag 的 pinned install，而不是依赖 main branch 或 dev checkout。

## D032-12：双轨策略被接受，强制化仍延期

用户已接受 v0.3.2 的推荐策略：

- 真实试跑官方 CLI。
- 不允许自动覆盖现有规则。
- Codex skills gate 作为本版正式验收的一部分。
- 本版只做 pilot，不升级为团队强制默认。
- 是否强制安装、是否接入 CI，留给 v0.3.3 再判断。
