# Spec Directory Naming

AI Mind 的 `specs/` 目录名优先表达真实版本归属，再表达 feature/topic，避免纯流水号隐藏版本信息。

推荐格式：

```text
specs/v0.4.10-resumable-agent-streams
specs/v0.4.10-1-stream-cancel-followup
specs/v0.5.0-release-plan
```

规则：

- 正式版本功能规格使用 `v<semver>-<feature-slug>`，例如 `v0.4.10-resumable-agent-streams`。
- 同一版本下的挂靠/补充规格可在版本号后加短序号，例如 `v0.4.10-1-stream-cancel-followup`；它表示“仍归属 v0.4.10，不是新版本”。
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
