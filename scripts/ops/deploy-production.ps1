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

$remoteCommand = @"
set -euo pipefail

cd '$RemoteRoot'

echo 'Current release env:'
cat .release.env

echo 'Pulling production images...'
docker compose --env-file .release.env -f compose.production.yml pull

echo 'Starting local PostgreSQL...'
docker compose --env-file .release.env -f compose.production.yml up -d postgres

echo 'Waiting for postgres to become healthy...'
if ! timeout 120 bash -c 'until docker compose --env-file .release.env -f compose.production.yml ps | grep -Eq "postgres.+healthy"; do echo "waiting postgres..."; sleep 3; done'; then
  echo 'postgres did not become healthy in 120 seconds.'
  docker compose --env-file .release.env -f compose.production.yml logs --tail=120 postgres
  exit 1
fi

echo 'Running database setup...'
if ! docker compose --env-file .release.env -f compose.production.yml run --rm --no-deps --entrypoint pnpm webapp --dir /app db:setup:deploy; then
  echo 'database setup failed.'
  docker compose --env-file .release.env -f compose.production.yml logs --tail=120 postgres
  exit 1
fi

echo 'Recreating application containers...'
docker compose --env-file .release.env -f compose.production.yml up -d --force-recreate project-assistant-service webapp

echo 'Container status:'
docker compose --env-file .release.env -f compose.production.yml ps

echo 'Waiting for local webapp to become ready...'

if ! timeout 120 bash -c 'until curl -fsSI --max-time 5 http://127.0.0.1:3000 >/tmp/ai-mind-webapp.headers; do echo "waiting webapp..."; sleep 3; done'; then
  echo 'webapp did not become ready in 120 seconds.'
  docker compose --env-file .release.env -f compose.production.yml logs --tail=120 webapp
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
"@

$remoteCommand = $remoteCommand -replace "`r`n", "`n"

$remoteCommand | ssh -p $Port -i $Key "${User}@${ServerHost}" "bash -s"

if ($LASTEXITCODE -ne 0) {
  throw "Remote production deployment failed."
}
