# Monorepo pnpm and Turborepo Governance

## Summary

AI Mind 使用 pnpm 管理 workspace、依赖解析、单一 lockfile、Catalog 和依赖安装脚本权限；使用 Turborepo 管理跨 workspace 的任务依赖、并行执行、输出与缓存。根目录命令是日常开发和 CI 的标准入口，package-level 命令继续作为诊断入口。

本阶段固定 Node.js 22.x 与 `pnpm@10.34.0`。`--affected`、远程缓存、Changesets、npm publishing、`pnpm deploy`、Nx 迁移和大规模 package extraction 均不在本阶段。

## Workspace Graph

```text
apps/webapp (ai-mind)
  -> packages/database (@ai-mind/database)
  -> packages/stream-core (@ai-mind/stream-core)

apps/project-assistant-service (project-assistant-service)

packages/database (@ai-mind/database)
packages/stream-core (@ai-mind/stream-core)
```

依赖方向是 `apps -> packages`。当前和未来的 shared package 都不得反向依赖 application。内部 `@ai-mind/*` 依赖必须使用显式 `workspace:` protocol，预期本地包缺失时安装必须失败，不允许静默回退到 registry 同名包。

根 `preinstall` 会执行 `scripts/validate/validate-workspace-boundaries.mjs`。这是对 frozen lockfile 可能复用悬空 `link:` 的补充保护：它扫描实际 workspace manifests，拒绝缺失的 `workspace:` provider、指向本地 workspace 却使用普通 semver 的依赖，以及 `packages -> apps` 反向依赖。

`@ai-mind/*` 命名空间始终视为内部 package，即使对应 provider 目录同时缺失，也必须同时报告普通 semver 和 provider 缺失两类违规。`pnpm test:workspace-boundaries` 固定覆盖正常路径、两个独立错误和二者同时出现的组合错误。

## Tool Ownership

| Concern                                       | Owner                 | Rule                                             |
| --------------------------------------------- | --------------------- | ------------------------------------------------ |
| Workspace discovery and local package linking | pnpm                  | `apps/*`、`packages/*` 与 `workspace:*`          |
| Reproducible dependency resolution            | pnpm                  | 单一 `pnpm-lock.yaml` 与 frozen install          |
| Shared dependency versions                    | pnpm Catalog          | 仅集中兼容且有多个消费者的版本                   |
| Dependency install scripts                    | pnpm `allowBuilds`    | 每项显式 `true`/`false`，默认不扩大权限          |
| Task dependency order and parallelism         | Turborepo             | 以 package graph 和 `turbo.json` 生成 task graph |
| Task outputs and local cache                  | Turborepo             | 只缓存可复用的有限任务输出                       |
| Migrations and checkpoint setup               | Explicit pnpm scripts | 显式、有序、不可从 Turbo cache 恢复              |

## Canonical and Diagnostic Commands

| Purpose                        | Canonical root command           | Diagnostic alternative                                                            |
| ------------------------------ | -------------------------------- | --------------------------------------------------------------------------------- |
| Lint                           | `pnpm lint`                      | `pnpm --filter <workspace> lint` 或 `pnpm lint:root`                              |
| Typecheck                      | `pnpm typecheck`                 | `pnpm --filter <workspace> typecheck`                                             |
| Test                           | `pnpm test`                      | `pnpm --filter <workspace> test`                                                  |
| Build                          | `pnpm build`                     | `pnpm --filter <workspace> build`                                                 |
| Workspace boundary regression  | `pnpm test:workspace-boundaries` | `pnpm validate:workspace-boundaries` for current manifests                        |
| Webapp with dependency watches | `pnpm dev`                       | `pnpm dev:webapp`、`pnpm build:watch`                                             |
| PAS development                | `pnpm dev:pas`                   | `pnpm --dir apps/project-assistant-service dev`                                   |
| Database setup                 | No cached aggregate task         | `pnpm db:generate`、`pnpm db:migrate:deploy`、`pnpm db:runtime-checkpoints:setup` |

Root `build`、`typecheck`、`test`、`lint` 通过 Turborepo 执行。`pnpm dev` 运行 `turbo run dev build:watch --filter=ai-mind...`，选择 Webapp 及其依赖；PAS development 保持独立诊断入口。

## Catalog Policy

| Dependency                  | Version   | Consumers                     | Owner and rationale                                |
| --------------------------- | --------- | ----------------------------- | -------------------------------------------------- |
| `@types/node`               | `22.20.1` | root、Webapp、PAS             | Repository maintainers；与 Node.js 22 runtime 对齐 |
| `typescript`                | `5.9.3`   | root、Webapp、PAS             | Repository maintainers；统一编译器语义             |
| `vitest`                    | `^4.1.4`  | Webapp、database、stream-core | Repository maintainers；统一测试运行器主版本       |
| `zod`                       | `^4.3.6`  | Webapp、PAS                   | Repository maintainers；共享 runtime schema 兼容线 |
| `@modelcontextprotocol/sdk` | `^1.29.0` | Webapp、PAS                   | Repository maintainers；统一 MCP contract 依赖     |
| `dotenv`                    | `17.2.3`  | Webapp、database              | Repository maintainers；统一 env loader 行为       |

Next.js、React、UI/editor 等 Webapp-only dependencies 保留在 Webapp manifest。`@types/node` 已统一到 Node.js 22 类型线；根 `pnpm.overrides` 会把传递依赖中的 `@types/node` 解析也压到根声明版本，避免 lockfile 在 Node 22 runtime 下残留 Node 25 类型快照。其余保留的版本例外必须有明确兼容性依据。

## Dependency Build Script Policy

`allowBuilds` 以 lockfile 和已安装 package scripts 为证据。`true` 仅用于准备项目实际需要的平台二进制或 engine；提示、自动配置和可由仓库约束替代的检查脚本不执行。

| Package           | Allowed | Evidence and rationale                                                               |
| ----------------- | ------: | ------------------------------------------------------------------------------------ |
| `@nestjs/core`    | `false` | `postinstall` 仅运行 OpenCollective 提示，不产生 runtime artifact                    |
| `@prisma/engines` |  `true` | `postinstall` 准备 Prisma engine，database generate/validate 需要                    |
| `esbuild`         |  `true` | `postinstall` 校验/准备当前平台二进制，tsup/Vite build 需要                          |
| `msw`             | `false` | `postinstall` 仅在 consumer 声明 workerDirectory 时自动复制 worker；本仓库没有该配置 |
| `prisma`          | `false` | `preinstall` 只做 Node compatibility 检查；Node 22 已由仓库、CI、Docker 固定         |
| `sharp`           |  `true` | `install` 校验可用 libvips/native binary，Next production build/runtime 需要         |
| `unrs-resolver`   |  `true` | `postinstall` 校验当前平台 N-API resolver binding，ESLint resolver 需要              |

发现新的 dependency build script 时必须 fail closed，审查脚本内容、lockfile 来源和实际调用链后再增加显式决策；不得使用全量批准绕过安装失败。

## Task Graph and Cache Policy

- `build` 依赖 upstream `^build`，输出包括 `.next/**`、`dist/**`、`build/**` 和生成目录。
- `typecheck` 依赖 upstream `^build`，确保依赖包产物可用；`@ai-mind/database#typecheck` 还依赖同包 `build`，避免在干净工作区中读取尚未生成的 Prisma Client。
- `test` 和 `lint` 是有限任务；当前命令不生成 coverage artifact，因此声明空 outputs。stream-core 与 PAS 的测试不读取外部状态，可以缓存任务结果与日志。
- `@ai-mind/database#test` 依赖同包 `build` 且不缓存；Webapp 的现有 `test` 脚本混合了纯单测、PostgreSQL integration 和 cloud/live smoke，因此 `ai-mind#test` 也不缓存。数据库内容和远端服务响应不进入稳定 hash，在拆分出独立 hermetic unit-test task 之前，不复用这两个 workspace 的测试结果。
- `dev` 与真正的 watch task 是 persistent 且 `cache: false`。
- `@ai-mind/database` 的 `build`/`build:watch` 执行 Prisma generate，属于 side-effect-sensitive task，始终 `cache: false`；其 `build:watch` 是一次性兼容入口，不标记 persistent。
- migration、checkpoint setup 和数据库状态不进入可复用 task cache。

Turbo hash 覆盖 workspace source、package manifest、lockfile、workspace config、Turbo config 与声明的环境变量。环境或生成文件语义变化时，应修正 inputs/env，而不是全局关闭缓存。

## Complete Example: stream-core to Webapp

Webapp 在 `apps/webapp/package.json` 中以 `workspace:*` 依赖 `@ai-mind/stream-core`。pnpm 负责把该依赖解析并链接到本地 `packages/stream-core`；如果目录缺失，frozen install 失败。

执行 `pnpm build` 时，Turbo 从同一 package graph 看到 Webapp 依赖 stream-core，并通过 `build.dependsOn = ["^build"]` 先运行 `@ai-mind/stream-core#build`，产生 `packages/stream-core/build/**`，随后运行 `ai-mind#build`。因此 pnpm 决定“使用哪个包”，Turbo 决定“相关任务按什么顺序运行”。

## CI and Docker

CI 先 frozen install，再显式执行 Prisma generate、migration 和 runtime checkpoint setup，之后运行与本地一致的 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。数据库状态步骤不会隐藏在 Turbo cache 后。

Docker 使用 Node.js 22 和 `pnpm@10.34.0`。builder 通过根 `pnpm build` 使用相同 dependency-aware graph，production dependency stage 继续显式生成 Prisma client；镜像分层和现有 runner contract 不变。

## Failure Diagnosis

Turbo 输出使用 `<workspace>#<task>` 标识任务，例如 `@ai-mind/stream-core#build`。并行执行中任一任务失败时，最终命令必须返回非零状态，并保留失败 workspace 与 task 名称。随后使用对应 package-level 命令缩小范围，例如：

```powershell
pnpm --filter @ai-mind/stream-core build
pnpm --filter @ai-mind/database db:validate
pnpm --dir apps/webapp typecheck
```

若出现 stale cache，先检查 `inputs`、`outputs`、`env` 和 upstream dependency；若内部包缺失，修复 workspace；若 build script 未审批，更新显式策略。不要通过 registry fallback、全量 script approval 或全局禁用 cache 掩盖问题。

## Acceptance Evidence

| Check                         | Expected evidence                                              | Status                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version alignment             | Node 22.x；root/CI/Docker 均为 pnpm 10.34.0                    | Passed: Node 22.22.2, pnpm 10.34.0                                                                                                                |
| Frozen install                | 成功且 `pnpm-lock.yaml` 无意外变化                             | Passed: lockfile hash unchanged                                                                                                                   |
| Script policy                 | 7 项均为 boolean，无 placeholder，冻结安装和实际构建无阻塞脚本 | Passed: frozen install and all package/Docker builds completed under the explicit policy                                                          |
| Catalog                       | 6 个集中依赖，`@types/node` 与 Node.js 22 runtime 对齐         | Passed: lockfile Catalog metadata generated                                                                                                       |
| Task graph                    | stream-core build 在 Webapp build/typecheck 前；独立任务可并行 | Passed: controlled stream-core marker invalidated upstream and dependent Webapp tasks in order                                                    |
| Database generated dependency | database typecheck/test 在同包 Prisma generation 后执行        | Passed: isolated copy started without generated client; build generated it before both consumers, 3/3 tasks successful                            |
| Non-hermetic test cache       | database/Webapp test 不缓存；stream-core/PAS test 保留缓存     | Passed: root test showed database/Webapp cache bypass; isolated hermetic rerun was 2/2 cache hits                                                 |
| Root commands                 | lint/typecheck/test/build 均通过 Turbo                         | Passed: 4 lint, 6 typecheck, 6 test and 4 build tasks successful                                                                                  |
| Package regressions           | database、stream-core、PAS、Webapp 诊断命令通过                | Passed: database generate/validate; stream-core 22 tests/typecheck/build; PAS 8 tests/typecheck/build; Webapp typecheck plus root lint/test/build |
| Runtime smoke                 | ordinary chat、tool、Tasklist、Delivery                        | Passed: 4 targeted files, 65 tests                                                                                                                |

Long-running validation confirmed `pnpm dev` selects `ai-mind` plus database/stream-core dependencies and marks all selected tasks cache bypass. An existing user-owned Next dev process already held `.next/dev/lock`, so the validation instance used its failure output without terminating that process. `pnpm dev:pas` reached a healthy Nest startup, and `pnpm build:watch` reached Prisma generation plus stream-core watch mode; validation-owned process trees were then stopped with no remaining watcher.

Local validation had no PostgreSQL listener and no available Docker daemon, so migration/checkpoint setup and a real image build were not executed on that machine. Database integration tests used their existing environment gate and skipped 2 tests. CI retains the PostgreSQL service and explicit setup sequence; the Dockerfile was reviewed statically for validator availability, pnpm version alignment, root Turbo build and explicit production Prisma generation.
