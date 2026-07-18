# Decisions 048: Monorepo pnpm and Turborepo Governance

**Status**: Accepted  
**Version**: v0.4.8  
**Date**: 2026-07-17

## D-048-001: 采用方案 A 固定 pnpm 10.34.0

根 `packageManager`、CI 与 Docker 使用同一个精确版本 `pnpm@10.34.0`，Node.js 固定为 22.x。当前不迁移 pnpm 11，避免把包管理器主版本升级与 Monorepo 治理混在同一版本。

## D-048-002: dependency build scripts 使用显式 boolean policy

`allowBuilds` 不保留占位值，也不做全量批准。每个当前依赖脚本都基于实际 build/runtime 需要标记 `true` 或 `false`；发现新脚本时默认 fail closed，审查后再更新。

## D-048-003: Catalog 选择性集中共享依赖

集中公共工具链和多个 workspace 共享且兼容的 runtime dependencies；不集中单应用依赖。`@types/node` 统一为精确版本 `22.20.1`，与项目 Node.js 22 runtime 对齐。根 `pnpm.overrides` 将传递依赖中的 `@types/node` 一并约束到该版本，避免直接依赖和 lockfile peer snapshot 出现双轨。

## D-048-004: Turborepo 是根任务入口，pnpm filter 是诊断入口

根 lint、typecheck、test、build、dev/watch 由 Turborepo 负责任务图。package-level scripts 和 `pnpm --filter` 保留用于缩小故障范围，不维护第二套 canonical orchestration。

## D-048-005: CI 普通任务迁移到 Turbo，副作用步骤保持显式

CI 的 lint、typecheck、test、build 与本地执行同一任务图。Prisma generate、migration 和 runtime checkpoint setup 继续在图外按固定顺序运行；本版不启用 affected-only execution 或 remote cache。

## D-048-006: 缓存只用于可证明可复用的任务

stream-core 与 PAS tests 可缓存；database 和当前 Webapp tests 读取数据库或可选外部服务，不缓存。dev/watch、Prisma generation、migration 与 checkpoint setup 同样不允许从通用缓存恢复。

## D-048-007: 内部依赖边界在安装前执行验证

内部 `@ai-mind/*` 始终视为本地 package namespace。validator 同时检查 `workspace:`、provider 完整性和 `packages -> apps` 方向；即使 provider 缺失，也不能让普通 semver 静默回退到 registry。

## D-048-008: 生产部署契约保持不变

Docker builder 改用根 Turbo graph，但 runner contracts、TCR image names、Compose、env、secret sync、数据库 setup 与服务器脚本保持不变。首次构建缓存失效属于构建性能变化，不是部署流程变化。

## Deferred Decisions

- affected-only CI 与 remote cache。
- Changesets、npm publishing 与 package release automation。
- pnpm 11、`pnpm deploy`、Nx 与 Docker image slimming。
- 大规模 shared package extraction。
