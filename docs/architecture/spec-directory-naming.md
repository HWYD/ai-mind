# Spec Directory Naming

## Canonical Workspace Continuity

目录命名不能替代版本工作区生命周期。以下规则优先于后文的挂靠目录示例：

- 同一 `vX.Y.Z` 在 release closing / merge 之前只能有一个 canonical feature directory。
- 代码、规格或 tasks 尚未收口时，后续需求、返工和方案冲突必须回写当前目录；不得自动创建 `vX.Y.Z-1-*` 或 `vX.Y.Z-2-*` sibling directory。
- `vX.Y.Z-1-*` 只表示经用户明确授权的独立 follow-up，或基准版本已完成 release closing 后的新开发窗口；它不是普通的“继续修改当前版本”目录。
- `.specify/feature.json` 的 `feature_directory` 是 Spec Kit 操作的当前工作区指针。已有指针且 semver 与当前任务一致时，所有 Spec Kit skill 必须复用该目录。
- 需求或方案冲突时，最终事实在 canonical directory 内收口；旧内容应删除、改写或标记为 `superseded`，不要用 sibling directory 保留第二套默认事实。

AI Mind 的 `specs/` 目录名优先表达真实版本归属，再表达 feature/topic，避免纯流水号隐藏版本信息。

推荐格式：

```text
specs/v0.4.10-resumable-agent-streams
specs/v0.4.10-1-stream-cancel-followup
specs/v0.5.0-release-plan
```

规则：

- 正式版本功能规格使用 `v<semver>-<feature-slug>`，例如 `v0.4.10-resumable-agent-streams`。
- 同一版本下的挂靠/补充规格只有在基准版本 release closing 后或用户明确授权独立 follow-up 时，才可在版本号后加短序号，例如 `v0.4.10-1-stream-cancel-followup`；它表示“仍归属 v0.4.10，不是新版本”。
- 整版规划可使用 `v<semver>-release-plan`，例如 `v0.5.0-release-plan`。
- `spec.md` 内继续保留真实 semantic version，例如 `Version: v0.4.10`；目录名前缀也使用真实 semver，优先保证人能一眼识别版本。
- 新版本工作区避免使用 `050-*` 这类纯 sequence 命名，因为它不利于快速判断版本归属。

排序说明：

- 如果 `specs/` 目录需要严格排序，优先通过文档索引、release note 或 tooling 解决。
- 不为了字典序牺牲版本号可读性；版本规格目录首先是人工协作入口，其次才是机器排序键。

已迁移示例：

- `048-monorepo-pnpm-turborepo-governance` → `v0.4.8-monorepo-pnpm-turborepo-governance`
- `049-monorepo-boundary-ci` → `v0.4.9-monorepo-boundary-ci`
- `v0-04-10-resumable-agent-streams` → `v0.4.10-resumable-agent-streams`
