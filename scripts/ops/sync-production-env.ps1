param(
  [string]$ServerHost = "106.55.149.137",
  [string]$User = "deploy",
  [int]$Port = 22,
  [string]$Key = "$env:USERPROFILE\.ssh\ai_mind_deploy_ed25519",
  [string]$SecretDir = "D:\secrets\ai-mind\production",
  [string]$RemoteRoot = "/srv/ai-mind"
)

$ErrorActionPreference = "Stop"

$files = @(
  @{
    Local = ".release.env"
    Remote = ".release.env"
    Mode = "640"
  },
  @{
    Local = "webapp.production.env"
    Remote = "env/webapp.production.env"
    Mode = "600"
  },
  @{
    Local = "project-assistant-service.production.env"
    Remote = "env/project-assistant-service.production.env"
    Mode = "600"
  },
  @{
    Local = "postgres.production.env"
    Remote = "env/postgres.production.env"
    Mode = "600"
  }
)

Write-Host "Checking local production env files..."

foreach ($file in $files) {
  $localPath = Join-Path $SecretDir $file.Local

  if (!(Test-Path $localPath)) {
    throw "Missing local file: $localPath"
  }

  Write-Host "OK: $localPath"
}

Write-Host "Ensuring remote env directory exists..."

ssh -p $Port -i $Key "${User}@${ServerHost}" "mkdir -p '$RemoteRoot/env'"

if ($LASTEXITCODE -ne 0) {
  throw "Failed to ensure remote env directory."
}

foreach ($file in $files) {
  $localPath = Join-Path $SecretDir $file.Local
  $tmpPath = "/tmp/ai-mind-$($file.Local)"
  $remotePath = "$RemoteRoot/$($file.Remote)"
  $mode = $file.Mode

  Write-Host "Uploading $($file.Local) -> $remotePath"

  scp -P $Port -i $Key $localPath "${User}@${ServerHost}:${tmpPath}"

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload $($file.Local)."
  }

  # 注意：这里故意用单行命令，避免 PowerShell CRLF 被远程 bash 识别成路径里的 \r
  $remoteCommand = "set -e; install -m $mode '$tmpPath' '$remotePath'; sed -i 's/\r`$//' '$remotePath'; rm -f '$tmpPath'; ls -l '$remotePath'"

  ssh -p $Port -i $Key "${User}@${ServerHost}" $remoteCommand

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install remote file: $remotePath"
  }
}

Write-Host "Production env sync completed."
