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

`production` tag 可以保留用于人工查看和旧 metadata 兼容，但正式部署必须使用 `sha-xxxxxxx` 作为不可变发布 tag。

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

服务器 `.release.env` 由 `deploy-production.sh` 生成，不建议手工维护。

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

- `scripts/ops/sync-production-env.ps1` 仍可作为生产 env 同步工具。
- `scripts/ops/release-production-local.ps1` 仍包含旧的本地构建 / 推送 `production` tag 双镜像逻辑，没有完全对齐 v0.4.6 的三镜像 sha tag 和 pgvector 发布路径。
- `scripts/ops/deploy-production.ps1` 内嵌一份远程 bash 部署逻辑，容易与 `deploy/scripts/deploy-production.sh` 分裂。

因此，在完成重新收口前，`scripts/ops/release-production-local.ps1` 和 `scripts/ops/deploy-production.ps1` 不应作为 v0.4.6 的正式发布路径。后续建议将它们改成薄 wrapper：

```text
optional sync env
optional sync deploy assets
remote call /srv/ai-mind/scripts/deploy-production.sh
```

不要在 PowerShell ops 脚本中继续维护第二份完整部署逻辑。

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
