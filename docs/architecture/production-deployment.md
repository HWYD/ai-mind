# Production Deployment

## Summary

本文档是 AI Mind 当前生产部署的事实源。凡是修改 GitHub Actions、TCR 镜像、Docker Compose、生产 env、部署脚本、pgvector、数据库 setup 或 secrets 同步，都必须同步检查本文档。

当前生产路线：

```text
GitHub Actions
  -> Tencent Cloud TCR
  -> Tencent Cloud server
  -> Docker Compose
  -> host Nginx
  -> webapp
```

生产环境由三类容器组成：

- `webapp`
- `project-assistant-service`
- `postgres`

v0.4.6 起，生产 `postgres` 必须使用 PostgreSQL 16 + `pgvector` 能力镜像。不能回退到普通 `postgres:16-bookworm`，否则 UserMemory semantic retrieval 的 `PostgresStore` vector setup 会失败。

## Source Of Truth

生产部署相关事实优先看这些文件：

- `.github/workflows/docker-release.yml`
- `.github/workflows/ci.yml`
- `deploy/compose.production.yml`
- `deploy/scripts/deploy-production.sh`
- `deploy/scripts/verify-production.sh`
- `deploy/postgres-pgvector.Dockerfile`
- `deploy/env/*.production.env.example`
- `scripts/ops/sync-production-env.ps1`
- `scripts/ops/deploy-production.ps1`
- `scripts/ops/release-production-local.ps1`

生产 secrets 不进入 git。当前本地生产 env 默认放在：

```text
D:\secrets\ai-mind\production
```

服务器真实 env 默认放在：

```text
/srv/ai-mind/env
```

GitHub Actions 不持有模型 API Key、MCP Token、数据库密码或 SSL 私钥。

## Repository And Server Path Mapping

仓库里的部署资产位于：

```text
deploy/
```

服务器上的部署根目录是：

```text
/srv/ai-mind
```

同步部署资产时，应把仓库 `deploy/` 目录下的内容同步到服务器 `/srv/ai-mind`。因此路径映射是：

```text
repo deploy/compose.production.yml          -> server /srv/ai-mind/compose.production.yml
repo deploy/scripts/deploy-production.sh    -> server /srv/ai-mind/scripts/deploy-production.sh
repo deploy/scripts/verify-production.sh    -> server /srv/ai-mind/scripts/verify-production.sh
repo deploy/env/*.production.env.example    -> server /srv/ai-mind/env/*.production.env.example
```

服务器执行部署命令时使用服务器路径，不是仓库路径。

## Current Topology

公网入口：

```text
Browser
  -> HTTPS
  -> host Nginx
  -> 127.0.0.1:3000
  -> webapp container
```

容器内访问：

```text
webapp
  -> http://project-assistant-service:8788/mcp
  -> project-assistant-service

webapp
  -> postgres:5432
  -> PostgreSQL 16 + pgvector
```

`project-assistant-service` 不映射宿主机端口，只在 Docker 内网暴露 `8788/tcp`。`postgres` 不映射宿主机 `5432`，只在 Docker 内网暴露 `5432/tcp`。`webapp` 只绑定 `127.0.0.1:3000->3000`。

## Recommended Release Flow

当前推荐主流程是：

1. 提交代码。
2. 通过 `v*.*.*` tag 或 workflow dispatch 触发 `Release (TCR)`。
3. GitHub Actions 构建并推送三个 TCR 镜像。
4. 同步仓库 `deploy/` 目录内容到服务器 `/srv/ai-mind`。
5. 同步生产 env 到服务器 `/srv/ai-mind/env`。
6. 在服务器执行 `/srv/ai-mind/scripts/deploy-production.sh`。
7. 运行 `verify-production.sh` 生产验收。
8. 做 UserMemory semantic retrieval 人工 smoke。

GitHub Actions 需要推送同一个 commit sha 对应的三个镜像：

```text
ai-mind-postgres-pgvector:sha-xxxxxxx
ai-mind-webapp:sha-xxxxxxx
ai-mind-project-assistant-service:sha-xxxxxxx
```

`production` tag 可以保留用于人工查看、旧 metadata 兼容和本地手动部署路径。GitHub Actions 正式 release 推荐使用 `sha-xxxxxxx` 作为不可变发布 tag；本地 PowerShell 手动部署路径可以继续使用 `production` tag，但必须同时构建并推送三个生产镜像。

## GitHub Actions Build Contract

`.github/workflows/docker-release.yml` 负责构建并推送生产镜像，不负责 SSH 部署。

Release workflow 必须满足：

- 登录 `ccr.ccs.tencentyun.com`。
- 使用 `TCR_USERNAME`、`TCR_PASSWORD`、`TCR_NAMESPACE`。
- 为 `webapp` 推送 `ai-mind-webapp:sha-xxxxxxx`。
- 为 `project-assistant-service` 推送 `ai-mind-project-assistant-service:sha-xxxxxxx`。
- 为 Postgres 推送 `ai-mind-postgres-pgvector:sha-xxxxxxx`。
- 可以同时推送 `production` tag，但不能只推送 `production` tag。

`.github/workflows/ci.yml` 必须在 Docker build checks 中构建 `deploy/postgres-pgvector.Dockerfile`，避免 release 才首次发现 pgvector 镜像构建问题。

普通 `lint`、`typecheck`、`test:stable`、`build` 检查通过根目录 Turborepo task graph 执行；`test:integration` 在 stable validation 成功后单独进入有状态通道。Prisma generate、migration 和 runtime checkpoint setup 继续在 graph 之前显式、有序执行，不得从 task cache 恢复数据库状态。

## Server Deploy Command

服务器上执行：

```bash
cd /srv/ai-mind

export TCR_NAMESPACE=<your-tcr-namespace>
export AI_MIND_IMAGE_TAG=sha-xxxxxxx
export PROD_DOMAIN=ai.hwyblog.cloud

bash scripts/deploy-production.sh
```

`deploy-production.sh` 当前职责：

- 校验生产 compose、env 和 verify 脚本存在。
- 校验 `TCR_NAMESPACE` 和 `AI_MIND_IMAGE_TAG`。
- 备份当前 `.release.env` 到 `.release.env.previous`。
- 生成新的 `.release.env`。
- 执行 `docker compose config`。
- 拉取三个生产镜像。
- 启动 pgvector Postgres。
- 执行 `pnpm --dir /app db:setup:deploy`。
- 启动 `webapp` 和 `project-assistant-service`。
- 等待三个容器 healthy。
- 执行 `verify-production.sh`。
- 失败时尽量恢复 `.release.env.previous` 并回滚应用容器。

`db:setup:deploy` 包含：

```text
Prisma migrate deploy
Tasklist checkpoint setup
chat memory setup
UserMemory PostgresStore setup
```

因此 v0.4.6 生产部署不需要手工单独执行 `db:user-memory:setup`。

## Release Metadata

GitHub Actions 正式 release 路径中，服务器 `.release.env` 由 `deploy-production.sh` 生成，不建议手工维护。

本地 PowerShell 手动部署路径中，`scripts/ops/release-production-local.ps1` 会在本地生产 secrets 目录生成 `.release.env`，并通过 `scripts/ops/sync-production-env.ps1` 上传到服务器。该路径继续使用 `production` tag，但 `.release.env` 必须包含 pgvector Postgres、webapp 和 project-assistant-service 三个镜像。

当前 `.release.env` 形态：

```env
AI_MIND_POSTGRES_IMAGE=ccr.ccs.tencentyun.com/<namespace>/ai-mind-postgres-pgvector
AI_MIND_POSTGRES_IMAGE_TAG=sha-xxxxxxx
AI_MIND_WEBAPP_IMAGE=ccr.ccs.tencentyun.com/<namespace>/ai-mind-webapp
AI_MIND_PROJECT_ASSISTANT_SERVICE_IMAGE=ccr.ccs.tencentyun.com/<namespace>/ai-mind-project-assistant-service
AI_MIND_IMAGE_TAG=sha-xxxxxxx
```

如果旧 `.release.env.previous` 没有 `AI_MIND_POSTGRES_IMAGE` 或 `AI_MIND_POSTGRES_IMAGE_TAG`，部署脚本会补齐 pgvector 镜像变量，并使用 `production` tag 作为兼容 fallback。

## Production Env Contract

`webapp.production.env` 必须包含：

```env
DATABASE_URL=postgresql://ai_mind:<password>@postgres:5432/ai_mind
AI_MIND_AGENT_RUN_SESSION_SECRET=<server-secret>
AI_MIND_GRAPH_CHECKPOINT=postgres
AI_MIND_CHAT_MEMORY_CHECKPOINT=postgres

AI_MIND_DOUBAO_API_KEY=<server-secret>
AI_MIND_DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3
AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS=1024

PROJECT_ASSISTANT_SERVICE_MCP_BASE_URL=http://project-assistant-service:8788/mcp
PROJECT_ASSISTANT_SERVICE_MCP_TOKEN=<same-token-as-pas>
```

`project-assistant-service.production.env` 必须包含与 webapp 相同的 `PROJECT_ASSISTANT_SERVICE_MCP_TOKEN`。

`postgres.production.env` 不因为 pgvector 改动而修改数据库名、用户名或密码。pgvector 是镜像能力，不是 env 配置。

## Secrets Sync

当前本地生产 env 默认目录：

```text
D:\secrets\ai-mind\production
```

用途：

- 保存本地生产 env 文件。
- 保存 TCR 登录配置。
- 供 `scripts/ops/sync-production-env.ps1` 上传到服务器。

限制：

- 不进入 git。
- 不写入真实 secret 到 docs、README、specs、logs 或 assistant 输出。
- 默认只允许检查文件名、更新时间、是否存在。
- 需要读取真实值时，必须由用户明确要求。

## Two Deployment Flows

后续如果没有用户明确批准，生产部署只允许在下面两条正式链路内修改和演进，不能脱离现有事实单独新开第三条部署路线，也不能通过破坏性改造把其中一条链路静默废掉。

### Recommended Flow

推荐主流程：

```text
GitHub Actions Release (TCR)
  -> TCR sha images
  -> server /srv/ai-mind/scripts/deploy-production.sh
```

这是 v0.4.6 后的正式发布路径，已覆盖三镜像、sha tag、pgvector Postgres、UserMemory Store setup 和 `verify-production.sh`。

### Local PowerShell Ops Flow

仓库仍保留：

```text
scripts/ops/release-production-local.ps1
scripts/ops/deploy-production.ps1
scripts/ops/sync-production-env.ps1
```

当前状态：

- `scripts/ops/release-production-local.ps1 -Deploy -SyncEnv` 是允许的本地手动部署路径。
- 本地手动部署路径继续使用 `production` tag，保持 v0.4.5 之前的使用习惯。
- `scripts/ops/release-production-local.ps1` 必须构建并推送 `ai-mind-postgres-pgvector:production`、`ai-mind-webapp:production` 和 `ai-mind-project-assistant-service:production` 三个镜像。
- `scripts/ops/release-production-local.ps1` 会写入本地生产 secrets 目录下的 `.release.env`，内容必须包含三镜像 release metadata。
- `scripts/ops/deploy-production.ps1` 在远程部署前必须同步最新 `deploy/` 资产到 `/srv/ai-mind`，避免服务器继续使用旧 compose 或旧 verify 脚本。
- `scripts/ops/sync-production-env.ps1` 继续作为生产 env 同步工具。

本地手动部署路径适合单人维护、快速生产更新和保留旧操作习惯。它不提供 `sha-xxxxxxx` 不可变发布的追溯能力；需要严格 release 可追溯时，使用 GitHub Actions 正式 release 路径。

## Deployment Evolution Boundary

后续部署相关修改必须遵守：

- 只能修改和增强现有两条正式链路：
    - GitHub Actions Release (TCR) 路径
    - Local PowerShell Ops 路径
- 不能在未获明确批准时新增第三条正式部署链路。
- 不能因为某次版本功能改动，绕开现有 `deploy/`、`scripts/ops/`、GitHub Actions、TCR、server deploy 这些既有事实源，另外拼出一套临时发布方案。
- 不能在没有明确说明的情况下，对其中任一正式链路做破坏性改造，导致旧的正式操作方式失效。
- 如果必须引入新步骤，应优先作为这两条链路中的最小增量变更，而不是重做整条流程。

## Verification

部署后至少检查：

```bash
docker compose --env-file .release.env -f compose.production.yml ps
```

必须看到：

```text
postgres healthy
webapp healthy
project-assistant-service healthy
```

确认 pgvector extension：

```bash
docker compose --env-file .release.env -f compose.production.yml exec postgres \
  psql -U ai_mind -d ai_mind -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
```

UserMemory semantic retrieval smoke：

```text
Conversation A: 请记住我喜欢吃桃子，不喜欢吃香菜
Conversation B: 我喜欢吃什么
```

预期：

- B 能回答“喜欢吃桃子”。
- B 不应推荐香菜。
- webapp 日志不应持续出现 `put-failed` 或 `retrieve-failed`。

## v0.5.0 Desktop Server-First Gate

Electron desktop public beta is not a third production deployment flow. The webapp
changes required by the desktop host are deployed only through one of the two existing
server flows above. Before a Windows preview artifact is generated or distributed, the
same candidate commit must pass the following production verification against the fixed
origin:

```text
AI_MIND_DESKTOP_CANDIDATE_VERSION=<strict-semver> \
  /srv/ai-mind/scripts/verify-production.sh
```

The script checks the desktop compatibility response, `Cache-Control: no-store`, the
absence of `Set-Cookie`, and the CSP/security headers for `/` and `/instant-mind`,
including nonce-restricted scripts and the scoped `style-src-attr` layout exception. The
candidate version is a release-verification input only. It is not a desktop runtime
Origin override and must not be stored in a distributed artifact.

Only after that server-first gate passes may the same commit produce the public
`Unsigned Experimental Preview` Windows x64 installer, macOS arm64 DMG, platform
manifests, and SHA-256 files for a GitHub Pre-release. Ordinary CI may run package
checks earlier, but must not create a public Release or access production secrets.

If a server rollback removes the compatibility API or document security headers, suspend
distribution of every affected preview candidate before the rollback. Installed clients
remain fail-closed in local recovery; do not add an HTTP fallback, alternate Origin, or
remote upgrade URL.

## Change Rules

修改以下任意内容时，必须同步检查本文档：

- `.github/workflows/*`
- `deploy/compose.production.yml`
- `deploy/scripts/*`
- `deploy/env/*.example`
- `deploy/*Dockerfile`
- `scripts/ops/*`
- `package.json` 中的 `db:*` setup 脚本
- 生产 env 新增、删除或语义变化
- 数据库、checkpoint、UserMemory Store 或 pgvector 能力变化

部署改动必须成组检查：

- 改镜像 tag 策略时，检查 `docker-release.yml`、`deploy-production.sh` 和 `.release.env` contract。
- 改生产 Compose 时，检查 `verify-production.sh`。
- 改 env requirement 时，检查 `deploy/env/*.example`、本地 secrets sync 脚本和本文档。
- 改数据库 setup 时，检查 `db:setup:deploy`、CI Postgres service、生产 Postgres 镜像和 release note。
