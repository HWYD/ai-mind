# 生产部署规则

## 目标

避免生产部署信息散落在聊天上下文、旧脚本、README、release note 和临时说明里，导致不同线程或不同时间拿到不一致的发布流程。

生产部署事实源是：

```text
docs/architecture/production-deployment.md
```

## 必读文件

涉及生产部署、GitHub Actions、TCR、Docker Compose、服务器 env、pgvector、数据库 setup、部署脚本或 secrets sync 时，先读：

- `docs/architecture/production-deployment.md`
- `.github/workflows/docker-release.yml`
- `.github/workflows/ci.yml`
- `deploy/compose.production.yml`
- `deploy/scripts/deploy-production.sh`
- `deploy/scripts/verify-production.sh`
- `deploy/env/*.production.env.example`
- `scripts/ops/*.ps1`

## 必须同步的改动

修改以下任意文件或行为时，必须同步检查 `docs/architecture/production-deployment.md`：

- `.github/workflows/*`
- `deploy/compose.production.yml`
- `deploy/scripts/*`
- `deploy/env/*.example`
- `deploy/*Dockerfile`
- `scripts/ops/*`
- 根 `package.json` 或 `apps/webapp/package.json` 中的 `db:*` setup 脚本
- 生产 env requirement
- 数据库、checkpoint、UserMemory Store、pgvector 或 embedding provider 部署要求

## 成组检查

- 改 GitHub Actions 镜像 tag 策略时，必须检查 `deploy-production.sh` 和 `.release.env` contract。
- 改 production Compose 时，必须检查 `verify-production.sh`。
- 改 production env requirement 时，必须检查 `deploy/env/*.example`、`scripts/ops/sync-production-env.ps1` 和部署文档。
- 改数据库 setup 时，必须检查 `db:setup:deploy`、CI Postgres service、生产 Postgres 镜像和 release note。
- 改 pgvector / Postgres 相关内容时，必须确认生产 Compose 没有回退到普通 `postgres:16-bookworm`。

## 路径映射

仓库部署资产在 `deploy/` 下，服务器部署根目录是 `/srv/ai-mind`。

同步部署资产时，应该把仓库 `deploy/` 目录内容同步到服务器 `/srv/ai-mind`，所以服务器执行路径是 `/srv/ai-mind/scripts/deploy-production.sh`，不是仓库路径 `deploy/scripts/deploy-production.sh`。

## v0.4.6 后的硬约束

- 生产 Postgres 必须使用 pgvector-capable PostgreSQL 16 镜像。
- `Release (TCR)` 必须构建并推送 `ai-mind-postgres-pgvector`、`ai-mind-webapp` 和 `ai-mind-project-assistant-service` 三个镜像。
- GitHub Actions 正式 release 推荐使用 `sha-xxxxxxx` tag；本地 PowerShell 手动部署路径可以继续使用 `production` tag。
- 本地 PowerShell 手动部署路径必须构建并推送 `ai-mind-postgres-pgvector`、`ai-mind-webapp` 和 `ai-mind-project-assistant-service` 三个 `production` 镜像。
- `UserMemory` semantic retrieval 的生产 env 必须包含 `AI_MIND_DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3` 和 `AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS=1024`，除非后续版本明确重新设计。
- `db:setup:deploy` 必须覆盖 Prisma migration、Tasklist checkpoint、chat memory 和 UserMemory Store setup。

## 两条正式链路约束

如果用户没有明确批准，后续部署相关改动只能发生在下面两条正式链路内：

- GitHub Actions Release (TCR) -> server deploy
- Local PowerShell Ops -> TCR -> server deploy

约束：

- 不得绕开这两条链路，额外新增第三条正式部署路径。
- 不得把某条现有正式链路静默改废，导致既有正式操作方式失效。
- 不得因为某个版本功能需要，就直接脱离当前部署事实源另写一套发布流程。
- 需要补步骤时，优先作为这两条链路中的最小增量修改处理。

## Secrets 边界

默认本地生产 secrets 目录是：

```text
D:\secrets\ai-mind\production
```

规则：

- 不读取或输出真实 secret 内容，除非用户明确要求排查 env。
- 可以检查文件是否存在、文件名、更新时间和是否缺失。
- 不能把真实 secret 写入 docs、README、specs、logs、测试 fixture 或 assistant 输出。
- GitHub Actions 不应持有模型 API Key、MCP Token、数据库密码或 SSL 私钥。

## PowerShell Ops 状态

`scripts/ops/sync-production-env.ps1` 可以继续作为 env 同步工具。

`scripts/ops/release-production-local.ps1 -Deploy -SyncEnv` 是允许的本地手动部署路径。该路径保留 v0.4.5 之前的本地一键发布习惯，但必须补齐 v0.4.6 的 pgvector Postgres 镜像、三镜像 `.release.env` 和 deploy 资产同步。

如果后续继续调整 PowerShell ops，优先保持它们围绕下面步骤组织：

```text
build and push three production images
write local .release.env
sync deploy assets
sync env when -SyncEnv is enabled
remote deploy
```

不要让 PowerShell 本地部署路径重新退化成双镜像、缺少 pgvector Postgres 或不同步 deploy 资产的旧状态。
