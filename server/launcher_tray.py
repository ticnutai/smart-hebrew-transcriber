"""
Launcher Tray Service for Smart Hebrew Transcriber
System tray icon with right-click menu + Flask API on port 8764.

Features:
  - Green/red icon based on CUDA server status
  - Right-click menu: Start/Stop CUDA, Open browser, Toggle auto-start, Quit
  - Flask API on port 8764 (same as launcher_service.py)
  - Minimal resources (~20MB RAM, 0 GPU)

Usage:
    python server/launcher_tray.py
    pythonw server/launcher_tray.py   # no console window
"""

import os
import sys
import json
import subprocess
import threading
import time
from pathlib import Path

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    from flask import Flask, jsonify, request
    from flask_cors import CORS
except ImportError:
    print("Missing: pip install flask flask-cors")
    sys.exit(1)

try:
    import pystray
    from PIL import Image, ImageDraw
except ImportError:
    print("Missing: pip install pystray Pillow")
    sys.exit(1)


# ─── Config ─────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
WHISPER_SERVER_SCRIPT = PROJECT_ROOT / "server" / "transcribe_server.py"
WHISPER_PORT = 8765
LAUNCHER_PORT = 8764
TASK_NAME = "SmartTranscriberLauncher"
LOVABLE_URL = "https://a1add912-bd72-490b-949a-bf5fe8ed03b5.lovable.app"

# ─── State ──────────────────────────────────────────────
whisper_process = None
whisper_running = False
ollama_running = False


# ─── Helpers ────────────────────────────────────────────

def find_python():
    """Find the venv python executable."""
    for venv_dir in [".venv", "venv-whisper"]:
        p = PROJECT_ROOT / venv_dir / "Scripts" / "python.exe"
        if p.exists():
            return str(p)
    return None


def check_whisper():
    """Check if whisper server is responding."""
    import urllib.request
    try:
        req = urllib.request.Request(f"http://localhost:{WHISPER_PORT}/health", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read())
            return True, data
    except Exception:
        return False, None


def check_ollama():
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
        return False, "not installed"
    running, _ = check_ollama()
    if running:
        return True, "already running"
    os.environ["OLLAMA_ORIGINS"] = "*"
    try:
        subprocess.Popen(
            [ollama_path, "serve"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        return True, "started"
    except Exception as e:
        return False, str(e)


def start_whisper():
    """Start CUDA whisper server."""
    global whisper_process
    running, data = check_whisper()
    if running:
        return True, "already running", data
    python_path = find_python()
    if not python_path:
        return False, "No venv found", None
    model = "ivrit-ai/whisper-large-v3-turbo-ct2"
    cmd = [python_path, str(WHISPER_SERVER_SCRIPT), "--port", str(WHISPER_PORT), "--model", model]
    try:
        whisper_process = subprocess.Popen(
            cmd, cwd=str(PROJECT_ROOT),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        return True, "starting", None
    except Exception as e:
        return False, str(e), None


def stop_whisper():
    """Stop the whisper server."""
    global whisper_process
    import urllib.request
    try:
        req = urllib.request.Request(f"http://localhost:{WHISPER_PORT}/shutdown", method="POST")
        urllib.request.urlopen(req, timeout=5)
        whisper_process = None
        return True, "shutdown sent"
    except Exception:
        pass
    if whisper_process and whisper_process.poll() is None:
        whisper_process.terminate()
        whisper_process = None
        return True, "terminated"
    return False, "no process"


def is_autostart_enabled():
    """Check if the scheduled task exists."""
    try:
        result = subprocess.run(
            ["schtasks", "/Query", "/TN", TASK_NAME],
            capture_output=True, text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        return result.returncode == 0
    except Exception:
        return False


def toggle_autostart():
    """Toggle Windows startup scheduled task."""
    if is_autostart_enabled():
        # Remove
        subprocess.run(
            ["schtasks", "/Delete", "/TN", TASK_NAME, "/F"],
            capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        return False
    else:
        # Add - find pythonw
        pythonw = None
        for venv_dir in [".venv", "venv-whisper"]:
            p = PROJECT_ROOT / venv_dir / "Scripts" / "pythonw.exe"
            if p.exists():
                pythonw = str(p)
                break
        if not pythonw:
            pythonw = find_python()
        if not pythonw:
            return False

        tray_script = str(PROJECT_ROOT / "server" / "launcher_tray.py")
        subprocess.run(
            [
                "schtasks", "/Create",
                "/TN", TASK_NAME,
                "/TR", f'"{pythonw}" "{tray_script}"',
                "/SC", "ONLOGON",
                "/RL", "LIMITED",
                "/F",
            ],
            capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        return True


# ─── Tray Icon ──────────────────────────────────────────

def create_icon_image(color="green"):
    """Create a simple circle icon."""
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    fill = (76, 175, 80, 255) if color == "green" else (244, 67, 54, 255)
    draw.ellipse([4, 4, size - 4, size - 4], fill=fill)
    # Draw "T" letter in white
    draw.text((size // 2 - 6, size // 2 - 10), "T", fill=(255, 255, 255, 255))
    return img


def on_start_cuda(icon, item):
    ok, msg, _ = start_whisper()
    start_ollama()
    update_icon(icon)


def on_stop_cuda(icon, item):
    stop_whisper()
    update_icon(icon)


def on_open_lovable(icon, item):
    os.startfile(LOVABLE_URL)


def on_open_local(icon, item):
    os.startfile("http://localhost:8080")


def on_toggle_autostart(icon, item):
    toggle_autostart()
    update_menu(icon)


def on_quit(icon, item):
    icon.stop()


def autostart_checked(item):
    return is_autostart_enabled()


def update_icon(icon):
    """Update icon color based on whisper status."""
    global whisper_running, ollama_running
    whisper_running, _ = check_whisper()
    ollama_running, _ = check_ollama()
    color = "green" if whisper_running else "red"
    icon.icon = create_icon_image(color)
    status = "CUDA: " + ("ON" if whisper_running else "OFF")
    status += " | Ollama: " + ("ON" if ollama_running else "OFF")
    icon.title = f"Smart Transcriber - {status}"


def update_menu(icon):
    """Rebuild the menu (for checkbox state refresh)."""
    icon.menu = build_menu()


def build_menu():
    return pystray.Menu(
        pystray.MenuItem("הפעל שרת CUDA", on_start_cuda),
        pystray.MenuItem("עצור שרת CUDA", on_stop_cuda),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("פתח Lovable", on_open_lovable),
        pystray.MenuItem("פתח localhost:8080", on_open_local),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("הפעלה אוטומטית עם Windows", on_toggle_autostart, checked=autostart_checked),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("יציאה", on_quit),
    )


def status_updater(icon):
    """Background thread: update icon every 15 seconds."""
    while icon.visible:
        try:
            update_icon(icon)
        except Exception:
            pass
        time.sleep(15)


# ─── Flask API (same as launcher_service.py) ────────────

app = Flask(__name__)
CORS(app)


@app.route("/health", methods=["GET"])
def health():
    w_ok, w_data = check_whisper()
    o_ok, o_models = check_ollama()
    return jsonify({
        "status": "ok",
        "launcher": True,
        "tray": True,
        "whisper": {"running": w_ok, "port": WHISPER_PORT, "gpu": w_data.get("gpu") if w_data else None},
        "ollama": {"running": o_ok, "models": o_models},
    })


@app.route("/start", methods=["POST"])
def api_start():
    results = {"whisper": None, "ollama": None}
    ok_o, msg_o = start_ollama()
    results["ollama"] = {"ok": ok_o, "message": msg_o}
    ok_w, msg_w, data_w = start_whisper()
    results["whisper"] = {"ok": ok_w, "message": msg_w}
    if data_w:
        results["whisper"]["gpu"] = data_w.get("gpu")
    return jsonify({"ok": ok_w, "results": results})


@app.route("/stop", methods=["POST"])
def api_stop():
    ok, msg = stop_whisper()
    return jsonify({"ok": ok, "message": msg})


@app.route("/status", methods=["GET"])
def api_status():
    w_ok, w_data = check_whisper()
    o_ok, o_models = check_ollama()
    return jsonify({
        "whisper": {"running": w_ok, "data": w_data,
                     "process_alive": whisper_process is not None and whisper_process.poll() is None if whisper_process else False},
        "ollama": {"running": o_ok, "models": o_models},
    })


def run_flask():
    """Run Flask in a background thread."""
    app.run(host="127.0.0.1", port=LAUNCHER_PORT, debug=False, use_reloader=False)


# ─── Main ───────────────────────────────────────────────

def main():
    print(f"Starting Smart Transcriber Tray (API on port {LAUNCHER_PORT})...")

    # Start Flask in background thread
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Create tray icon
    icon = pystray.Icon(
        "smart_transcriber",
        create_icon_image("red"),
        "Smart Transcriber - Starting...",
        menu=build_menu(),
    )

    # Start status updater
    updater = threading.Thread(target=status_updater, args=(icon,), daemon=True)
    updater.start()

    # Run tray (blocks)
    icon.run()


if __name__ == "__main__":
    main()
