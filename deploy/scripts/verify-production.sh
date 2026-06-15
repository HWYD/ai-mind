#!/usr/bin/env bash
# AI Mind 生产环境验收脚本
# 默认通过线上域名验证 HTTPS、HTTP 跳转和 /mcp 不暴露。
# 不打印 API Key、MCP Token、Authorization Header 或完整 Cookie。

set -euo pipefail

DEPLOY_ROOT="${AI_MIND_DEPLOY_ROOT:-/srv/ai-mind}"
COMPOSE_FILE="${DEPLOY_ROOT}/compose.production.yml"
RELEASE_ENV_FILE="${DEPLOY_ROOT}/.release.env"
PROD_DOMAIN="${PROD_DOMAIN:-ai.hwyblog.cloud}"
TIMEOUT_SECONDS="${AI_MIND_VERIFY_TIMEOUT_SECONDS:-10}"

PASS_COUNT=0
FAIL_COUNT=0
LEGACY_REGISTRY_PATTERN="$(printf '\147\150\143\162\056\151\157')"

check() {
    local label="$1"
    local ok="$2"

    if [ "$ok" = "ok" ]; then
        PASS_COUNT=$((PASS_COUNT + 1))
        echo "ok   $label"
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        echo "FAIL $label"
    fi
}

info() {
    echo "info $*"
}

compose() {
    docker compose --env-file "$RELEASE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

[ -f "$COMPOSE_FILE" ] || { echo "FAIL 找不到 compose.production.yml：$COMPOSE_FILE"; exit 1; }
[ -f "$RELEASE_ENV_FILE" ] || { echo "FAIL 找不到 .release.env：$RELEASE_ENV_FILE"; exit 1; }

CONFIG_OUTPUT="$(compose config 2>/dev/null)" || {
    echo "FAIL docker compose config 解析失败"
    exit 1
}

check "docker compose config 成功" ok
check "渲染后的镜像包含 ccr.ccs.tencentyun.com" "$(printf '%s\n' "$CONFIG_OUTPUT" | grep -q 'ccr.ccs.tencentyun.com' && echo ok || echo fail)"
check "渲染后的镜像不包含旧 registry 前缀" "$(printf '%s\n' "$CONFIG_OUTPUT" | grep -q "$LEGACY_REGISTRY_PATTERN" && echo fail || echo ok)"
check "渲染后的镜像不是 image: :sha-xxx" "$(printf '%s\n' "$CONFIG_OUTPUT" | grep -Eq 'image:[[:space:]]*:sha-' && echo fail || echo ok)"

MAX_WAIT_SECONDS=180
ELAPSED=0
while [ "$ELAPSED" -lt "$MAX_WAIT_SECONDS" ]; do
    PS_OUTPUT="$(compose ps 2>/dev/null || true)"
    if printf '%s\n' "$PS_OUTPUT" | grep -Eq 'project-assistant-service.+healthy' \
        && printf '%s\n' "$PS_OUTPUT" | grep -Eq 'webapp.+healthy'; then
        break
    fi

    sleep 5
    ELAPSED=$((ELAPSED + 5))
done

PS_OUTPUT="$(compose ps 2>/dev/null || true)"
check "project-assistant-service healthy" "$(printf '%s\n' "$PS_OUTPUT" | grep -Eq 'project-assistant-service.+healthy' && echo ok || echo fail)"
check "webapp healthy" "$(printf '%s\n' "$PS_OUTPUT" | grep -Eq 'webapp.+healthy' && echo ok || echo fail)"

WEBAPP_BIND="$(compose port webapp 3000 2>/dev/null | head -1 || true)"
check "webapp 只绑定 127.0.0.1:3000->3000" "$(printf '%s\n' "$WEBAPP_BIND" | grep -Eq '^127\.0\.0\.1:3000$' && echo ok || echo fail)"

PAS_PORT_OUTPUT="$(compose port project-assistant-service 8788 2>/dev/null || true)"
check "project-assistant-service 没有宿主机 8788 端口映射" "$( [ -z "$PAS_PORT_OUTPUT" ] && echo ok || echo fail )"
check "project-assistant-service 仅在容器内 expose 8788/tcp" "$(printf '%s\n' "$PS_OUTPUT" | grep -Eq 'project-assistant-service.+8788/tcp' && echo ok || echo fail)"

HTTPS_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SECONDS" "https://${PROD_DOMAIN}" || true)"
case "$HTTPS_STATUS" in
    200|204|301|302|307|308) HTTPS_OK=ok ;;
    *) HTTPS_OK=fail ;;
esac
check "https://${PROD_DOMAIN} 成功响应" "$HTTPS_OK"

HTTP_HEADERS="$(curl -sSI --max-time "$TIMEOUT_SECONDS" "http://${PROD_DOMAIN}" || true)"
HTTP_STATUS="$(printf '%s\n' "$HTTP_HEADERS" | awk 'NR==1 {print $2}')"
HTTP_LOCATION="$(printf '%s\n' "$HTTP_HEADERS" | awk 'BEGIN{IGNORECASE=1} /^Location:/ {print $2}' | tr -d '\r' | head -1)"
check "http://${PROD_DOMAIN} 301 跳转到 https" "$( [ "$HTTP_STATUS" = "301" ] && printf '%s\n' "$HTTP_LOCATION" | grep -Eq "^https://${PROD_DOMAIN}(/|$)" && echo ok || echo fail )"

MCP_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SECONDS" "https://${PROD_DOMAIN}/mcp" || true)"
check "https://${PROD_DOMAIN}/mcp 返回 404" "$( [ "$MCP_STATUS" = "404" ] && echo ok || echo fail )"

API_HEALTH_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SECONDS" "https://${PROD_DOMAIN}/api/health" || true)"
if [ "$API_HEALTH_STATUS" = "200" ]; then
    check "可选检查 /api/health 成功" ok
elif [ "$API_HEALTH_STATUS" = "404" ]; then
    info "/api/health 当前未暴露为生产硬验收项，按提示跳过。"
else
    info "/api/health 当前返回 ${API_HEALTH_STATUS}，未作为硬失败。"
fi

API_MODELS_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SECONDS" "https://${PROD_DOMAIN}/api/ai/models" || true)"
if [ "$API_MODELS_STATUS" = "200" ]; then
    check "可选检查 /api/ai/models 成功" ok
else
    info "/api/ai/models 当前返回 ${API_MODELS_STATUS}，未作为硬失败。"
fi

echo "验证完成：${PASS_COUNT} passed, ${FAIL_COUNT} failed"

if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
fi
