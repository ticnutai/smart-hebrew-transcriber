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
from pathlib import Path

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

# Global model cache
_model_cache: dict[str, faster_whisper.WhisperModel] = {}
_model_last_used: dict[str, float] = {}  # cache_key → last access timestamp
_current_model_id: str | None = None
MODEL_TTL_SECONDS = 30 * 60  # 30 minutes — evict unused models to free VRAM

# Background model loading state
import threading
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
    """Health check endpoint."""
    device = get_device()
    gpu_name = get_gpu_name()
    downloaded = get_downloaded_models()
    return jsonify({
        "status": "ok",
        "device": device,
        "gpu": gpu_name,
        "current_model": _current_model_id,
        "cached_models": list(_model_cache.keys()),
        "downloaded_models": downloaded,
        "available_models": list(MODEL_REGISTRY.keys()),
        "model_loading": _model_loading,
        "model_loading_id": _model_loading_id,
        "model_ready": len(_model_cache) > 0,
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
    """
    # Resolve audio source: staged file OR uploaded file
    stage_id = request.form.get("stage_id")
    if stage_id and stage_id in _staged_files:
        staged = _staged_files.pop(stage_id)
        tmp_path = staged["path"]
        audio_filename = staged["filename"]
        print(f"  [stream] Using staged file: {audio_filename} (stage_id={stage_id[:8]}...)")
    elif "file" in request.files:
        audio_file = request.files["file"]
        audio_filename = audio_file.filename or "audio.webm"
        suffix = Path(audio_filename).suffix or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            audio_file.save(tmp)
            tmp_path = tmp.name
    else:
        return jsonify({"error": "No file or stage_id provided"}), 400

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
                print(f"  [stream] Trimmed audio from {start_from}s → {trimmed_path}")
            else:
                # Fallback: try with re-encoding if copy fails
                result = subprocess.run(
                    ["ffmpeg", "-y", "-ss", str(start_from), "-i", tmp_path, trimmed_path],
                    capture_output=True, timeout=60,
                )
                if result.returncode != 0:
                    trimmed_path = None
                    print(f"  [stream] ffmpeg trim failed, transcribing full file")
        except Exception as e:
            trimmed_path = None
            print(f"  [stream] trim failed: {e}, transcribing full file")

    def generate():
        try:
            # Tell client we're loading the model (can take 10-30s on first load)
            print(f"  [stream] SSE: sending 'loading' event")
            yield f"data: {json.dumps({'type': 'loading', 'message': 'Loading model...', 'model': resolved})}\n\n"

            model = load_model(resolved, compute_type_override=compute_type_req)
            print(f"  [stream] Model loaded, starting transcription...")

            transcribe_path = trimmed_path if trimmed_path else tmp_path
            file_size_bytes = os.path.getsize(transcribe_path)
            beam_size = int(beam_size_req) if beam_size_req and beam_size_req.isdigit() and 1 <= int(beam_size_req) <= 5 else None
            condition_on_prev = not no_condition_prev
            ct_label = compute_type_req or 'auto'
            mode_label = "FAST (batched)" if fast_mode else "normal"
            hotwords_label = f", hotwords='{hotwords[:40]}'" if hotwords else ""
            print(f"\n  [stream] Transcribing: {audio_filename} (model={resolved}, lang={language}, start_from={start_from}s, mode={mode_label}, compute={ct_label}, beam={beam_size or 'default'}, cond_prev={condition_on_prev}, vad_agg={vad_aggressive}{hotwords_label})")
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
            print(f"  [stream] SSE: sending 'info' event (duration={total_duration:.1f}s, lang={info.language})")
            yield f"data: {json.dumps({'type': 'info', 'duration': round(total_duration, 2), 'model': resolved, 'language': info.language, 'start_from': start_from})}\n\n"

            all_text_parts = []
            all_word_timings = []
            prev_seg_end = start_from  # Track previous segment end for paragraph detection

            for segment in segments_gen:
                seg_text = segment.text.strip()
                if not seg_text:
                    continue

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

                print(f"  [stream] SSE: segment progress={progress}% words={len(seg_words)} text={seg_text[:40]}...")
                yield f"data: {json.dumps({'type': 'segment', 'text': seg_text, 'words': seg_words, 'progress': progress, 'segEnd': round(seg_end_in_original, 2), 'paragraphBreak': is_paragraph_break})}\n\n"
                prev_seg_end = segment.end

            elapsed = time.time() - start
            full_text = " ".join(all_text_parts)
            print(f"  [stream] Done in {elapsed:.1f}s — {len(all_word_timings)} words, {duration:.1f}s audio (offset {start_from}s)")

            rtf = round(elapsed / duration, 2) if duration > 0 else 0
            stats = {
                'type': 'done',
                'text': full_text,
                'wordTimings': all_word_timings,
                'duration': round(total_duration, 2),
                'processing_time': round(elapsed, 2),
                'model': resolved,
                'start_from': start_from,
                'rtf': rtf,
                'file_size': file_size_bytes,
                'compute_type': compute_type_req or ('float16' if get_device() == 'cuda' else 'int8'),
                'beam_size': beam_size or (1 if fast_mode else 5),
                'fast_mode': fast_mode,
            }
            print(f"  [stream] SSE: sending 'done' event ({len(all_word_timings)} words, {elapsed:.1f}s)")
            yield f"data: {json.dumps(stats)}\n\n"

        except Exception as e:
            import traceback
            print(f"  [stream] Error: {e}")
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            if trimmed_path:
                try:
                    os.unlink(trimmed_path)
                except OSError:
                    pass

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

    print("  Endpoints:")
    print("    GET  /health            — Server status + downloaded models")
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
        print("  Server: waitress (4 threads, production)")
        print()
        serve(app, host="0.0.0.0", port=args.port, threads=4,
              channel_timeout=300, recv_bytes=65536,
              send_bytes=4096, url_scheme='http')
    except ImportError:
        print("  Server: Flask dev server (install waitress for production)")
        print("  Tip: pip install waitress")
        print()
        app.run(host="0.0.0.0", port=args.port, debug=False)


if __name__ == "__main__":
    main()
