"""
Smart Hebrew Transcriber - Local Whisper Server
Runs Whisper models locally with CUDA acceleration on your GPU.
Supports all HuggingFace Whisper models including ivrit-ai Hebrew-optimized models.
Returns word-level timestamps for audio sync.

Usage:
    python server/transcribe_server.py
    python server/transcribe_server.py --port 8765 --model ivrit-ai/whisper-large-v3-turbo
"""

import os
import sys
import json
import argparse
import tempfile
import time
import warnings
import logging
import traceback as _tb_module
from pathlib import Path
from collections import deque
from datetime import datetime, timezone

# Suppress PyTorch CUDA compatibility warnings for newer GPUs
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "")
warnings.filterwarnings("ignore", message=".*CUDA capability.*")
warnings.filterwarnings("ignore", message=".*cuda capability.*")

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Add NVIDIA cuBLAS DLL directory so CTranslate2 can find cublas64_12.dll
if sys.platform == "win32":
    _dll_dirs_added = []
    for _pkg in ('nvidia.cublas', 'nvidia.cusparse', 'nvidia.cusparselt'):
        try:
            _mod = __import__(_pkg, fromlist=[''])
            _dll_dir = str(Path(_mod.__path__[0]) / "bin")
            if Path(_dll_dir).is_dir():
                os.add_dll_directory(_dll_dir)
                # Also prepend to PATH so ctranslate2.dll can find cublas at runtime
                os.environ["PATH"] = _dll_dir + os.pathsep + os.environ.get("PATH", "")
                _dll_dirs_added.append(_dll_dir)
        except Exception:
            pass
    if _dll_dirs_added:
        print(f"  [DLL] Added {len(_dll_dirs_added)} NVIDIA DLL dirs to PATH + add_dll_directory")

try:
    import faster_whisper
    from flask import Flask, request, jsonify, Response
    from flask_cors import CORS
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install faster-whisper flask flask-cors")
    sys.exit(1)

# torch is optional — only used for GPU info display
try:
    import torch
    _has_torch = True
except Exception:
    _has_torch = False

app = Flask(__name__)
CORS(app)

# ════════════════════════════════════════════════════════════════════
#  DEBUG & MONITORING INFRASTRUCTURE
# ════════════════════════════════════════════════════════════════════

# Structured logger
_log = logging.getLogger("whisper-server")
_log.setLevel(logging.DEBUG)
_log_handler = logging.StreamHandler(sys.stdout)
_log_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"
))
_log.addHandler(_log_handler)

# Request history — keeps last 50 transcriptions for /debug endpoint
MAX_REQUEST_HISTORY = 50
_request_history: deque = deque(maxlen=MAX_REQUEST_HISTORY)

# Server start time
_server_start_time = time.time()

# Concurrency control — only 1 GPU transcription at a time
import threading
_transcribe_lock = threading.Lock()
_transcribe_active: bool = False
_transcribe_active_info: dict | None = None  # metadata about active transcription

# Settings
MAX_UPLOAD_SIZE_MB = 500  # reject files larger than this
WAITRESS_CHANNEL_TIMEOUT = 1800  # 30 minutes — enough for very long audio
WAITRESS_RECV_BYTES = 131072  # 128 KB receive buffer

def _get_gpu_mem() -> dict | None:
    """Get GPU memory usage in MB. Returns None if unavailable."""
    try:
        if _has_torch and torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated(0) / 1024 / 1024
            reserved = torch.cuda.memory_reserved(0) / 1024 / 1024
            total = torch.cuda.get_device_properties(0).total_mem / 1024 / 1024
            return {
                "allocated_mb": round(allocated, 1),
                "reserved_mb": round(reserved, 1),
                "total_mb": round(total, 1),
                "free_mb": round(total - reserved, 1),
                "utilization_pct": round(reserved / total * 100, 1) if total > 0 else 0,
            }
    except Exception:
        pass
    # Fallback: nvidia-smi
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total,memory.used,memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split(",")
            total, used, free = float(parts[0]), float(parts[1]), float(parts[2])
            return {
                "allocated_mb": round(used, 1),
                "reserved_mb": round(used, 1),
                "total_mb": round(total, 1),
                "free_mb": round(free, 1),
                "utilization_pct": round(used / total * 100, 1) if total > 0 else 0,
            }
    except Exception:
        pass
    return None

def _get_system_mem() -> dict:
    """Get system RAM usage."""
    try:
        import psutil
        vm = psutil.virtual_memory()
        return {
            "total_gb": round(vm.total / 1024**3, 1),
            "used_gb": round(vm.used / 1024**3, 1),
            "free_gb": round(vm.available / 1024**3, 1),
            "percent": vm.percent,
        }
    except ImportError:
        pass
    # Fallback for Windows
    try:
        import ctypes
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("sullAvailExtendedVirtual", ctypes.c_ulonglong)]
        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(stat)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
        return {
            "total_gb": round(stat.ullTotalPhys / 1024**3, 1),
            "used_gb": round((stat.ullTotalPhys - stat.ullAvailPhys) / 1024**3, 1),
            "free_gb": round(stat.ullAvailPhys / 1024**3, 1),
            "percent": stat.dwMemoryLoad,
        }
    except Exception:
        return {"error": "unavailable"}

def _cleanup_gpu_memory():
    """Force garbage collection and clear CUDA cache to free VRAM."""
    import gc
    gc.collect()
    if _has_torch and torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
        _log.debug("GPU memory cleaned up (gc + empty_cache + sync)")

def _log_memory_state(label: str):
    """Log current GPU + system memory state."""
    gpu = _get_gpu_mem()
    sys_mem = _get_system_mem()
    gpu_str = f"GPU: {gpu['allocated_mb']:.0f}/{gpu['total_mb']:.0f} MB ({gpu['utilization_pct']:.0f}%)" if gpu else "GPU: N/A"
    ram_str = f"RAM: {sys_mem.get('used_gb', '?')}/{sys_mem.get('total_gb', '?')} GB ({sys_mem.get('percent', '?')}%)"
    _log.info(f"[MEM {label}] {gpu_str} | {ram_str}")

# Global model cache
_model_cache: dict[str, faster_whisper.WhisperModel] = {}
_model_last_used: dict[str, float] = {}  # cache_key → last access timestamp
_current_model_id: str | None = None
MODEL_TTL_SECONDS = 30 * 60  # 30 minutes — evict unused models to free VRAM

# Background model loading state
_model_loading_lock = threading.Lock()
_model_loading: bool = False       # True while a model is being loaded in background
_model_loading_id: str | None = None  # model being loaded
_model_loading_progress: str = ''   # current loading phase description

# Staged audio files — pre-uploaded while model loads in parallel
import uuid
_staged_files: dict[str, dict] = {}  # stage_id → { path, filename, timestamp }
STAGE_TTL_SECONDS = 5 * 60  # 5 minutes — auto-cleanup staged files

# Model registry - maps friendly names to HuggingFace model IDs
MODEL_REGISTRY = {
    # Standard Whisper models
    "tiny": "tiny",
    "base": "base",
    "small": "small",
    "medium": "medium",
    "large-v2": "large-v2",
    "large-v3": "large-v3",
    "large-v3-turbo": "large-v3-turbo",
    # Ivrit.ai Hebrew-optimized models (pre-converted CT2 available)
    "ivrit-ai/faster-whisper-v2-d4": "ivrit-ai/faster-whisper-v2-d4",
    "ivrit-ai/whisper-large-v3-turbo-ct2": "ivrit-ai/whisper-large-v3-turbo-ct2",
    # Ivrit.ai Hebrew models (need HF→CT2 conversion)
    "ivrit-ai/whisper-large-v3-turbo": "ivrit-ai/whisper-large-v3-turbo",
}

DEFAULT_MODEL = "ivrit-ai/whisper-large-v3-turbo-ct2"


_cached_device = None
_cached_gpu_name = None

def get_device():
    """Detect best available device using CTranslate2 (cached)."""
    global _cached_device
    if _cached_device is not None:
        return _cached_device
    try:
        import ctranslate2
        cuda_types = ctranslate2.get_supported_compute_types("cuda")
        if cuda_types and len(cuda_types) > 0:
            _cached_device = "cuda"
            gpu_name = get_gpu_name() or "GPU (CUDA)"
            print(f"  GPU: {gpu_name} (CUDA via CTranslate2)")
            return "cuda"
    except Exception as e:
        print(f"  CUDA detection failed: {e}")
    print("  GPU: Not available, using CPU")
    _cached_device = "cpu"
    return "cpu"


def get_gpu_name():
    """Get GPU name for display (cached)."""
    global _cached_gpu_name
    if _cached_gpu_name is not None:
        return _cached_gpu_name
    if _has_torch:
        try:
            if torch.cuda.is_available():
                _cached_gpu_name = torch.cuda.get_device_name(0)
                return _cached_gpu_name
        except Exception:
            pass
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            _cached_gpu_name = result.stdout.strip()
            return _cached_gpu_name
    except Exception:
        pass
    return None


CONVERT_ROOT = Path.home() / ".cache" / "whisper-models-ct2"


def convert_hf_to_ct2(model_id: str) -> str:
    """Convert a HuggingFace Whisper model to CTranslate2 format."""
    output_dir = CONVERT_ROOT / model_id.replace("/", "--")
    marker = output_dir / "model.bin"

    if marker.exists():
        print(f"  Using cached CT2 conversion: {output_dir}")
        return str(output_dir)

    print(f"  Converting HuggingFace model to CTranslate2: {model_id}...")
    output_dir.mkdir(parents=True, exist_ok=True)

    import ctranslate2
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    print(f"    Downloading from HuggingFace: {model_id}...")
    processor = WhisperProcessor.from_pretrained(model_id)
    processor.save_pretrained(str(output_dir))

    hf_model = WhisperForConditionalGeneration.from_pretrained(model_id)

    print(f"    Converting to CTranslate2 format...")
    converter = ctranslate2.converters.TransformersConverter(
        model_name_or_path=model_id,
    )
    converter.convert(
        output_dir=str(output_dir),
        quantization="float16",
        force=True,
    )

    del hf_model
    print(f"    Conversion complete: {output_dir}")
    return str(output_dir)


# Models that need HF→CT2 conversion (not available as pre-converted on HF Hub)
MODELS_NEEDING_CONVERSION = {
    "ivrit-ai/whisper-large-v3-turbo",
}


def load_model(model_id: str, compute_type_override: str | None = None) -> faster_whisper.WhisperModel:
    """Load or retrieve cached Whisper model.
    compute_type_override: 'float16', 'int8_float16', 'int8', or None (auto)
    """
    global _current_model_id

    device = get_device()
    compute_type = compute_type_override or ("float16" if device == "cuda" else "int8")
    cache_key = f"{model_id}::{compute_type}"

    if cache_key in _model_cache:
        _current_model_id = model_id
        _model_last_used[cache_key] = time.time()
        return _model_cache[cache_key]

    # Check if this model needs conversion from HuggingFace format
    actual_path = model_id
    if model_id in MODELS_NEEDING_CONVERSION:
        actual_path = convert_hf_to_ct2(model_id)

    print(f"\n  Loading model: {model_id} ({device}/{compute_type})...")
    start = time.time()

    def _load(dev, ct):
        return faster_whisper.WhisperModel(
            actual_path,
            device=dev,
            compute_type=ct,
            download_root=str(Path.home() / ".cache" / "whisper-models"),
        )

    try:
        model = _load(device, compute_type)
    except Exception as e:
        err_str = str(e).lower()
        # Fall back to CPU when CUDA runtime libraries are missing (e.g. cublas64_12.dll)
        if device == "cuda" and (
            "cublas" in err_str or "cudnn" in err_str or "cufft" in err_str
            or "cannot be loaded" in err_str or "not found" in err_str
        ):
            print(f"  CUDA library missing ({e}), falling back to CPU...")
            device = "cpu"
            compute_type = "int8"
            model = _load(device, compute_type)
        else:
            raise

    elapsed = time.time() - start
    print(f"  Model loaded in {elapsed:.1f}s")

    # ── Fix mel-bins mismatch for large-v3 / turbo models ──
    # These models expect 128 mel features, but older cached configs may say 80.
    _patch_feature_extractor(model, model_id)

    _model_cache[cache_key] = model
    _model_last_used[cache_key] = time.time()
    _current_model_id = model_id
    return model


def _patch_feature_extractor(model, model_id: str):
    """Ensure the feature extractor uses 128 mel bins for large-v3/turbo models."""
    needs_128 = any(x in str(model_id).lower() for x in ["-v3", "turbo", "large-v3"])
    if not needs_128:
        return
    try:
        current_size = getattr(getattr(model, "feature_extractor", None), "feature_size", None)
        if current_size == 80:
            from faster_whisper.feature_extractor import FeatureExtractor
            model.feature_extractor = FeatureExtractor(feature_size=128)
            print(f"  ✅ Patched feature extractor: 80→128 mel bins for {model_id}")
        else:
            print(f"  feature_extractor.feature_size = {current_size} (OK)")
    except Exception as e:
        print(f"  ⚠️  Could not patch feature extractor: {e}")


# Cached downloaded-model list (refreshed on load/download, not on every health check)
_downloaded_models_cache: list[str] | None = None

def _refresh_downloaded_models_cache():
    """Refresh the cached list of downloaded models."""
    global _downloaded_models_cache
    download_root = str(Path.home() / ".cache" / "whisper-models")
    downloaded = []
    for model_id, resolved in MODEL_REGISTRY.items():
        if resolved in MODELS_NEEDING_CONVERSION:
            ct2_path = CONVERT_ROOT / resolved.replace("/", "--") / "model.bin"
            if ct2_path.exists():
                downloaded.append(model_id)
        else:
            try:
                from faster_whisper.utils import download_model
                path = download_model(resolved, cache_dir=download_root, local_files_only=True)
                if path and os.path.isdir(path):
                    downloaded.append(model_id)
            except Exception:
                pass
    _downloaded_models_cache = downloaded
    return downloaded

def get_downloaded_models():
    """Return cached list of downloaded models (cheap for /health polling)."""
    if _downloaded_models_cache is None:
        return _refresh_downloaded_models_cache()
    return _downloaded_models_cache


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint with memory diagnostics."""
    device = get_device()
    gpu_name = get_gpu_name()
    downloaded = get_downloaded_models()
    gpu_mem = _get_gpu_mem()
    uptime = round(time.time() - _server_start_time, 0)
    return jsonify({
        "status": "ok",
        "device": device,
        "gpu": gpu_name,
        "gpu_memory": gpu_mem,
        "current_model": _current_model_id,
        "cached_models": list(_model_cache.keys()),
        "downloaded_models": downloaded,
        "available_models": list(MODEL_REGISTRY.keys()),
        "model_loading": _model_loading,
        "model_loading_id": _model_loading_id,
        "model_ready": len(_model_cache) > 0,
        "transcribe_active": _transcribe_active,
        "uptime_seconds": int(uptime),
    })


@app.route("/debug", methods=["GET"])
def debug_endpoint():
    """Comprehensive debug info — GPU, RAM, request history, config."""
    gpu_mem = _get_gpu_mem()
    sys_mem = _get_system_mem()
    gpu_name = get_gpu_name()

    # Calculate stats from request history
    recent_requests = list(_request_history)
    total_requests = len(recent_requests)
    errors = [r for r in recent_requests if r.get("error")]
    avg_rtf = 0
    if recent_requests:
        rtfs = [r["rtf"] for r in recent_requests if "rtf" in r and r["rtf"] > 0]
        avg_rtf = round(sum(rtfs) / len(rtfs), 3) if rtfs else 0

    return jsonify({
        "server": {
            "uptime_seconds": int(time.time() - _server_start_time),
            "python_version": sys.version.split()[0],
            "faster_whisper_version": faster_whisper.__version__,
            "torch_version": torch.__version__ if _has_torch else None,
            "pid": os.getpid(),
            "max_upload_mb": MAX_UPLOAD_SIZE_MB,
            "waitress_timeout": WAITRESS_CHANNEL_TIMEOUT,
        },
        "gpu": {
            "name": gpu_name,
            "device": get_device(),
            "memory": gpu_mem,
        },
        "system_memory": sys_mem,
        "models": {
            "current": _current_model_id,
            "cached": list(_model_cache.keys()),
            "loading": _model_loading,
            "loading_id": _model_loading_id,
        },
        "concurrency": {
            "transcribe_active": _transcribe_active,
            "active_info": _transcribe_active_info,
        },
        "stats": {
            "total_requests": total_requests,
            "errors": len(errors),
            "avg_rtf": avg_rtf,
        },
        "recent_requests": recent_requests[-10:],  # last 10
    })


@app.route("/diagnostics", methods=["GET"])
def diagnostics_endpoint():
    """Full request history with performance data."""
    return jsonify({
        "request_history": list(_request_history),
        "total": len(_request_history),
    })


@app.route("/models", methods=["GET"])
def list_models():
    """List available models."""
    return jsonify({
        "models": list(MODEL_REGISTRY.keys()),
        "current": _current_model_id,
        "cached": list(_model_cache.keys()),
    })


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """Transcribe audio file with word-level timestamps."""
    # Get the audio file
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    audio_file = request.files["file"]
    model_id = request.form.get("model", _current_model_id or DEFAULT_MODEL)
    language = request.form.get("language", "he")

    # Resolve model ID
    resolved = MODEL_REGISTRY.get(model_id, model_id)

    # Save to temp file
    suffix = Path(audio_file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        audio_file.save(tmp)
        tmp_path = tmp.name

    try:
        model = load_model(resolved)

        print(f"\n  Transcribing: {audio_file.filename} (model={resolved}, lang={language})")
        start = time.time()

        segments, info = model.transcribe(
            tmp_path,
            language=language if language != "auto" else None,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200,
            ),
        )

        # Collect segments and word timings
        full_text_parts = []
        word_timings = []

        for segment in segments:
            full_text_parts.append(segment.text.strip())
            if segment.words:
                for w in segment.words:
                    word_timings.append({
                        "word": w.word.strip(),
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                        "probability": round(w.probability, 3),
                    })

        full_text = " ".join(full_text_parts)
        elapsed = time.time() - start

        print(f"  Done in {elapsed:.1f}s — {len(word_timings)} words, {info.duration:.1f}s audio")

        return jsonify({
            "text": full_text,
            "wordTimings": word_timings,
            "duration": round(info.duration, 2),
            "language": info.language,
            "model": resolved,
            "processing_time": round(elapsed, 2),
        })

    except Exception as e:
        print(f"  Transcription error: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.route("/transcribe-stream", methods=["POST"])
def transcribe_stream():
    """Transcribe audio with Server-Sent Events — sends each segment as it's ready.
    Supports `start_from` (seconds) to resume from a specific time offset.
    Supports `stage_id` to use a pre-uploaded audio file (parallel upload + preload).

    DEBUG & STABILITY features:
    - Concurrency lock: only 1 GPU transcription at a time (prevents VRAM collision)
    - File size validation: rejects uploads > MAX_UPLOAD_SIZE_MB
    - GPU memory monitoring: logs VRAM before/after transcription
    - CUDA OOM recovery: catches out-of-memory, cleans up, returns graceful error
    - Request history: tracks all requests for /debug endpoint
    - Automatic GPU cleanup after each transcription
    """
    global _transcribe_active, _transcribe_active_info
    request_id = str(uuid.uuid4())[:8]
    request_start = time.time()

    # Resolve audio source: staged file OR uploaded file
    stage_id = request.form.get("stage_id")
    if stage_id and stage_id in _staged_files:
        staged = _staged_files.pop(stage_id)
        tmp_path = staged["path"]
        audio_filename = staged["filename"]
        _log.info(f"[{request_id}] Using staged file: {audio_filename} (stage_id={stage_id[:8]}...)")
    elif "file" in request.files:
        audio_file = request.files["file"]
        audio_filename = audio_file.filename or "audio.webm"
        suffix = Path(audio_filename).suffix or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            audio_file.save(tmp)
            tmp_path = tmp.name
    else:
        return jsonify({"error": "No file or stage_id provided"}), 400

    # ── File size validation ──
    file_size_bytes = os.path.getsize(tmp_path)
    file_size_mb = file_size_bytes / (1024 * 1024)
    if file_size_mb > MAX_UPLOAD_SIZE_MB:
        _log.warning(f"[{request_id}] REJECTED: file too large ({file_size_mb:.1f} MB > {MAX_UPLOAD_SIZE_MB} MB limit)")
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return jsonify({"error": f"File too large: {file_size_mb:.1f} MB (max {MAX_UPLOAD_SIZE_MB} MB)"}), 413

    # ── Concurrency check ──
    if _transcribe_active:
        active_info = _transcribe_active_info or {}
        _log.warning(f"[{request_id}] QUEUED: another transcription in progress ({active_info.get('filename', '?')})")
        # Don't reject — wait for lock in generate()

    model_id = request.form.get("model", _current_model_id or DEFAULT_MODEL)
    language = request.form.get("language", "he")
    start_from = float(request.form.get("start_from", "0"))
    fast_mode = request.form.get("fast_mode", "0") == "1"
    compute_type_req = request.form.get("compute_type")  # float16 | int8_float16 | int8
    beam_size_req = request.form.get("beam_size")  # 1-5
    no_condition_prev = request.form.get("no_condition_on_previous", "0") == "1"
    vad_aggressive = request.form.get("vad_aggressive", "0") == "1"
    hotwords_raw = request.form.get("hotwords", "").strip()
    hotwords = hotwords_raw if hotwords_raw else None
    paragraph_threshold = float(request.form.get("paragraph_threshold", "0"))
    resolved = MODEL_REGISTRY.get(model_id, model_id)

    suffix = Path(audio_filename).suffix or ".webm"

    _log.info(f"[{request_id}] NEW REQUEST: {audio_filename} ({file_size_mb:.1f} MB) model={resolved} lang={language}")

    # If resuming, trim audio to start_from using ffmpeg
    trimmed_path = None
    if start_from > 0:
        try:
            import subprocess
            trimmed_path = tmp_path + "_trimmed" + suffix
            result = subprocess.run(
                ["ffmpeg", "-y", "-ss", str(start_from), "-i", tmp_path, "-c", "copy", trimmed_path],
                capture_output=True, timeout=30,
            )
            if result.returncode == 0 and os.path.exists(trimmed_path):
                _log.info(f"[{request_id}] Trimmed audio from {start_from}s")
            else:
                # Fallback: try with re-encoding if copy fails
                result = subprocess.run(
                    ["ffmpeg", "-y", "-ss", str(start_from), "-i", tmp_path, trimmed_path],
                    capture_output=True, timeout=60,
                )
                if result.returncode != 0:
                    trimmed_path = None
                    _log.warning(f"[{request_id}] ffmpeg trim failed, transcribing full file")
        except Exception as e:
            trimmed_path = None
            _log.warning(f"[{request_id}] trim failed: {e}, transcribing full file")

    def generate():
        global _transcribe_active, _transcribe_active_info
        request_record = {
            "request_id": request_id,
            "filename": audio_filename,
            "file_size_mb": round(file_size_mb, 1),
            "model": resolved,
            "language": language,
            "fast_mode": fast_mode,
            "start_time": datetime.now(timezone.utc).isoformat(),
            "status": "started",
        }

        # ── Acquire GPU lock ──
        lock_wait_start = time.time()
        acquired = _transcribe_lock.acquire(timeout=600)  # wait max 10 min
        lock_wait = time.time() - lock_wait_start
        if not acquired:
            _log.error(f"[{request_id}] TIMEOUT waiting for GPU lock after {lock_wait:.0f}s")
            request_record["status"] = "error"
            request_record["error"] = "GPU lock timeout"
            _request_history.append(request_record)
            yield f"data: {json.dumps({'type': 'error', 'error': 'Server busy — GPU lock timeout. Try again later.'})}\n\n"
            return

        if lock_wait > 1:
            _log.info(f"[{request_id}] Waited {lock_wait:.1f}s for GPU lock")

        _transcribe_active = True
        _transcribe_active_info = {"request_id": request_id, "filename": audio_filename, "started": time.time()}

        try:
            # ── Log memory BEFORE transcription ──
            _log_memory_state(f"{request_id} PRE-TRANSCRIBE")

            # Tell client we're loading the model
            _log.info(f"[{request_id}] SSE: sending 'loading' event")
            yield f"data: {json.dumps({'type': 'loading', 'message': 'Loading model...', 'model': resolved})}\n\n"

            model = load_model(resolved, compute_type_override=compute_type_req)
            _log.info(f"[{request_id}] Model loaded, starting transcription...")

            transcribe_path = trimmed_path if trimmed_path else tmp_path
            actual_file_size = os.path.getsize(transcribe_path)
            beam_size = int(beam_size_req) if beam_size_req and beam_size_req.isdigit() and 1 <= int(beam_size_req) <= 5 else None
            condition_on_prev = not no_condition_prev
            ct_label = compute_type_req or 'auto'
            mode_label = "FAST (batched)" if fast_mode else "normal"
            hotwords_label = f", hotwords='{hotwords[:40]}'" if hotwords else ""
            _log.info(f"[{request_id}] Transcribing: model={resolved}, lang={language}, start_from={start_from}s, mode={mode_label}, compute={ct_label}, beam={beam_size or 'default'}, cond_prev={condition_on_prev}, vad_agg={vad_aggressive}{hotwords_label})")
            start = time.time()

            if fast_mode:
                # Fast mode: BatchedInferencePipeline processes multiple segments in parallel
                from faster_whisper import BatchedInferencePipeline
                pipeline = BatchedInferencePipeline(model=model)
                segments_gen, info = pipeline.transcribe(
                    transcribe_path,
                    language=language if language != "auto" else None,
                    word_timestamps=True,
                    beam_size=beam_size or 1,
                    batch_size=16,
                    condition_on_previous_text=condition_on_prev,
                    hotwords=hotwords,
                )
            else:
                vad_params = dict(
                    min_silence_duration_ms=300 if vad_aggressive else 500,
                    speech_pad_ms=100 if vad_aggressive else 200,
                    threshold=0.5 if vad_aggressive else 0.35,
                )
                segments_gen, info = model.transcribe(
                    transcribe_path,
                    language=language if language != "auto" else None,
                    word_timestamps=True,
                    beam_size=beam_size or 5,
                    vad_filter=True,
                    vad_parameters=vad_params,
                    condition_on_previous_text=condition_on_prev,
                    hotwords=hotwords,
                )

            duration = info.duration or 1.0
            total_duration = duration + start_from  # Full original audio duration

            # First event: metadata with audio duration
            _log.info(f"[{request_id}] SSE: 'info' event (duration={total_duration:.1f}s, lang={info.language})")
            yield f"data: {json.dumps({'type': 'info', 'duration': round(total_duration, 2), 'model': resolved, 'language': info.language, 'start_from': start_from})}\n\n"

            all_text_parts = []
            all_word_timings = []
            segment_count = 0
            prev_seg_end = start_from  # Track previous segment end for paragraph detection
            last_progress_log = 0

            for segment in segments_gen:
                seg_text = segment.text.strip()
                if not seg_text:
                    continue

                segment_count += 1

                # Paragraph detection: if gap between segments exceeds threshold, insert break
                is_paragraph_break = False
                if paragraph_threshold > 0 and prev_seg_end > 0:
                    gap = segment.start - prev_seg_end
                    if gap >= paragraph_threshold:
                        is_paragraph_break = True

                all_text_parts.append(seg_text)

                seg_words = []
                if segment.words:
                    for w in segment.words:
                        # Offset timestamps by start_from so they match original audio
                        wt = {"word": w.word.strip(), "start": round(w.start + start_from, 3), "end": round(w.end + start_from, 3), "probability": round(w.probability, 3)}
                        seg_words.append(wt)
                        all_word_timings.append(wt)

                # Progress is relative to the full audio
                seg_end_in_original = segment.end + start_from
                progress = min(99, round((seg_end_in_original / total_duration) * 100))

                # Log progress every 10% to avoid log spam
                if progress >= last_progress_log + 10:
                    elapsed_so_far = time.time() - start
                    _log.info(f"[{request_id}] progress={progress}% segments={segment_count} words={len(all_word_timings)} elapsed={elapsed_so_far:.1f}s")
                    last_progress_log = progress

                yield f"data: {json.dumps({'type': 'segment', 'text': seg_text, 'words': seg_words, 'progress': progress, 'segEnd': round(seg_end_in_original, 2), 'paragraphBreak': is_paragraph_break})}\n\n"
                prev_seg_end = segment.end

            elapsed = time.time() - start
            full_text = " ".join(all_text_parts)

            rtf = round(elapsed / duration, 2) if duration > 0 else 0
            _log.info(f"[{request_id}] DONE: {elapsed:.1f}s processing, {len(all_word_timings)} words, {duration:.1f}s audio, RTF={rtf}")

            stats = {
                'type': 'done',
                'text': full_text,
                'wordTimings': all_word_timings,
                'duration': round(total_duration, 2),
                'processing_time': round(elapsed, 2),
                'model': resolved,
                'start_from': start_from,
                'rtf': rtf,
                'file_size': actual_file_size,
                'compute_type': compute_type_req or ('float16' if get_device() == 'cuda' else 'int8'),
                'beam_size': beam_size or (1 if fast_mode else 5),
                'fast_mode': fast_mode,
            }
            yield f"data: {json.dumps(stats)}\n\n"

            # ── Record success in request history ──
            request_record["status"] = "success"
            request_record["duration_audio"] = round(total_duration, 1)
            request_record["processing_time"] = round(elapsed, 1)
            request_record["rtf"] = rtf
            request_record["segments"] = segment_count
            request_record["words"] = len(all_word_timings)

        except Exception as e:
            elapsed = time.time() - start if 'start' in dir() else time.time() - request_start
            error_str = str(e)
            error_type = type(e).__name__

            # ── Detect specific error categories ──
            is_cuda_oom = "out of memory" in error_str.lower() or "CUDA" in error_str
            is_corrupt_file = "Invalid data" in error_str or "Errno 1094995529" in error_str
            is_empty_file = "Invalid data" in error_str and file_size_bytes < 1024

            if is_cuda_oom:
                _log.error(f"[{request_id}] CUDA OUT OF MEMORY: {error_str}")
                _log.error(f"[{request_id}] Cleaning GPU memory...")
                _cleanup_gpu_memory()
                user_error = "GPU out of memory — try a shorter audio file or use fast_mode=1"
            elif is_corrupt_file:
                _log.error(f"[{request_id}] CORRUPT/INVALID FILE: {audio_filename} ({file_size_mb:.1f} MB)")
                user_error = f"Invalid audio file: {audio_filename}"
            elif is_empty_file:
                _log.error(f"[{request_id}] EMPTY FILE: {audio_filename}")
                user_error = "Empty or invalid audio file"
            else:
                _log.error(f"[{request_id}] ERROR ({error_type}): {error_str}")
                _log.error(f"[{request_id}] Traceback:\n{_tb_module.format_exc()}")
                user_error = error_str

            request_record["status"] = "error"
            request_record["error"] = f"{error_type}: {error_str[:200]}"
            request_record["error_category"] = "cuda_oom" if is_cuda_oom else "corrupt_file" if is_corrupt_file else "unknown"

            yield f"data: {json.dumps({'type': 'error', 'error': user_error, 'error_type': error_type, 'request_id': request_id})}\n\n"

        finally:
            # ── Always release GPU lock ──
            _transcribe_active = False
            _transcribe_active_info = None
            _transcribe_lock.release()

            # ── Cleanup temp files ──
            for path in [tmp_path, trimmed_path]:
                if path:
                    try:
                        os.unlink(path)
                    except OSError:
                        pass

            # ── Post-transcription GPU cleanup ──
            _cleanup_gpu_memory()
            _log_memory_state(f"{request_id} POST-TRANSCRIBE")

            # ── Record in history ──
            request_record["end_time"] = datetime.now(timezone.utc).isoformat()
            request_record["total_wall_time"] = round(time.time() - request_start, 1)
            _request_history.append(request_record)

    return Response(generate(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@app.route("/stage-audio", methods=["POST"])
def stage_audio():
    """Pre-upload audio file while model loads in parallel.
    Returns a stage_id that can be used in /transcribe-stream instead of uploading again.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    audio_file = request.files["file"]
    filename = audio_file.filename or "audio.webm"
    suffix = Path(filename).suffix or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        audio_file.save(tmp)
        tmp_path = tmp.name

    stage_id = str(uuid.uuid4())
    _staged_files[stage_id] = {
        "path": tmp_path,
        "filename": filename,
        "timestamp": time.time(),
    }

    file_size = os.path.getsize(tmp_path)
    print(f"  [stage] Staged audio: {filename} ({file_size / 1024:.0f} KB) → stage_id={stage_id[:8]}...")

    return jsonify({
        "stage_id": stage_id,
        "filename": filename,
        "file_size": file_size,
    })


@app.route("/load-model", methods=["POST"])
def load_model_endpoint():
    """Pre-load a model into GPU memory (unloads others first to free VRAM)."""
    data = request.get_json() or {}
    model_id = data.get("model", DEFAULT_MODEL)
    resolved = MODEL_REGISTRY.get(model_id, model_id)

    compute_type = data.get("compute_type")  # optional

    try:
        # Unload other models to free GPU memory before loading new one
        for cached_id in list(_model_cache.keys()):
            if not cached_id.startswith(resolved + "::"):
                del _model_cache[cached_id]
                print(f"  Unloaded model to free VRAM: {cached_id}")
        import gc; gc.collect()

        load_model(resolved, compute_type_override=compute_type)
        _refresh_downloaded_models_cache()
        return jsonify({"status": "loaded", "model": resolved})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/preload-stream", methods=["POST"])
def preload_stream():
    """Preload model via SSE — streams loading progress. Non-blocking if model already cached."""
    global _model_loading, _model_loading_id, _model_loading_progress
    data = request.get_json() or {}
    model_id = data.get("model", _current_model_id or DEFAULT_MODEL)
    resolved = MODEL_REGISTRY.get(model_id, model_id)
    compute_type = data.get("compute_type")

    def generate():
        global _model_loading, _model_loading_id, _model_loading_progress
        device = get_device()
        ct = compute_type or ("float16" if device == "cuda" else "int8")
        cache_key = f"{resolved}::{ct}"

        # Already cached — instant response
        if cache_key in _model_cache:
            _model_last_used[cache_key] = time.time()
            yield f"data: {json.dumps({'type': 'status', 'status': 'ready', 'model': resolved, 'message': 'Model already loaded'})}\n\n"
            return

        # Another preload in progress — wait for it
        if _model_loading and _model_loading_id == resolved:
            yield f"data: {json.dumps({'type': 'status', 'status': 'loading', 'model': resolved, 'message': 'Model loading in progress...'})}\n\n"
            # Poll until done
            while _model_loading and _model_loading_id == resolved:
                time.sleep(0.5)
                yield f"data: {json.dumps({'type': 'progress', 'message': _model_loading_progress or 'Loading...'})}\n\n"
            if cache_key in _model_cache:
                yield f"data: {json.dumps({'type': 'status', 'status': 'ready', 'model': resolved, 'message': 'Model loaded'})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'status', 'status': 'error', 'message': 'Loading failed'})}\n\n"
            return

        # Start loading
        with _model_loading_lock:
            _model_loading = True
            _model_loading_id = resolved
            _model_loading_progress = 'Initializing...'

        yield f"data: {json.dumps({'type': 'status', 'status': 'loading', 'model': resolved, 'message': 'Loading model...'})}\n\n"

        try:
            # Unload other models first
            for cached_id in list(_model_cache.keys()):
                if not cached_id.startswith(resolved + "::"):
                    del _model_cache[cached_id]
                    print(f"  [preload] Unloaded model to free VRAM: {cached_id}")
            import gc; gc.collect()

            _model_loading_progress = 'Loading model into GPU...'
            yield f"data: {json.dumps({'type': 'progress', 'message': 'Loading model into GPU...'})}\n\n"

            start = time.time()
            load_model(resolved, compute_type_override=compute_type)
            elapsed = time.time() - start

            _refresh_downloaded_models_cache()
            print(f"  [preload] Model {resolved} loaded in {elapsed:.1f}s")
            yield f"data: {json.dumps({'type': 'status', 'status': 'ready', 'model': resolved, 'elapsed': round(elapsed, 1), 'message': f'Model loaded in {elapsed:.1f}s'})}\n\n"

        except Exception as e:
            print(f"  [preload] Error loading {resolved}: {e}")
            yield f"data: {json.dumps({'type': 'status', 'status': 'error', 'message': str(e)})}\n\n"

        finally:
            with _model_loading_lock:
                _model_loading = False
                _model_loading_id = None
                _model_loading_progress = ''

    return Response(generate(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@app.route("/download-model", methods=["POST"])
def download_model_endpoint():
    """Download a model to disk cache without loading into GPU memory."""
    data = request.get_json() or {}
    model_id = data.get("model", DEFAULT_MODEL)
    resolved = MODEL_REGISTRY.get(model_id, model_id)

    try:
        download_root = str(Path.home() / ".cache" / "whisper-models")

        if resolved in MODELS_NEEDING_CONVERSION:
            # Download and convert HF model to CT2
            path = convert_hf_to_ct2(resolved)
            _refresh_downloaded_models_cache()
            return jsonify({"status": "downloaded", "model": resolved, "path": path})
        else:
            # Use the same cache_dir as WhisperModel uses
            from faster_whisper.utils import download_model
            path = download_model(resolved, cache_dir=download_root)
            _refresh_downloaded_models_cache()
            return jsonify({"status": "downloaded", "model": resolved, "path": str(path)})
    except Exception as e:
        print(f"  Download error for {resolved}: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/unload-models", methods=["POST"])
def unload_models_endpoint():
    """Unload all models from GPU memory."""
    global _current_model_id
    count = len(_model_cache)
    _model_cache.clear()
    _model_last_used.clear()
    _current_model_id = None
    import gc; gc.collect()
    print(f"  Unloaded {count} models from memory")
    return jsonify({"status": "ok", "unloaded": count})


@app.route("/warmup", methods=["POST"])
def warmup_endpoint():
    """Warm up the GPU pipeline with a short silent audio — reduces first-transcription latency."""
    import numpy as np
    model_id = _current_model_id
    if not model_id:
        return jsonify({"status": "no_model", "message": "No model loaded"}), 400
    try:
        # Find the cached model
        model = None
        for key, m in _model_cache.items():
            if key.startswith(model_id + "::"):
                model = m
                break
        if model is None:
            return jsonify({"status": "no_model", "message": "Model not in cache"}), 400

        # Generate 1 second of silence at 16kHz and run through the pipeline
        silence = np.zeros(16000, dtype=np.float32)
        start = time.time()
        segments, _ = model.transcribe(silence, language="he")
        for _ in segments:
            pass  # consume generator
        elapsed = time.time() - start
        print(f"  GPU warmup done in {elapsed:.2f}s")
        return jsonify({"status": "ok", "warmup_time": round(elapsed, 2)})
    except Exception as e:
        print(f"  Warmup failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/shutdown", methods=["POST"])
def shutdown_endpoint():
    """Gracefully shut down the server."""
    global _current_model_id
    _model_cache.clear()
    _model_last_used.clear()
    _current_model_id = None
    import gc; gc.collect()
    print("\n  Server shutdown requested — bye!")
    # Return response before shutting down
    def _do_shutdown():
        import signal
        os.kill(os.getpid(), signal.SIGTERM)
    threading.Timer(0.5, _do_shutdown).start()
    return jsonify({"status": "shutting_down"})


def _evict_stale_models():
    """Background thread: evict models unused for MODEL_TTL_SECONDS and expired staged files."""
    import gc
    while True:
        time.sleep(60)  # check every minute
        now = time.time()
        stale = [k for k, ts in _model_last_used.items() if now - ts > MODEL_TTL_SECONDS]
        for key in stale:
            if key in _model_cache:
                del _model_cache[key]
                del _model_last_used[key]
                print(f"  [cache] Evicted idle model: {key}")
        if stale:
            gc.collect()

        # Cleanup expired staged files
        expired_stages = [sid for sid, info in _staged_files.items() if now - info["timestamp"] > STAGE_TTL_SECONDS]
        for sid in expired_stages:
            info = _staged_files.pop(sid, None)
            if info:
                try:
                    os.unlink(info["path"])
                except OSError:
                    pass
                print(f"  [stage] Cleaned up expired staged file: {info['filename']}")


def main():
    parser = argparse.ArgumentParser(description="Local Whisper Transcription Server")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Default model to preload")
    parser.add_argument("--no-preload", action="store_true", help="Don't preload the default model")
    args = parser.parse_args()

    print("=" * 60)
    print("  Smart Hebrew Transcriber — Local Whisper Server")
    print("=" * 60)
    print(f"  Python: {sys.version.split()[0]}")
    print(f"  faster-whisper: {faster_whisper.__version__}")
    if _has_torch:
        print(f"  PyTorch: {torch.__version__}")
    device = get_device()
    gpu_name = get_gpu_name()
    if gpu_name:
        print(f"  GPU: {gpu_name}")
    print(f"  Port: {args.port}")
    print(f"  Default model: {args.model}")
    print("=" * 60)

    if not args.no_preload:
        resolved = MODEL_REGISTRY.get(args.model, args.model)
        # Non-blocking: preload model in background thread so server starts instantly
        def _bg_preload(model_id):
            global _model_loading, _model_loading_id, _model_loading_progress
            with _model_loading_lock:
                _model_loading = True
                _model_loading_id = model_id
                _model_loading_progress = 'Pre-loading model...'
            try:
                load_model(model_id)
                print("  ✅ Background preload complete — model ready!")
            except Exception as e:
                print(f"  ⚠️  Background preload failed: {e}")
                print("  Server will still run — model will load on first request.")
            finally:
                with _model_loading_lock:
                    _model_loading = False
                    _model_loading_id = None
                    _model_loading_progress = ''

        print(f"\n  Pre-loading model in background: {resolved}...")
        bg_thread = threading.Thread(target=_bg_preload, args=(resolved,), daemon=True)
        bg_thread.start()

    print(f"\n  Server starting on http://localhost:{args.port}")

    # Start model cache eviction thread (frees VRAM for idle models)
    eviction_thread = threading.Thread(target=_evict_stale_models, daemon=True)
    eviction_thread.start()
    print(f"  Model cache TTL: {MODEL_TTL_SECONDS // 60} minutes")
    print(f"  Max upload size: {MAX_UPLOAD_SIZE_MB} MB")
    print(f"  GPU concurrency: 1 (serialized via lock)")

    print("  Endpoints:")
    print("    GET  /health            — Server status + GPU memory info")
    print("    GET  /debug             — Full diagnostics (GPU, RAM, request history)")
    print("    GET  /diagnostics       — Complete request history")
    print("    GET  /models            — Available models")
    print("    POST /transcribe        — Transcribe audio (single response)")
    print("    POST /transcribe-stream — Transcribe audio (SSE streaming)")
    print("    POST /stage-audio       — Pre-upload audio (parallel with preload)")
    print("    POST /load-model        — Load model into GPU memory")
    print("    POST /preload-stream    — Preload model via SSE (background)")
    print("    POST /download-model    — Download model to disk only")
    print("    POST /unload-models     — Free GPU memory")
    print("    POST /shutdown          — Gracefully stop the server")
    print()

    # Use waitress production server with multi-threading (4 threads)
    # Falls back to Flask dev server if waitress is not installed
    try:
        from waitress import serve
        print(f"  Server: waitress (4 threads, timeout={WAITRESS_CHANNEL_TIMEOUT}s)")
        print()
        serve(app, host="0.0.0.0", port=args.port, threads=4,
              channel_timeout=WAITRESS_CHANNEL_TIMEOUT,
              recv_bytes=WAITRESS_RECV_BYTES,
              send_bytes=4096, url_scheme='http')
    except ImportError:
        print("  Server: Flask dev server (install waitress for production)")
        print("  Tip: pip install waitress")
        print()
        app.run(host="0.0.0.0", port=args.port, debug=False)
    except ImportError:
        print("  Server: Flask dev server (install waitress for production)")
        print("  Tip: pip install waitress")
        print()
        app.run(host="0.0.0.0", port=args.port, debug=False)


if __name__ == "__main__":
    main()
