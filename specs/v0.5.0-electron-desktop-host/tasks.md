# Tasks：AI Mind Desktop Host Public Beta

**输入**：`spec.md`、`plan.md`、`research.md`、`data-model.md`、`quickstart.md` 与 `contracts/desktop-preview-release.md`
**负责人划分**：Agent 完成仓库代码、Workflow、文档和验证；维护者完成生产部署、生产验证和最终平台 smoke。

## Phase 1：现有实现基线

- [x] T001 [P] 保留 `apps/desktop/` 与 `apps/webapp/` 中已经通过验证的 Electron 宿主、固定生产 Origin、compatibility API、recovery、安全策略、profile、fuse 和包审计。
- [x] T002 [P] 保留 `.github/workflows/ci.yml` 中 Windows x64 与原生 macOS arm64 CI 验证，并确保不发布制品。
- [x] T003 [P] 确认 `package.json`、Turbo 和 `scripts/validate/` 中的桌面单元/集成测试及仓库治理测试入口继续可用。

## Phase 2：公开 Beta 契约与元数据

- [x] T004 [P] 按最终公开 GitHub Pre-release 与 Unsigned Experimental Preview 范围重写 `specs/v0.5.0-electron-desktop-host/spec.md`。
- [x] T005 [P] 重写 `plan.md`、`research.md`、`data-model.md`、`quickstart.md`、`acceptance.md`，只保留最终 public-beta 决策。
- [x] T006 [P] 更新 `contracts/desktop-preview-release.md` 与 release checklists，定义公开 Pre-release 资产、维护者门禁和未签名安装说明。
- [x] T007 更新 `apps/desktop/src/main/build-config.ts`、`apps/desktop/scripts/release-artifact-utils.mjs`、`release-artifact-utils.d.mts` 及单元测试，将 `distribution` 改为 `public-beta`，保留 `signing: unsigned`。
- [x] T008 [P] 更新 `apps/desktop/src/main/application-menu.ts` 与 `apps/desktop/src/recovery-renderer/index.html` 的用户可见文案，标明 Unsigned Experimental Preview 和 GitHub Pre-release。

## Phase 3：手动公开发布 Workflow

- [x] T009 新增 `.github/workflows/desktop-public-preview.yml`，使用 `workflow_dispatch`、source commit/tag 输入和 `production_verified` 确认。
- [x] T010 [US1] 在原生 runner 构建并审计 Windows x64、macOS arm64 制品，生成 manifest/checksum，并在 Workflow 中生成平台安装说明。
- [x] T011 [US1] 通过 Actions artifact 传递两个已审计目录，并使用 `gh release create --prerelease` 创建一个公开 GitHub Pre-release；发布 job 不得包含部署或生产 secret 操作。
- [x] T012 [P] 在 `scripts/validate/validate-ci-workflow.test.mjs` 增加 Workflow 治理回归，锁定手动触发、确认门禁、Pre-release 和部署隔离。

## Phase 4：公开文档与法律资产

- [x] T013 [P] 新增根目录 `LICENSE`（MIT），并更新 `README.md` 的公开 Beta 下载范围、checksum 校验、SmartScreen/Gatekeeper、在线运行和不支持架构说明。
- [x] T014 [P] 更新 `docs/adr/0017-secure-electron-desktop-host.md`、`docs/architecture/desktop-host.md`、`docs/versions/v0.5.0-electron-desktop-host.md`、`docs/releases/v0.5.0.md` 和 `docs/tasklists/v0.5.0-electron-desktop-host-tasklist.md`，删除内部-only 发布措辞并同步最终 public-beta 决策。

## Phase 5：维护者发布门禁（外部负责人）

- [ ] T015 维护者已将 v0.5.0 合并到 `main` 并部署最新代码；仍需运行生产兼容性/header verifier，记录脱敏证据（FR-003）。
- [ ] T016 T015 通过后，维护者手动运行 `Desktop public beta release`，使用同一 source commit、release tag 和 `production_verified=true`，确认 Release 资产完整（FR-001、FR-002、SC-001）。
- [ ] T017 维护者使用公开制品分别完成 Windows x64 与 macOS arm64 fresh-install smoke，包括 checksum、未签名放行、启动/recovery 和一次普通聊天，并写回 `acceptance.md`（FR-006、SC-004）。

## Phase 6：最终验证与收敛

- [x] T018 运行 `pnpm --filter @ai-mind/desktop test:stable`、`node --test scripts/validate/validate-ci-workflow.test.mjs`、`pnpm lint`、`pnpm typecheck` 和 `git diff --check`；不得伪造外部证据。
- [x] T019 对当前 canonical workspace 执行 Spec Kit analyze/converge，只追加真实剩余任务，并保持维护者门禁为外部负责人任务。

## Dependencies & Execution Order

`T001-T003` → `T004-T008` → `T009-T012` → `T013-T014` → 维护者 `T015` → 维护者 `T016-T017` → `T018-T019`。

T004-T006、T008、T012-T014 在不修改同一文件时可并行。T015-T017 不得由 Agent 模拟执行。

## Implementation Strategy

先交付最小公开试用路径：保留已通过测试的桌面宿主，只增加公开发布 Workflow 和清晰安装说明；维护者完成服务端门禁和真实 fresh-install smoke 后，再把 Pre-release 视为可体验 Beta。
