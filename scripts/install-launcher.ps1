# ============================================
#  Install Launcher Service as Windows Startup
# ============================================
#  Adds the launcher micro-service to Windows
#  startup so it runs automatically on boot.
#
#  Usage:
#    .\scripts\install-launcher.ps1
#    .\scripts\install-launcher.ps1 -Remove   # to remove from startup
# ============================================

param(
    [switch]$Remove
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$taskName = "SmartTranscriberLauncher"

# Find python
$venvPython = Join-Path $projectRoot ".venv\Scripts\pythonw.exe"
if (-not (Test-Path $venvPython)) {
    $venvPython = Join-Path $projectRoot "venv-whisper\Scripts\pythonw.exe"
}
if (-not (Test-Path $venvPython)) {
    # Fallback to python.exe (visible window)
    $venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        $venvPython = Join-Path $projectRoot "venv-whisper\Scripts\python.exe"
    }
}

$launcherScript = Join-Path $projectRoot "server\launcher_service.py"

if ($Remove) {
    Write-Host "Removing launcher from startup..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[V] Removed!" -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $venvPython)) {
    Write-Host "[X] Python not found. Run install-whisper-server.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Installing Launcher Service" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Python : $venvPython" -ForegroundColor Gray
Write-Host "  Script : $launcherScript" -ForegroundColor Gray
Write-Host ""

# Remove existing task if present
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Create scheduled task that runs at logon
$action = New-ScheduledTaskAction `
    -Execute $venvPython `
    -Argument "`"$launcherScript`"" `
    -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Smart Hebrew Transcriber - Launcher service (port 8764)" `
    -RunLevel Limited `
    -Force | Out-Null

Write-Host "[V] Launcher registered as startup task!" -ForegroundColor Green
Write-Host ""

# Start it now
Write-Host "Starting launcher now..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName $taskName

Start-Sleep -Seconds 2
try {
    $r = Invoke-RestMethod -Uri "http://localhost:8764/health" -TimeoutSec 3
    Write-Host "[V] Launcher running! Status:" -ForegroundColor Green
    Write-Host "    Whisper: $($r.whisper.running)" -ForegroundColor Gray
    Write-Host "    Ollama:  $($r.ollama.running)" -ForegroundColor Gray
} catch {
    Write-Host "[!] Launcher starting... may take a moment" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Done! Launcher will auto-start on boot" -ForegroundColor Green
Write-Host "  To remove: .\scripts\install-launcher.ps1 -Remove" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Green
