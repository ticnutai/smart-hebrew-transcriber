"""
Launcher Micro-Service for Smart Hebrew Transcriber
Tiny HTTP server on port 8764 that can start/check the CUDA whisper server.
Allows the Lovable website to start the server with a single button click.

Auto-start: Place shortcut in shell:startup (see install instructions below).

Usage:
    python server/launcher_service.py
    python server/launcher_service.py --port 8764
"""

import os
import sys
import json
import subprocess
import time
import signal
from pathlib import Path

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

try:
    from flask import Flask, jsonify, request
    from flask_cors import CORS
except ImportError:
    print("Missing: pip install flask flask-cors")
    sys.exit(1)

app = Flask(__name__)
CORS(app)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WHISPER_SERVER_SCRIPT = PROJECT_ROOT / "server" / "transcribe_server.py"
WHISPER_PORT = 8765
WHISPER_PROCESS = None


def find_python():
    """Find the venv python executable."""
    for venv_dir in [".venv", "venv-whisper"]:
        p = PROJECT_ROOT / venv_dir / "Scripts" / "python.exe"
        if p.exists():
            return str(p)
    return None


def is_whisper_running():
    """Check if whisper server is responding on its port."""
    import urllib.request
    try:
        req = urllib.request.Request(
            f"http://localhost:{WHISPER_PORT}/health",
            method="GET"
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read())
            return True, data
    except Exception:
        return False, None


def is_ollama_running():
    """Check if Ollama is responding."""
    import urllib.request
    try:
        req = urllib.request.Request("http://localhost:11434/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read())
            return True, len(data.get("models", []))
    except Exception:
        return False, 0


def start_ollama():
    """Start Ollama in background if available."""
    import shutil
    ollama_path = shutil.which("ollama")
    if not ollama_path:
        return False, "Ollama not installed"

    running, _ = is_ollama_running()
    if running:
        return True, "already running"

    os.environ["OLLAMA_ORIGINS"] = "*"
    try:
        subprocess.Popen(
            [ollama_path, "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        return True, "started"
    except Exception as e:
        return False, str(e)


@app.route("/health", methods=["GET"])
def health():
    whisper_ok, whisper_data = is_whisper_running()
    ollama_ok, ollama_models = is_ollama_running()
    return jsonify({
        "status": "ok",
        "launcher": True,
        "whisper": {
            "running": whisper_ok,
            "port": WHISPER_PORT,
            "gpu": whisper_data.get("gpu") if whisper_data else None,
        },
        "ollama": {
            "running": ollama_ok,
            "models": ollama_models,
        },
    })


@app.route("/start", methods=["POST"])
def start_all():
    """Start CUDA whisper server (and Ollama if available)."""
    global WHISPER_PROCESS

    results = {"whisper": None, "ollama": None}

    # 1. Start Ollama
    ok, msg = start_ollama()
    results["ollama"] = {"ok": ok, "message": msg}

    # 2. Check if whisper already running
    running, data = is_whisper_running()
    if running:
        results["whisper"] = {
            "ok": True,
            "message": "already running",
            "gpu": data.get("gpu") if data else None,
        }
        return jsonify({"ok": True, "results": results})

    # 3. Find python
    python_path = find_python()
    if not python_path:
        results["whisper"] = {
            "ok": False,
            "message": "No venv found (.venv or venv-whisper). Run install-whisper-server.ps1 first.",
        }
        return jsonify({"ok": False, "results": results}), 500

    # 4. Start whisper server
    model = "ivrit-ai/whisper-large-v3-turbo-ct2"
    cmd = [
        python_path,
        str(WHISPER_SERVER_SCRIPT),
        "--port", str(WHISPER_PORT),
        "--model", model,
    ]

    try:
        WHISPER_PROCESS = subprocess.Popen(
            cmd,
            cwd=str(PROJECT_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        results["whisper"] = {
            "ok": True,
            "message": "starting",
            "pid": WHISPER_PROCESS.pid,
            "model": model,
        }
        return jsonify({"ok": True, "results": results})
    except Exception as e:
        results["whisper"] = {"ok": False, "message": str(e)}
        return jsonify({"ok": False, "results": results}), 500


@app.route("/stop", methods=["POST"])
def stop_whisper():
    """Stop the whisper server if we started it."""
    global WHISPER_PROCESS
    # Try to call whisper's own shutdown endpoint first
    import urllib.request
    try:
        req = urllib.request.Request(
            f"http://localhost:{WHISPER_PORT}/shutdown",
            method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
        WHISPER_PROCESS = None
        return jsonify({"ok": True, "message": "shutdown sent"})
    except Exception:
        pass

    # Fallback: kill process
    if WHISPER_PROCESS and WHISPER_PROCESS.poll() is None:
        WHISPER_PROCESS.terminate()
        WHISPER_PROCESS = None
        return jsonify({"ok": True, "message": "terminated"})

    return jsonify({"ok": False, "message": "no process to stop"})


@app.route("/status", methods=["GET"])
def status():
    """Detailed status of all services."""
    whisper_ok, whisper_data = is_whisper_running()
    ollama_ok, ollama_models = is_ollama_running()

    return jsonify({
        "whisper": {
            "running": whisper_ok,
            "data": whisper_data,
            "process_alive": WHISPER_PROCESS is not None and WHISPER_PROCESS.poll() is None if WHISPER_PROCESS else False,
        },
        "ollama": {
            "running": ollama_ok,
            "models": ollama_models,
        },
    })


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Launcher micro-service")
    parser.add_argument("--port", type=int, default=8764)
    args = parser.parse_args()

    print(f"")
    print(f"========================================")
    print(f"  Launcher Service - port {args.port}")
    print(f"========================================")
    print(f"  POST /start  → Start CUDA server + Ollama")
    print(f"  POST /stop   → Stop CUDA server")
    print(f"  GET  /health → Service health check")
    print(f"  GET  /status → Detailed status")
    print(f"========================================")
    print(f"")

    app.run(host="127.0.0.1", port=args.port, debug=False)
