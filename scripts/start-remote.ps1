<#
.SYNOPSIS
    Start remote access to Smart Hebrew Transcriber via Cloudflare Tunnel.
    Exposes the local Vite frontend and Whisper CUDA server to the internet.

.DESCRIPTION
    This script:
    1. Checks/installs cloudflared (Cloudflare Tunnel CLI)
    2. Starts the Whisper CUDA server (if not running)
    3. Creates tunnels for:
       - Frontend (port 8080) → public URL
       - Whisper server (port 8765) → public URL
       - Ollama (port 11434) → public URL (if Ollama is running)
    4. Prints the public URLs to use from any device

.NOTES
    No Cloudflare account required for quick tunnels.
    URLs change each time - for permanent URLs, set up a Cloudflare account.
#>

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Smart Hebrew Transcriber - Remote Access" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- Step 1: Check/Install cloudflared ---
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $cloudflared) {
    Write-Host "[1/4] cloudflared not found. Installing..." -ForegroundColor Yellow
    
    # Try winget first
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host "  Installing via winget..." -ForegroundColor Gray
        winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements 2>$null
        # Refresh PATH
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
        $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
    }
    
    # Fallback: direct download
    if (-not $cloudflared) {
        Write-Host "  Downloading cloudflared directly..." -ForegroundColor Gray
        $cfDir = "$env:LOCALAPPDATA\cloudflared"
        New-Item -ItemType Directory -Force -Path $cfDir | Out-Null
        $cfExe = "$cfDir\cloudflared.exe"
        
        $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        Invoke-WebRequest -Uri $url -OutFile $cfExe -UseBasicParsing
        
        # Add to PATH for this session
        $env:PATH += ";$cfDir"
        $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
    }
    
    if (-not $cloudflared) {
        Write-Host "  ERROR: Could not install cloudflared." -ForegroundColor Red
        Write-Host "  Install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Red
        exit 1
    }
    Write-Host "  cloudflared installed!" -ForegroundColor Green
} else {
    Write-Host "[1/4] cloudflared found: $($cloudflared.Source)" -ForegroundColor Green
}

# --- Step 2: Check services ---
Write-Host "[2/4] Checking local services..." -ForegroundColor Yellow

$whisperOk = $false
$ollamaOk = $false
$viteOk = $false

try {
    $r = Invoke-RestMethod -Uri "http://localhost:8765/health" -TimeoutSec 3 -ErrorAction Stop
    $whisperOk = $true
    Write-Host "  Whisper server: RUNNING (GPU: $($r.gpu), Model: $($r.current_model))" -ForegroundColor Green
} catch {
    Write-Host "  Whisper server: NOT RUNNING on port 8765" -ForegroundColor Red
    Write-Host "  Start it first: .venv\Scripts\python.exe server/transcribe_server.py" -ForegroundColor Yellow
}

try {
    $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
    $ollamaOk = $true
    Write-Host "  Ollama: RUNNING" -ForegroundColor Green
} catch {
    Write-Host "  Ollama: not running (AI editing won't be available remotely)" -ForegroundColor Gray
}

try {
    $null = Invoke-WebRequest -Uri "http://localhost:8080" -TimeoutSec 3 -ErrorAction Stop
    $viteOk = $true
    Write-Host "  Vite frontend: RUNNING" -ForegroundColor Green
} catch {
    Write-Host "  Vite frontend: NOT RUNNING on port 8080" -ForegroundColor Red
    Write-Host "  Start it first: npx vite --port 8080" -ForegroundColor Yellow
}

if (-not $whisperOk -or -not $viteOk) {
    Write-Host ""
    Write-Host "Required services are not running. Start them first!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Terminal 1: npx vite --port 8080" -ForegroundColor White
    Write-Host "Terminal 2: .venv\Scripts\python.exe server/transcribe_server.py" -ForegroundColor White
    Write-Host "Then run this script again." -ForegroundColor White
    exit 1
}

# --- Step 3: Start tunnels ---
Write-Host "[3/4] Starting Cloudflare Tunnels..." -ForegroundColor Yellow
Write-Host "  (This may take a moment...)" -ForegroundColor Gray

# Temp files for tunnel output
$whisperLog = [System.IO.Path]::GetTempFileName()
$viteLog = [System.IO.Path]::GetTempFileName()
$ollamaLog = [System.IO.Path]::GetTempFileName()

# Start Whisper tunnel
$whisperProc = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--url", "http://localhost:8765", "--no-autoupdate" `
    -PassThru -NoNewWindow -RedirectStandardError $whisperLog

# Start Vite tunnel
$viteProc = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--url", "http://localhost:8080", "--no-autoupdate" `
    -PassThru -NoNewWindow -RedirectStandardError $viteLog

# Optionally start Ollama tunnel
$ollamaProc = $null
if ($ollamaOk) {
    $ollamaProc = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--url", "http://localhost:11434", "--no-autoupdate" `
        -PassThru -NoNewWindow -RedirectStandardError $ollamaLog
}

# Wait for tunnels to establish (parse URLs from logs)
Write-Host "  Waiting for tunnels to connect..." -ForegroundColor Gray

function Get-TunnelUrl {
    param([string]$LogFile, [int]$TimeoutSec = 30)
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
        Start-Sleep -Milliseconds 500
        if (Test-Path $LogFile) {
            $content = Get-Content $LogFile -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
                return $Matches[0]
            }
        }
    }
    return $null
}

$whisperUrl = Get-TunnelUrl -LogFile $whisperLog
$viteUrl = Get-TunnelUrl -LogFile $viteLog
$ollamaUrl = $null
if ($ollamaProc) {
    $ollamaUrl = Get-TunnelUrl -LogFile $ollamaLog -TimeoutSec 15
}

# --- Step 4: Display results ---
Write-Host ""
Write-Host "[4/4] Remote Access Ready!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if ($viteUrl) {
    Write-Host "  Frontend (open in browser):" -ForegroundColor White
    Write-Host "  $viteUrl" -ForegroundColor Cyan -NoNewline
    Write-Host ""
} else {
    Write-Host "  Frontend tunnel: FAILED" -ForegroundColor Red
}

Write-Host ""

if ($whisperUrl) {
    Write-Host "  Whisper Server URL (paste in app settings):" -ForegroundColor White
    Write-Host "  $whisperUrl" -ForegroundColor Cyan -NoNewline
    Write-Host ""
} else {
    Write-Host "  Whisper tunnel: FAILED" -ForegroundColor Red
}

if ($ollamaUrl) {
    Write-Host ""
    Write-Host "  Ollama URL (paste in app settings):" -ForegroundColor White
    Write-Host "  $ollamaUrl" -ForegroundColor Cyan -NoNewline
    Write-Host ""
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "How to use:" -ForegroundColor Yellow
Write-Host "  1. Open the Frontend URL in any browser" -ForegroundColor White
Write-Host "  2. Go to CUDA Server settings > Advanced" -ForegroundColor White
Write-Host "  3. Paste the Whisper Server URL in 'Remote Access'" -ForegroundColor White
if ($ollamaUrl) {
    Write-Host "  4. Paste the Ollama URL in 'Ollama URL'" -ForegroundColor White
}
Write-Host ""
Write-Host "Press Ctrl+C to stop all tunnels." -ForegroundColor Gray
Write-Host ""

# Keep running until Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 5
        # Check if processes are still alive
        if ($whisperProc.HasExited -and $viteProc.HasExited) {
            Write-Host "Tunnels have stopped." -ForegroundColor Yellow
            break
        }
    }
} finally {
    # Cleanup
    Write-Host "Stopping tunnels..." -ForegroundColor Yellow
    if (-not $whisperProc.HasExited) { $whisperProc.Kill() }
    if (-not $viteProc.HasExited) { $viteProc.Kill() }
    if ($ollamaProc -and -not $ollamaProc.HasExited) { $ollamaProc.Kill() }
    Remove-Item $whisperLog, $viteLog, $ollamaLog -ErrorAction SilentlyContinue
    Write-Host "Done." -ForegroundColor Green
}
