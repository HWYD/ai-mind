#!/usr/bin/env bash
# AI Mind 生产部署与回滚脚本
# 当前生产路线：GitHub Actions -> 腾讯云 TCR -> 腾讯云服务器 Docker Compose。
# 脚本只更新 release metadata、拉取镜像、启动容器、等待健康检查和失败回滚。
# 不覆盖服务器生产 env、不修改 Nginx、不管理证书续期。

set -euo pipefail

DEPLOY_ROOT="${AI_MIND_DEPLOY_ROOT:-/srv/ai-mind}"
COMPOSE_FILE="${DEPLOY_ROOT}/compose.production.yml"
POSTGRES_ENV_FILE="${DEPLOY_ROOT}/env/postgres.production.env"
WEBAPP_ENV_FILE="${DEPLOY_ROOT}/env/webapp.production.env"
PAS_ENV_FILE="${DEPLOY_ROOT}/env/project-assistant-service.production.env"
RELEASE_ENV_FILE="${DEPLOY_ROOT}/.release.env"
RELEASE_ENV_PREVIOUS_FILE="${DEPLOY_ROOT}/.release.env.previous"
TAG="${AI_MIND_IMAGE_TAG:-}"
TCR_NAMESPACE="${TCR_NAMESPACE:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[deploy]${NC} $*"
}

fail() {
    echo -e "${RED}[deploy]${NC} $*" >&2
    exit 1
}

compose() {
    docker compose --env-file "$RELEASE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_postgres_healthy() {
    local timeout_seconds="${1:-120}"
    local elapsed=0

    while [ "$elapsed" -lt "$timeout_seconds" ]; do
        local status_output
        status_output="$(compose ps 2>/dev/null || true)"

        if printf '%s\n' "$status_output" | grep -Eq 'postgres.+healthy'; then
            log "postgres 已 healthy"
            return 0
        fi

        sleep 5
        elapsed=$((elapsed + 5))
    done

    return 1
}

start_postgres() {
    log "starting colocated postgres"
    compose up -d postgres

    if ! wait_postgres_healthy 120; then
        fail "postgres 未能在预期时间内进入 healthy。"
    fi
}

run_database_setup() {
    log "running database migrations and LangGraph checkpoint setup"
    start_postgres
    compose run --rm --no-deps --entrypoint pnpm webapp --dir /app db:setup:deploy
}

restore_previous_release_env() {
    if [ -f "$RELEASE_ENV_PREVIOUS_FILE" ]; then
        cp "$RELEASE_ENV_PREVIOUS_FILE" "$RELEASE_ENV_FILE"
        log "restored previous release metadata after database setup failure"
    fi
}

wait_healthy() {
    local timeout_seconds="${1:-180}"
    local elapsed=0

    while [ "$elapsed" -lt "$timeout_seconds" ]; do
        local status_output
        status_output="$(compose ps 2>/dev/null || true)"

        if printf '%s\n' "$status_output" | grep -Eq 'postgres.+healthy' \
            && printf '%s\n' "$status_output" | grep -Eq 'project-assistant-service.+healthy' \
            && printf '%s\n' "$status_output" | grep -Eq 'webapp.+healthy'; then
            log "postgres、webapp 和 project-assistant-service 均已 healthy"
            return 0
        fi

        sleep 5
        elapsed=$((elapsed + 5))
    done

    return 1
}

run_verify() {
    PROD_DOMAIN="${PROD_DOMAIN:-ai.hwyblog.cloud}" \
    AI_MIND_DEPLOY_ROOT="$DEPLOY_ROOT" \
    bash "${DEPLOY_ROOT}/scripts/verify-production.sh"
}

read_required_token() {
    local env_file="$1"
    local token

    token="$(grep -E '^PROJECT_ASSISTANT_SERVICE_MCP_TOKEN=' "$env_file" | tail -1 | cut -d= -f2- || true)"
    token="${token%\"}"
    token="${token#\"}"

    if [ -z "$token" ]; then
        return 1
    fi

    printf '%s' "$token"
}

write_release_env() {
    cat > "$RELEASE_ENV_FILE" <<EOF
AI_MIND_WEBAPP_IMAGE=ccr.ccs.tencentyun.com/${TCR_NAMESPACE}/ai-mind-webapp
AI_MIND_PROJECT_ASSISTANT_SERVICE_IMAGE=ccr.ccs.tencentyun.com/${TCR_NAMESPACE}/ai-mind-project-assistant-service
AI_MIND_IMAGE_TAG=${TAG}
EOF
    chmod 644 "$RELEASE_ENV_FILE"
}

rollback() {
    [ -f "$RELEASE_ENV_PREVIOUS_FILE" ] || fail "没有可用的 .release.env.previous，无法回滚。"

    cp "$RELEASE_ENV_PREVIOUS_FILE" "$RELEASE_ENV_FILE"
    compose config > /dev/null
    compose pull
    compose up -d --remove-orphans

    if ! wait_healthy 180; then
        fail "回滚后的容器未能恢复到 healthy。"
    fi

    if ! run_verify; then
        fail "回滚后的生产验收仍未通过。"
    fi

    log "已完成一次自动回滚。"
}

[ -f "$COMPOSE_FILE" ] || fail "找不到 compose.production.yml：$COMPOSE_FILE"
[ -f "$POSTGRES_ENV_FILE" ] || fail "找不到生产 env：$POSTGRES_ENV_FILE"
[ -f "$WEBAPP_ENV_FILE" ] || fail "找不到生产 env：$WEBAPP_ENV_FILE"
[ -f "$PAS_ENV_FILE" ] || fail "找不到生产 env：$PAS_ENV_FILE"
[ -x "${DEPLOY_ROOT}/scripts/verify-production.sh" ] || fail "找不到可执行的 verify-production.sh"
[ -n "$TCR_NAMESPACE" ] || fail "缺少 TCR_NAMESPACE。"
[ -n "$TAG" ] || fail "缺少 AI_MIND_IMAGE_TAG，例如 sha-ef58cb8。"

if ! printf '%s' "$TAG" | grep -Eq '^sha-[a-f0-9]{7,40}$'; then
    fail "AI_MIND_IMAGE_TAG 必须是 sha-<git-sha> 格式。"
fi

WEBAPP_TOKEN="$(read_required_token "$WEBAPP_ENV_FILE")" || fail "webapp.production.env 缺少 PROJECT_ASSISTANT_SERVICE_MCP_TOKEN。"
PAS_TOKEN="$(read_required_token "$PAS_ENV_FILE")" || fail "project-assistant-service.production.env 缺少 PROJECT_ASSISTANT_SERVICE_MCP_TOKEN。"

if [ "$WEBAPP_TOKEN" != "$PAS_TOKEN" ]; then
    fail "webapp 与 PAS 的 PROJECT_ASSISTANT_SERVICE_MCP_TOKEN 不一致。"
fi

if [ -f "$RELEASE_ENV_FILE" ]; then
    cp "$RELEASE_ENV_FILE" "$RELEASE_ENV_PREVIOUS_FILE"
    log "已备份当前 .release.env 到 .release.env.previous"
fi

write_release_env
compose config > /dev/null

log "开始拉取镜像并启动容器"
compose pull
if ! run_database_setup; then
    restore_previous_release_env
    fail "database setup failed; deployment stopped before starting the new containers."
fi
compose up -d --remove-orphans

ROLLED_BACK=0

if ! wait_healthy 180; then
    if [ -f "$RELEASE_ENV_PREVIOUS_FILE" ] && [ "$ROLLED_BACK" -eq 0 ]; then
        ROLLED_BACK=1
        log "新版本容器未达到 healthy，开始自动回滚"
        rollback
        exit 0
    fi

    fail "新版本容器未达到 healthy，且没有可用回滚。"
fi

if ! run_verify; then
    if [ -f "$RELEASE_ENV_PREVIOUS_FILE" ] && [ "$ROLLED_BACK" -eq 0 ]; then
        ROLLED_BACK=1
        log "生产验收失败，开始自动回滚"
        rollback
        exit 0
    fi

    fail "生产验收失败，且没有可用回滚。"
fi

log "部署成功：${TAG}"
