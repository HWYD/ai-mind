param(
  [switch]$SyncEnv,
  [string]$ServerHost = "106.55.149.137",
  [string]$User = "deploy",
  [int]$Port = 22,
  [string]$Key = "$env:USERPROFILE\.ssh\ai_mind_deploy_ed25519",
  [string]$SecretDir = "D:\secrets\ai-mind\production",
  [string]$RemoteRoot = "/srv/ai-mind"
)

$ErrorActionPreference = "Stop"

if ($SyncEnv) {
  Write-Host "SyncEnv enabled. Syncing production env files..."

  & "$PSScriptRoot\sync-production-env.ps1" `
    -ServerHost $ServerHost `
    -User $User `
    -Port $Port `
    -Key $Key `
    -SecretDir $SecretDir `
    -RemoteRoot $RemoteRoot
}

Write-Host "Starting remote production deployment..."

$remoteCommand = @'
set -euo pipefail

cd '__REMOTE_ROOT__'

compose() {
  docker compose --env-file .release.env -f compose.production.yml "$@"
}

print_compose_status() {
  echo 'Container status:'
  compose ps
}

print_recent_logs() {
  local service="$1"
  echo "Recent logs for ${service}:"
  compose logs --tail=120 "$service" || true
}

echo 'Current release env:'
cat .release.env

echo 'Pulling production images...'
compose pull

echo 'Starting local PostgreSQL...'
compose up -d postgres

echo 'Waiting for postgres to become healthy...'
if ! timeout 120 bash -c 'until docker compose --env-file .release.env -f compose.production.yml ps | grep -Eq "postgres.+healthy"; do echo "waiting postgres..."; sleep 3; done'; then
  echo 'postgres did not become healthy in 120 seconds.'
  print_recent_logs postgres
  exit 1
fi

echo 'Running database setup...'
# 远程脚本是通过 ssh "bash -s" 从 stdin 下发的，这里必须断开 compose run 的 stdin，
# 否则它可能吃掉后续脚本内容，导致 DB setup 后的容器重建步骤根本没有继续执行。
if ! compose run --rm --no-deps --entrypoint pnpm webapp --dir /app db:setup:deploy < /dev/null; then
  echo 'database setup failed.'
  print_recent_logs postgres
  exit 1
fi
echo 'Database setup completed.'

echo 'Recreating application containers...'
if ! compose up -d --force-recreate project-assistant-service webapp; then
  echo 'application container recreate failed.'
  print_compose_status
  print_recent_logs webapp
  print_recent_logs project-assistant-service
  exit 1
fi

print_compose_status

echo 'Waiting for webapp and project-assistant-service to become healthy...'
if ! timeout 180 bash -c 'until docker compose --env-file .release.env -f compose.production.yml ps | grep -Eq "webapp.+healthy" && docker compose --env-file .release.env -f compose.production.yml ps | grep -Eq "project-assistant-service.+healthy"; do echo "waiting app services..."; sleep 3; done'; then
  echo 'app services did not become healthy in 180 seconds.'
  print_compose_status
  print_recent_logs webapp
  print_recent_logs project-assistant-service
  exit 1
fi

print_compose_status

echo 'Waiting for local webapp to become ready...'

if ! timeout 120 bash -c 'until curl -fsSI --max-time 5 http://127.0.0.1:3000 >/tmp/ai-mind-webapp.headers; do echo "waiting webapp..."; sleep 3; done'; then
  echo 'webapp did not become ready in 120 seconds.'
  print_compose_status
  print_recent_logs webapp
  print_recent_logs project-assistant-service
  exit 1
fi

cat /tmp/ai-mind-webapp.headers

echo 'Checking HTTPS domain...'
curl -I --max-time 20 https://ai.hwyblog.cloud

echo 'Checking public MCP boundary, expected 404...'
curl -I --max-time 20 https://ai.hwyblog.cloud/mcp || true

echo 'Pruning dangling local images...'
docker image prune -f

echo 'Production deployment completed.'
'@

$remoteCommand = $remoteCommand.Replace("__REMOTE_ROOT__", $RemoteRoot)
$remoteCommand = $remoteCommand -replace "`r`n", "`n"

$remoteCommand | ssh -p $Port -i $Key "${User}@${ServerHost}" "bash -s"

if ($LASTEXITCODE -ne 0) {
  throw "Remote production deployment failed."
}
