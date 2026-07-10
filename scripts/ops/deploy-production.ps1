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

function Install-RemoteFile {
  param(
    [Parameter(Mandatory = $true)][string]$LocalPath,
    [Parameter(Mandatory = $true)][string]$RemotePath,
    [Parameter(Mandatory = $true)][string]$Mode
  )

  if (!(Test-Path -LiteralPath $LocalPath -PathType Leaf)) {
    throw "Missing deploy asset: $LocalPath"
  }

  $tmpName = [System.IO.Path]::GetFileName($RemotePath)
  $tmpPath = "/tmp/ai-mind-deploy-$tmpName"

  Write-Host "Uploading deploy asset $LocalPath -> $RemotePath"

  scp -P $Port -i $Key $LocalPath "${User}@${ServerHost}:${tmpPath}"

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload deploy asset: $LocalPath"
  }

  $remoteCommand = "set -e; install -m $Mode '$tmpPath' '$RemotePath'; sed -i 's/\r`$//' '$RemotePath'; rm -f '$tmpPath'; ls -l '$RemotePath'"

  ssh -p $Port -i $Key "${User}@${ServerHost}" $remoteCommand

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install deploy asset: $RemotePath"
  }
}

function Sync-DeployAssets {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

  Write-Host "Syncing deploy assets..."

  ssh -p $Port -i $Key "${User}@${ServerHost}" "mkdir -p '$RemoteRoot/scripts' '$RemoteRoot/env'"

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to ensure remote deploy directories."
  }

  Install-RemoteFile `
    -LocalPath (Join-Path $repoRoot "deploy\compose.production.yml") `
    -RemotePath "$RemoteRoot/compose.production.yml" `
    -Mode "644"

  Install-RemoteFile `
    -LocalPath (Join-Path $repoRoot "deploy\scripts\deploy-production.sh") `
    -RemotePath "$RemoteRoot/scripts/deploy-production.sh" `
    -Mode "755"

  Install-RemoteFile `
    -LocalPath (Join-Path $repoRoot "deploy\scripts\verify-production.sh") `
    -RemotePath "$RemoteRoot/scripts/verify-production.sh" `
    -Mode "755"
}

Sync-DeployAssets

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

print_database_target() {
  echo 'Database target used by webapp:'
  compose run --rm --no-deps --entrypoint node webapp -e "const value=process.env.DATABASE_URL||'';if(!value){console.log('DATABASE_URL is not set');process.exit(0)}try{const url=new URL(value);console.log(url.username+'@'+url.hostname+':'+(url.port||'5432')+url.pathname)}catch{console.log('DATABASE_URL is set but could not be parsed')}" < /dev/null || true
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
print_database_target
# The remote script is sent through ssh "bash -s"; detach compose run from stdin
# so the one-shot container cannot consume the remaining deployment script.
docker rm -f ai-mind-db-setup >/dev/null 2>&1 || true
if ! compose run --name ai-mind-db-setup --no-deps --entrypoint pnpm webapp --dir /app db:setup:deploy < /dev/null; then
  echo 'database setup failed.'
  echo 'Recent logs for database setup container:'
  docker logs ai-mind-db-setup || true
  docker rm -f ai-mind-db-setup >/dev/null 2>&1 || true
  print_recent_logs postgres
  echo 'Hint: if an existing PostgreSQL volume was initialized with another POSTGRES_USER, changing env files will not create the new database role.'
  exit 1
fi
docker rm -f ai-mind-db-setup >/dev/null 2>&1 || true
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
