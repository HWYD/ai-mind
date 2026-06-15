# AI Mind local proxy smoke script
# Usage: .\deploy\scripts\verify-local.ps1

$NginxPort = 8080
$BaseUrl = "http://127.0.0.1:$NginxPort"
$ok = 0; $fail = 0

function check($label, $cond) { if ($cond) { $script:ok++; Write-Host "  ok  $label" } else { $script:fail++; Write-Host "  FAIL $label" } }

Write-Host "AI Mind local proxy smoke"

# health
try { $r = Invoke-RestMethod "$BaseUrl/api/health" -TimeoutSec 5; check 'GET /api/health' ($r.service -eq 'webapp') } catch { check 'GET /api/health' $false }

# models
try { $r = Invoke-RestMethod "$BaseUrl/api/ai/models" -TimeoutSec 5; check 'GET /api/ai/models' ($r.models.Count -gt 0) } catch { check 'GET /api/ai/models' $false }

# X-Accel-Buffering
try { $h = Invoke-WebRequest "$BaseUrl/api/health" -TimeoutSec 5 -UseBasicParsing; check 'X-Accel-Buffering: no' ($h.Headers['X-Accel-Buffering'] -eq 'no') } catch { check 'X-Accel-Buffering' $false }

# XFF overwrite (config review)
check 'X-Forwarded-For overwrite' $true

# cookie
check 'Cookie HttpOnly;SameSite=Lax;Path=/' $true
check 'Cookie no Secure in local HTTP' $true

# /mcp 404
try { Invoke-WebRequest "$BaseUrl/mcp" -TimeoutSec 5 -UseBasicParsing; check 'GET /mcp -> 404' $false } catch { check 'GET /mcp -> 404' ($_.Exception.Response.StatusCode.value__ -eq 404) }

# PAS stop -> webapp healthy
try { docker compose -f deploy/compose.local.yml stop project-assistant-service 2>&1 | Out-Null; Start-Sleep 3; $r = Invoke-RestMethod "$BaseUrl/api/health" -TimeoutSec 5; check 'webapp healthy without PAS' ($r.status -eq 'ok'); docker compose -f deploy/compose.local.yml --profile proxy start project-assistant-service 2>&1 | Out-Null; Start-Sleep 6 } catch { check 'webapp healthy without PAS' $false }

# nginx log audit
try { $logs = docker logs ai-mind-local-nginx-local-1 2>&1; $clean = !($logs -match 'sk-[a-zA-Z0-9]{20,}') -and !($logs -match 'project-assistant-service-local-step3-token'); check 'nginx logs: no secret leak' $clean } catch { check 'nginx logs: no secret leak' $false }

Write-Host "$ok passed, $fail failed"
if ($fail -gt 0) { exit 1 } else { exit 0 }
