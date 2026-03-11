# ===========================================
#  Start Everything - Smart Hebrew Transcriber
#  Ollama + Dev Server
# ===========================================

param(
    [int]$Port = 5050
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Smart Hebrew Transcriber" -ForegroundColor Cyan
Write-Host "  Starting all services..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $PSScriptRoot

# --- 1. Start Ollama ---
Write-Host "[1/3] Starting Ollama server..." -ForegroundColor Yellow

$env:OLLAMA_ORIGINS = "*"
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue

if ($ollamaCmd) {
    $existing = Get-Process ollama -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "      Ollama already running" -ForegroundColor Gray
    } else {
        Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 3
    }
    
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
        $modelCount = ($res.models | Measure-Object).Count
        Write-Host "      [V] Ollama: $modelCount models available" -ForegroundColor Green
    } catch {
        Write-Host "      [!] Ollama: server starting..." -ForegroundColor Yellow
    }
} else {
    Write-Host "      [!] Ollama not installed - run .\scripts\setup-ollama.ps1 first" -ForegroundColor Yellow
}

# --- 2. Install npm deps if needed ---
Write-Host "[2/3] Checking npm dependencies..." -ForegroundColor Yellow

Push-Location $projectRoot
if (-not (Test-Path "node_modules")) {
    Write-Host "      Installing npm packages..." -ForegroundColor Gray
    npm install --silent 2>$null
    Write-Host "      [V] Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "      [V] Dependencies OK" -ForegroundColor Green
}

# --- 3. Start dev server ---
Write-Host "[3/3] Starting dev server on port $Port..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Ready!" -ForegroundColor Green
Write-Host "  App:    http://localhost:$Port" -ForegroundColor Green
Write-Host "  Ollama: http://localhost:11434" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

npm run dev -- --port $Port

Pop-Location
