# Acceptance 048: Monorepo pnpm and Turborepo Governance

**Status**: Accepted  
**Version**: v0.4.8  
**Date**: 2026-07-17

## Release Gate

- [x] 根 metadata、CI 与 Docker 统一使用 Node.js 22.x 和 `pnpm@10.34.0`
- [x] frozen install 使用现有单一 lockfile，安装不会产生意外 lockfile drift
- [x] 内部 package 使用 `workspace:`，provider 缺失、普通 semver 和 `packages -> apps` 反向依赖会 fail fast
- [x] dependency build scripts 均有显式 boolean `allowBuilds` 决策和仓库内理由
- [x] Catalog 集中兼容的共享依赖，`@types/node@22.20.1` 与 Node.js 22 runtime 对齐，Webapp-only 依赖保持本地管理
- [x] 根 lint、typecheck、test、build 通过同一 Turbo task graph 执行
- [x] Prisma generation、migration、checkpoint setup 和非 hermetic tests 不会复用不适用的缓存
- [x] package-level commands 继续作为诊断入口
- [x] CI 普通检查与本地使用同一任务图，数据库 setup 保持显式顺序
- [x] Docker 仍产出原有三个 production image targets，线上部署契约不变
- [x] ordinary chat、tool-assisted chat、Tasklist 与 Delivery 旧链路没有业务行为变化
- [x] `--affected`、remote cache、Changesets、pnpm 11、`pnpm deploy`、Nx 与 Docker slimming 未越界实现
- [x] README、architecture、version、release、tasklist 与 lockstep package version 已完成 v0.4.8 收口

## Acceptance Matrix

| Criterion  | Evidence                                                                                                                  | Result |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| SC-048-001 | pnpm 10.34.0 执行 `pnpm install --frozen-lockfile`；preinstall validator 校验 4 个 workspace；lockfile 无新增 drift       | Passed |
| SC-048-002 | 根 `pnpm lint` 4/4、`pnpm typecheck` 6/6、`pnpm test` 6/6、`pnpm build` 4/4                                               | Passed |
| SC-048-003 | controlled stream-core change 与 Turbo graph evidence 显示 upstream package task 先于 dependent Webapp                    | Passed |
| SC-048-004 | database、stream-core、PAS、Webapp package-level diagnostic commands                                                      | Passed |
| SC-048-005 | `pnpm-workspace.yaml` 中 7 个 build-script decisions 均为 boolean；frozen install 与实际 package/Docker builds 无阻塞脚本 | Passed |
| SC-048-006 | architecture doc 包含 stream-core → Webapp 的 pnpm package graph + Turbo task graph 完整示例                              | Passed |
| SC-048-007 | package regressions、65 个 product smoke tests、PostgreSQL integration 与三个 Docker targets                              | Passed |

## Validation Evidence

- [x] Workspace boundary regression：4/4 passed，组合错误会同时报告普通 semver 与 provider 缺失。
- [x] Lint：4 workspace tasks passed，0 errors；保留 5 个既有 Fast Refresh warnings。
- [x] Typecheck：6/6 tasks passed，database typecheck 在 Prisma generation 后执行。
- [x] Current no-database test run：6/6 tasks passed；Webapp 739 tests passed，14 个 database integration tests 和 6 个 cloud/live smoke tests 按既有 gate skipped；stream-core 22 tests 与 PAS 8 tests passed。
- [x] PostgreSQL+pgvector closure run：migration、Tasklist/Chat/UserMemory runtime setup、database 2/2 integration tests 与 Webapp database-backed paths passed；Webapp 完整结果为 753 passed、仅 6 个 cloud/live smoke skipped。
- [x] Build：4/4 tasks passed，Next.js production build、PAS build、stream-core build 与 Prisma Client generation 均成功。
- [x] Docker：Webapp runner、Project Assistant Service runner、PostgreSQL+pgvector 三个 image targets built successfully。
- [x] Repository gates：Prettier check、版本一致性、发布链接目标和 `git diff --check` passed。

## Deployment Acceptance

- [x] TCR image names、release metadata、Compose services、production env 与 secrets sync 无变化。
- [x] `deploy-production.sh` 继续在应用启动前执行 `db:setup:deploy`。
- [x] 本版只改变镜像内部的 pnpm 版本和 workspace build orchestration；不需要新增线上操作步骤。

## Manual Scope Guardrail

- [x] 不修改业务 Runtime、API、DTO、stream protocol、database schema 或 UI。
- [x] 不扩大 Agent、Tool、Skill、MCP 或 Resource 权限。
- [x] 不把 migration、checkpoint setup 或数据库状态隐藏进可缓存任务。
- [x] 不删除 package-level 故障定位入口。
