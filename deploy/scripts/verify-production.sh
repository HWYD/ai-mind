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
CANDIDATE_VERSION="${AI_MIND_DESKTOP_CANDIDATE_VERSION:-}"

if ! printf '%s' "$CANDIDATE_VERSION" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'; then
    echo "FAIL AI_MIND_DESKTOP_CANDIDATE_VERSION must be strict semver"
    exit 1
fi

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

header_value() {
    local header_name="$1"
    local header_file="$2"

    awk -v key="$header_name" '
        BEGIN { key = tolower(key) }
        {
            line = $0
            sub(/\r$/, "", line)
            separator = index(line, ":")
            if (separator == 0 || tolower(substr(line, 1, separator - 1)) != key) {
                next
            }

            value = substr(line, separator + 1)
            sub(/^[[:space:]]*/, "", value)
            print value
            exit
        }
    ' "$header_file"
}

verify_compatibility_api() {
    local header_file="$VERIFY_ROOT/compatibility.headers"
    local body_file="$VERIFY_ROOT/compatibility.body"

    curl -sS -D "$header_file" -o "$body_file" --max-time "$TIMEOUT_SECONDS" \
        -H 'Accept: application/vnd.ai-mind.desktop-compatibility+json; version=1' \
        -H "X-AI-Mind-Desktop-Version: $CANDIDATE_VERSION" \
        -H 'Cookie: ai-mind-session-id=production-verification-probe' \
        "https://${PROD_DOMAIN}/api/desktop/compatibility" >/dev/null 2>&1 || return 1

    local status="$(awk 'NR == 1 { print $2 }' "$header_file")"
    local cache_control="$(header_value 'Cache-Control' "$header_file")"
    local set_cookie="$(header_value 'Set-Cookie' "$header_file")"
    local content_type="$(header_value 'Content-Type' "$header_file")"
    local body="$(tr -d '[:space:]' < "$body_file")"

    [ "$status" = "200" ] || return 1
    [ "$cache_control" = "no-store" ] || return 1
    [ -z "$set_cookie" ] || return 1
    printf '%s' "$content_type" | grep -qi '^application/json' || return 1
    printf '%s' "$body" | grep -Eq '^\{"contractVersion":1,"status":"compatible"\}$|^\{"contractVersion":1,"minimumDesktopVersion":"[0-9]+\.[0-9]+\.[0-9]+([-.+][0-9A-Za-z.-]+)?","status":"manual_upgrade_required"\}$' || return 1
    if printf '%s' "$body" | grep -Eiq 'cookie|secret|token|upgradeUrl'; then
        return 1
    fi
}

verify_document_headers() {
    local pathname="$1"
    local safe_name="${pathname#/}"
    safe_name="${safe_name//\//-}"
    local header_file="$VERIFY_ROOT/document-${safe_name:-root}.headers"

    curl -sS -D "$header_file" -o /dev/null --max-time "$TIMEOUT_SECONDS" \
        -H 'Accept: text/html' \
        "https://${PROD_DOMAIN}${pathname}" >/dev/null 2>&1 || return 1

    local status="$(awk 'NR == 1 { print $2 }' "$header_file")"
    local csp="$(header_value 'Content-Security-Policy' "$header_file")"
    local permissions="$(header_value 'Permissions-Policy' "$header_file")"
    local referrer="$(header_value 'Referrer-Policy' "$header_file")"
    local nosniff="$(header_value 'X-Content-Type-Options' "$header_file")"
    local frame="$(header_value 'X-Frame-Options' "$header_file")"

    [ "$status" = "200" ] || return 1
    printf '%s' "$csp" | grep -Eq "script-src 'nonce-[A-Za-z0-9]+' 'strict-dynamic'" || return 1
    printf '%s' "$csp" | grep -Eq "(^|;[[:space:]]*)style-src 'self' 'unsafe-inline'(;|$)" || return 1
    if printf '%s' "$csp" | grep -Eiq "style-src[^;]*(nonce-|sha[0-9]+-)|style-src-attr"; then
        return 1
    fi
    printf '%s' "$csp" | grep -q "object-src 'none'" || return 1
    printf '%s' "$csp" | grep -q "frame-ancestors 'none'" || return 1
    if printf '%s' "$csp" | grep -Eiq "script-src[^;]*unsafe-inline|unsafe-eval"; then
        return 1
    fi
    printf '%s' "$permissions" | grep -q 'camera=()' || return 1
    printf '%s' "$permissions" | grep -q 'clipboard-read=()' || return 1
    [ "$referrer" = "strict-origin-when-cross-origin" ] || return 1
    [ "$nosniff" = "nosniff" ] || return 1
    [ "$frame" = "DENY" ] || return 1
}

info() {
    echo "info $*"
}

compose() {
    docker compose --env-file "$RELEASE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

published_port() {
    local service="$1"
    local container_port="$2"
    local output

    # 某些 Docker Compose 版本在服务仅使用 expose 时会输出错误文本但退出失败；
    # 失败输出不是宿主机端口映射，只有成功结果才参与安全判断。
    if output="$(compose port "$service" "$container_port" 2>/dev/null)"; then
        printf '%s' "$output"
    fi
}

[ -f "$COMPOSE_FILE" ] || { echo "FAIL 找不到 compose.production.yml：$COMPOSE_FILE"; exit 1; }
[ -f "$RELEASE_ENV_FILE" ] || { echo "FAIL 找不到 .release.env：$RELEASE_ENV_FILE"; exit 1; }

VERIFY_ROOT="$(mktemp -d)"
trap 'rm -rf "$VERIFY_ROOT"' EXIT

CONFIG_OUTPUT="$(compose config 2>/dev/null)" || {
    echo "FAIL docker compose config 解析失败"
    exit 1
}

check "docker compose config 成功" ok
check "渲染后的镜像包含 ccr.ccs.tencentyun.com" "$(printf '%s\n' "$CONFIG_OUTPUT" | grep -q 'ccr.ccs.tencentyun.com' && echo ok || echo fail)"
check "渲染后的 postgres 镜像使用 ai-mind-postgres-pgvector" "$(printf '%s\n' "$CONFIG_OUTPUT" | grep -q 'ai-mind-postgres-pgvector' && echo ok || echo fail)"
check "渲染后的 postgres 镜像不再使用 postgres:16-bookworm" "$(printf '%s\n' "$CONFIG_OUTPUT" | grep -q 'postgres:16-bookworm' && echo fail || echo ok)"
check "渲染后的镜像不包含旧 registry 前缀" "$(printf '%s\n' "$CONFIG_OUTPUT" | grep -q "$LEGACY_REGISTRY_PATTERN" && echo fail || echo ok)"
check "渲染后的镜像不是 image: :sha-xxx" "$(printf '%s\n' "$CONFIG_OUTPUT" | grep -Eq 'image:[[:space:]]*:sha-' && echo fail || echo ok)"

MAX_WAIT_SECONDS=180
ELAPSED=0
while [ "$ELAPSED" -lt "$MAX_WAIT_SECONDS" ]; do
    PS_OUTPUT="$(compose ps 2>/dev/null || true)"
    if printf '%s\n' "$PS_OUTPUT" | grep -Eq 'postgres.+healthy' \
        && printf '%s\n' "$PS_OUTPUT" | grep -Eq 'project-assistant-service.+healthy' \
        && printf '%s\n' "$PS_OUTPUT" | grep -Eq 'webapp.+healthy'; then
        break
    fi

    sleep 5
    ELAPSED=$((ELAPSED + 5))
done

PS_OUTPUT="$(compose ps 2>/dev/null || true)"
check "postgres healthy" "$(printf '%s\n' "$PS_OUTPUT" | grep -Eq 'postgres.+healthy' && echo ok || echo fail)"
check "project-assistant-service healthy" "$(printf '%s\n' "$PS_OUTPUT" | grep -Eq 'project-assistant-service.+healthy' && echo ok || echo fail)"
check "webapp healthy" "$(printf '%s\n' "$PS_OUTPUT" | grep -Eq 'webapp.+healthy' && echo ok || echo fail)"

POSTGRES_PORT_OUTPUT="$(published_port postgres 5432)"
check "postgres 没有宿主机 5432 端口映射" "$( [ -z "$POSTGRES_PORT_OUTPUT" ] && echo ok || echo fail )"
check "postgres 仅在容器内 expose 5432/tcp" "$(printf '%s\n' "$PS_OUTPUT" | grep -Eq 'postgres.+5432/tcp' && echo ok || echo fail)"

WEBAPP_BIND="$(compose port webapp 3000 2>/dev/null | head -1 || true)"
check "webapp 只绑定 127.0.0.1:3000->3000" "$(printf '%s\n' "$WEBAPP_BIND" | grep -Eq '^127\.0\.0\.1:3000$' && echo ok || echo fail)"

PAS_PORT_OUTPUT="$(published_port project-assistant-service 8788)"
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

if verify_compatibility_api; then
    check "desktop compatibility API strict candidate response" ok
else
    check "desktop compatibility API strict candidate response" fail
fi

if verify_document_headers '/'; then
    check "document security headers /" ok
else
    check "document security headers /" fail
fi

if verify_document_headers '/instant-mind'; then
    check "document security headers /instant-mind" ok
else
    check "document security headers /instant-mind" fail
fi

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
