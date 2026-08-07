# Implementation Plan: AI Mind Desktop Host Public Beta

**版本**：`v0.5.0`
**规格**：[spec.md](./spec.md)

## Technical Context

- 技术栈：TypeScript、Node.js 22、pnpm/Turborepo、Electron 43.2.0、Electron Forge 7.11.2。
- 桌面宿主位于 `apps/desktop`；兼容性 API 和安全响应头位于 `apps/webapp`。
- 现有 CI 已在 Windows x64 和原生 macOS arm64 runner 上验证打包、fuse、SHA-256 与 ASAR 内容，且不上传制品。
- 新增独立的 `.github/workflows/desktop-public-preview.yml`，只允许 `workflow_dispatch`。
- 生产部署仍由维护者执行；Workflow 只接收维护者在部署和生产 verifier 通过后的确认输入。

## Architecture and Boundaries

1. **构建**：从一个 source commit checkout，在对应原生 runner 构建；复用现有 Forge maker、product identity、固定 Origin、fuse 和审计脚本。
2. **证据**：将安装包复制到 staging 目录，生成 `desktop-release.json` 与 `<installer>.sha256`，并在上传前验证真实包内容和 fuse wire。
3. **发布**：Windows/macOS job 通过 Actions artifact 传递审计后的目录，最后由 Ubuntu job 使用 `GITHUB_TOKEN` 和 `gh release create --prerelease` 创建一个公开 Pre-release。
4. **安全门禁**：所有发布 job 必须满足 `production_verified == 'true'`；Workflow 不得包含部署、SSH、TCR 或生产 secret 操作。
5. **用户说明**：Release 和平台说明统一使用 `Unsigned Experimental Preview`，解释 SmartScreen/Gatekeeper、在线运行和无自动更新。

## Data and Contract Changes

- `DesktopBuildConfig.distribution` 与 `DesktopPreviewManifest.distribution` 改为 `public-beta`。
- `signing` 仍为 `unsigned`。
- 使用 [contracts/desktop-preview-release.md](./contracts/desktop-preview-release.md) 约束公开 Release 资产。
- `desktop-release.json` 只是证据 manifest，不是更新源；不得包含下载 URL、secret、用户数据或可变配置。

## Implementation Phases

### Phase 0 — Research and decision closure

记录 GitHub Actions 的 `workflow_dispatch`、artifact upload/download 和 `gh release create --prerelease` 用法，以及两平台系统放行指引；从 canonical 规格中删除已废弃的内部-only 发布决策。

### Phase 1 — Contract and metadata

更新 spec、plan、data model、release contract、acceptance ledger、运行时 distribution 枚举、manifest 校验、单元测试和 About/recovery 文案。

### Phase 2 — Public release workflow

实现原生 Windows/macOS 构建 job、维护者确认门禁、现有审计、跨 job 资产传递和 GitHub Pre-release 发布 job；补充 Workflow validator 回归测试。

### Phase 3 — Public documentation and legal asset

补充根目录 MIT `LICENSE`、README 下载/安装说明和公开 release/version/tasklist 文档；生产部署命令与生产证据继续标记为维护者任务。

### Phase 4 — Verification and convergence

执行桌面测试、Workflow validator、lint/typecheck、`git diff --check` 以及 Spec Kit analyze/converge；不得伪造生产部署或人工 smoke 证据。

## Verification Matrix

| 层级                | 命令/证据                                                    |
| ------------------- | ------------------------------------------------------------ |
| Desktop unit        | `pnpm --filter @ai-mind/desktop test:stable`                 |
| Workflow governance | `node --test scripts/validate/validate-ci-workflow.test.mjs` |
| 仓库质量            | `pnpm lint`、`pnpm typecheck`、`git diff --check`            |
| 平台打包            | 现有 CI job 与手动 public-beta Workflow                      |
| 生产                | 维护者执行现有部署路径和 `verify-production.sh`              |

## Risks and Mitigations

- 未签名制品会触发系统警告：提供针对当前应用的明确操作，不建议全局关闭系统保护。
- 未验证服务端就公开发布：使用显式 `production_verified` 门禁，部署仍在 Workflow 外完成。
- 平台制品混淆：分平台传递独立 artifact，并在发布前校验 manifest 的 platform/source commit。
- 用户误认为稳定版：使用 GitHub Pre-release 和多处 `Unsigned Experimental Preview` 标识。
