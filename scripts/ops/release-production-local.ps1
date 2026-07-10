[CmdletBinding()]
param(
  [switch]$Deploy,
  [switch]$SyncEnv,
  [string]$Version = "",
  [string]$SecretsDir = "D:\secrets\ai-mind\production",
  [string]$TcrEnvPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Stage {
  param([Parameter(Mandatory = $true)][string]$Name)

  Write-Host ""
  Write-Host "=== $Name ==="
}

function Read-EnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "TCR env file not found: $Path"
  }

  $values = @{}
  $lineNumber = 0

  foreach ($line in Get-Content -LiteralPath $Path) {
    $lineNumber += 1
    $trimmed = $line.Trim()

    if (!$trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    if ($trimmed -notmatch "^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$") {
      throw "Invalid TCR env entry at ${Path}:$lineNumber."
    }

    $name = $Matches[1]
    $value = $Matches[2].Trim()

    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$name] = $value
  }

  return $values
}

function Assert-CommandAvailable {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (!(Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command is not available: $Name"
  }
}

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$FailureMessage
  )

  & $FilePath @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage Exit code: $LASTEXITCODE"
  }
}

function Write-ReleaseEnvFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Registry,
    [Parameter(Mandatory = $true)][string]$Namespace
  )

  $releaseEnv = @(
    "AI_MIND_POSTGRES_IMAGE=$Registry/$Namespace/ai-mind-postgres-pgvector",
    "AI_MIND_POSTGRES_IMAGE_TAG=production",
    "AI_MIND_WEBAPP_IMAGE=$Registry/$Namespace/ai-mind-webapp",
    "AI_MIND_PROJECT_ASSISTANT_SERVICE_IMAGE=$Registry/$Namespace/ai-mind-project-assistant-service",
    "AI_MIND_IMAGE_TAG=production"
  )

  $directory = Split-Path -Parent $Path
  if (!(Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($Path, $releaseEnv, $utf8NoBom)
}

function Read-RepoPackageVersion {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)

  $packageJsonPath = Join-Path $RepoRoot "package.json"

  if (!(Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
    throw "package.json not found: $packageJsonPath"
  }

  $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
  $version = [string]$packageJson.version

  if ([string]::IsNullOrWhiteSpace($version)) {
    throw "package.json version is missing."
  }

  return $version.Trim()
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$deployScriptPath = Join-Path $PSScriptRoot "deploy-production.ps1"

if ([string]::IsNullOrWhiteSpace($TcrEnvPath)) {
  $TcrEnvPath = Join-Path $SecretsDir "tcr.production.env"
}

$tcrConfig = Read-EnvFile -Path $TcrEnvPath
$requiredTcrVariables = @(
  "TCR_REGISTRY",
  "TCR_NAMESPACE",
  "TCR_USERNAME",
  "TCR_PASSWORD"
)

foreach ($variableName in $requiredTcrVariables) {
  if (!$tcrConfig.ContainsKey($variableName) -or [string]::IsNullOrWhiteSpace([string]$tcrConfig[$variableName])) {
    throw "Missing required TCR configuration: $variableName"
  }
}

$tcrRegistry = ([string]$tcrConfig["TCR_REGISTRY"]).Trim().TrimEnd("/")
$tcrNamespace = ([string]$tcrConfig["TCR_NAMESPACE"]).Trim().Trim("/")
$tcrUsername = ([string]$tcrConfig["TCR_USERNAME"]).Trim()
$tcrPassword = [string]$tcrConfig["TCR_PASSWORD"]

if ($tcrRegistry.Contains("://")) {
  throw "TCR_REGISTRY must be a registry hostname without http:// or https://."
}

if ($tcrNamespace.Contains("/")) {
  throw "TCR_NAMESPACE must be a single namespace, not a repository path."
}

$effectiveSyncEnv = $Deploy -and $SyncEnv

if ($SyncEnv -and !$Deploy) {
  Write-Warning "-SyncEnv is ignored because -Deploy was not specified."
}

Push-Location $repoRoot

try {
  Write-Stage "Git checks"
  Assert-CommandAvailable -Name "git"

  & git diff --quiet
  if ($LASTEXITCODE -ne 0) {
    throw "Git working tree has unstaged changes. Commit or discard them before release."
  }

  & git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    throw "Git index has staged but uncommitted changes. Commit them before release."
  }

  $porcelainStatus = @(& git status --porcelain --untracked-files=normal)
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect Git working tree status."
  }
  if ($porcelainStatus.Count -gt 0) {
    throw "Git working tree contains untracked or uncommitted files. Commit or remove them before release."
  }

  $headTags = @(& git tag --points-at HEAD)
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to resolve tags for the current commit."
  }

  $versionTags = @(
    $headTags |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ -match "^v\d+\.\d+\.\d+$" }
  )

  $requestedVersion = $Version.Trim()
  $localVersionPattern =
    "^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-" +
    "(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)" +
    "(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*$"

  if ($requestedVersion) {
    if ($requestedVersion -notmatch $localVersionPattern) {
      throw (
        "-Version must be a SemVer prerelease such as 0.2.5-local.1 or 0.2.5-hotfix.1. " +
        "Stable versions such as 0.2.5 must be released from a v0.2.5 Git tag."
      )
    }

    if ($versionTags.Count -gt 0) {
      throw (
        "-Version local fallback mode cannot be used when the current commit has a stable release tag: " +
        "$($versionTags -join ', '). Omit -Version to use the tag release mode."
      )
    }

    $releaseMode = "local-fallback"
    $versionTag = "none"
    $releaseVersion = $requestedVersion
  }
  else {
    if ($versionTags.Count -eq 0) {
      $releaseMode = "package-version-fallback"
      $versionTag = "none"
      $releaseVersion = Read-RepoPackageVersion -RepoRoot $repoRoot
    }
    elseif ($versionTags.Count -gt 1) {
      throw "Current commit has multiple semantic version tags: $($versionTags -join ', '). Keep exactly one release tag."
    }
    else {
      $releaseMode = "tag"
      $versionTag = $versionTags[0]
      $releaseVersion = $versionTag.Substring(1)
    }
  }

  $commitSha = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or !$commitSha) {
    throw "Failed to resolve the current commit SHA."
  }
  $commitShaShort = (& git rev-parse --short HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or !$commitShaShort) {
    throw "Failed to resolve the short commit SHA."
  }

  Write-Host "Git working tree is clean."

  Write-Stage "Version resolved"
  Write-Host "Release mode: $releaseMode"
  Write-Host "Tag: $versionTag"
  Write-Host "Version: $releaseVersion"
  Write-Host "Commit: $commitShaShort"

  Write-Stage "Docker checks"
  Assert-CommandAvailable -Name "docker"
  Invoke-NativeCommand -FilePath "docker" -Arguments @("version") -FailureMessage "Docker is not available."
  Invoke-NativeCommand -FilePath "docker" -Arguments @("buildx", "version") -FailureMessage "Docker buildx is not available."

  Write-Stage "TCR login"
  Write-Host "Registry: $tcrRegistry"
  Write-Host "Namespace: $tcrNamespace"

  try {
    $tcrPassword | & docker login $tcrRegistry --username $tcrUsername --password-stdin
    $loginExitCode = $LASTEXITCODE
  }
  finally {
    $tcrPassword = $null
    $tcrConfig["TCR_PASSWORD"] = $null
  }

  if ($loginExitCode -ne 0) {
    throw "TCR login failed. Exit code: $loginExitCode"
  }

  $ociCreated = [DateTime]::UtcNow.ToString(
    "yyyy-MM-ddTHH:mm:ss.fffZ",
    [System.Globalization.CultureInfo]::InvariantCulture
  )
  $ociSource = "https://github.com/HWYD/ai-mind"
  $postgresImage = "$tcrRegistry/$tcrNamespace/ai-mind-postgres-pgvector:production"
  $webappImage = "$tcrRegistry/$tcrNamespace/ai-mind-webapp:production"
  $projectAssistantServiceImage = "$tcrRegistry/$tcrNamespace/ai-mind-project-assistant-service:production"

  Write-Stage "Write local release metadata"
  $releaseEnvPath = Join-Path $SecretsDir ".release.env"
  Write-ReleaseEnvFile -Path $releaseEnvPath -Registry $tcrRegistry -Namespace $tcrNamespace
  Write-Host "Release env updated: $releaseEnvPath"

  Write-Stage "Build postgres pgvector"
  $postgresBuildArguments = @(
    "buildx",
    "build",
    "--file",
    "deploy/postgres-pgvector.Dockerfile",
    "--platform",
    "linux/amd64",
    "--provenance=false",
    "--sbom=false",
    "--load",
    "--tag",
    $postgresImage,
    "."
  )
  Invoke-NativeCommand -FilePath "docker" -Arguments $postgresBuildArguments -FailureMessage "Postgres pgvector image build failed."

  $commonBuildArguments = @(
    "buildx",
    "build",
    "--file",
    "Dockerfile",
    "--platform",
    "linux/amd64",
    "--provenance=false",
    "--sbom=false",
    "--load",
    "--build-arg",
    "OCI_CREATED=$ociCreated",
    "--build-arg",
    "OCI_REVISION=$commitSha",
    "--build-arg",
    "OCI_SOURCE=$ociSource",
    "--build-arg",
    "OCI_VERSION=$releaseVersion"
  )

  Write-Stage "Build webapp"
  $webappBuildArguments = $commonBuildArguments + @(
    "--target",
    "webapp-runner",
    "--tag",
    $webappImage,
    "."
  )
  Invoke-NativeCommand -FilePath "docker" -Arguments $webappBuildArguments -FailureMessage "Webapp image build failed."

  Write-Stage "Build project-assistant-service"
  $projectAssistantServiceBuildArguments = $commonBuildArguments + @(
    "--target",
    "project-assistant-service-runner",
    "--tag",
    $projectAssistantServiceImage,
    "."
  )
  Invoke-NativeCommand `
    -FilePath "docker" `
    -Arguments $projectAssistantServiceBuildArguments `
    -FailureMessage "Project Assistant Service image build failed."

  Write-Stage "Push postgres pgvector"
  Invoke-NativeCommand `
    -FilePath "docker" `
    -Arguments @("push", $postgresImage) `
    -FailureMessage "Postgres pgvector image push failed."

  Write-Stage "Push webapp"
  Invoke-NativeCommand -FilePath "docker" -Arguments @("push", $webappImage) -FailureMessage "Webapp image push failed."

  Write-Stage "Push project-assistant-service"
  Invoke-NativeCommand `
    -FilePath "docker" `
    -Arguments @("push", $projectAssistantServiceImage) `
    -FailureMessage "Project Assistant Service image push failed."

  if ($Deploy) {
    Write-Stage "Optional deploy"

    if (!(Test-Path -LiteralPath $deployScriptPath -PathType Leaf)) {
      throw "Deployment script not found: $deployScriptPath"
    }

    if ($effectiveSyncEnv) {
      & $deployScriptPath -SyncEnv
    }
    else {
      & $deployScriptPath
    }
  }

  Write-Stage "Final summary"
  Write-Host "Release mode: $releaseMode"
  Write-Host "Git tag: $versionTag"
  Write-Host "Version: $releaseVersion"
  Write-Host "Commit: $commitShaShort"
  Write-Host "Postgres image: $postgresImage"
  Write-Host "Webapp image: $webappImage"
  Write-Host "Project Assistant Service image: $projectAssistantServiceImage"
  Write-Host "Deploy executed: $([bool]$Deploy)"
  Write-Host "SyncEnv executed: $([bool]$effectiveSyncEnv)"

  # Reserved extension point: release notifications can be added here later.
}
finally {
  $tcrPassword = $null
  if ($null -ne $tcrConfig -and $tcrConfig.ContainsKey("TCR_PASSWORD")) {
    $tcrConfig["TCR_PASSWORD"] = $null
  }
  Pop-Location
}
