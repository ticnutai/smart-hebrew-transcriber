# ============================================
# Start Local Whisper Server (CUDA)
# ============================================
# Starts the faster-whisper transcription server
# using the venv-whisper virtual environment.
#
# Usage:
#   .\scripts\start-whisper-server.ps1
#   .\scripts\start-whisper-server.ps1 -Port 8765 -Model ivrit-ai/faster-whisper-v2-d4
# ============================================

param(
    [int]$Port = 8765,
    [string]$Model = "ivrit-ai/whisper-large-v3-turbo-ct2"
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$venvPython  = Join-Path $projectRoot "venv-whisper\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "[ERROR] venv-whisper not found. Run: .\scripts\install-whisper-server.ps1" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Smart Hebrew Transcriber - Whisper Server" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Port  : $Port" -ForegroundColor Yellow
Write-Host "  Model : $Model" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

Push-Location $projectRoot
& $venvPython server/transcribe_server.py --port $Port --model $Model
Pop-Location
