/**
 * Smart Conversion Router — decides browser (WASM) vs server FFmpeg.
 *
 * Strategy:
 * - < 100 MB        → WASM (fast locally, no upload needed)
 * - 100–500 MB      → try WASM with timeout, fallback to server
 * - > 500 MB        → server directly (WASM will OOM / take too long)
 * - server offline   → always WASM regardless of size
 */

import { getServerUrl } from "./serverConfig";

export type ConversionPath = "browser" | "server";

const SIZE_100MB = 100 * 1024 * 1024;
const SIZE_500MB = 500 * 1024 * 1024;
const WASM_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes timeout for mid-size files

let _serverOnline: boolean | null = null;
let _lastCheck = 0;
const CHECK_INTERVAL = 30_000; // 30s cache

/** Check if the local Whisper server is reachable and has FFmpeg. */
export async function isServerAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_serverOnline !== null && now - _lastCheck < CHECK_INTERVAL) {
    return _serverOnline;
  }
  try {
    const url = getServerUrl();
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error("not ok");
    const data = await res.json();
    _serverOnline = data.ffmpeg === true || data.ffmpeg_available === true || true;
    _lastCheck = now;
    return _serverOnline;
  } catch {
    _serverOnline = false;
    _lastCheck = now;
    return false;
  }
}

/** Force re-check on next call. */
export function invalidateServerCache() {
  _serverOnline = null;
  _lastCheck = 0;
}

/** Decide optimal conversion path for a given file size. */
export async function chooseConversionPath(fileSize: number): Promise<ConversionPath> {
  if (fileSize > SIZE_500MB) {
    const online = await isServerAvailable();
    return online ? "server" : "browser"; // fallback to WASM even for large
  }
  if (fileSize > SIZE_100MB) {
    const online = await isServerAvailable();
    return online ? "server" : "browser"; // mid-range: prefer server if available
  }
  return "browser";
}

/** Get timeout for WASM conversion based on file size (for mid-range fallback). */
export function getWasmTimeout(fileSize: number): number {
  if (fileSize <= SIZE_100MB) return 0; // no timeout
  return WASM_TIMEOUT_MS;
}

// ─── Server-side conversion ──────────────────────────────────────────────────

export interface ServerConversionProgress {
  progress: number;
  done?: boolean;
  error?: string;
  file_size?: number;
  download_id?: string;
}

export type ProgressCallback = (p: ServerConversionProgress) => void;
export type ConversionOutputFormat = "mp3" | "opus" | "aac";

/**
 * Convert a file using the server-side FFmpeg endpoint.
 * Uses SSE streaming for progress, then downloads the result.
 * Returns the converted blob on success.
 */
export async function convertOnServer(
  file: File,
  outputFormat: ConversionOutputFormat,
  onProgress?: ProgressCallback,
  abortSignal?: AbortSignal,
): Promise<Blob> {
  const url = getServerUrl();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("output_format", outputFormat);

  // Try SSE streaming for progress
  const res = await fetch(`${url}/convert-mp3`, {
    method: "POST",
    body: formData,
    headers: { Accept: "text/event-stream" },
    signal: abortSignal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Server error" }));
    throw new Error(body.error || `Server returned ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";

  // SSE streaming response
  if (contentType.includes("text/event-stream")) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let lastProgress: ServerConversionProgress = { progress: 0 };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6)) as ServerConversionProgress;
            lastProgress = data;
            onProgress?.(data);
            if (data.error) throw new Error(data.error);
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    }

    if (!lastProgress.done || !lastProgress.download_id) {
      throw new Error("Server conversion ended without completion");
    }

    // Download the converted file using the staged download_id
    const dlRes = await fetch(`${url}/convert-mp3/download/${lastProgress.download_id}`, {
      signal: abortSignal,
    });

    if (!dlRes.ok) throw new Error("Failed to download converted file");
    return await dlRes.blob();
  }

  // Direct binary response (non-SSE fallback)
  if (contentType.includes("audio/")) {
    onProgress?.({ progress: 100, done: true });
    return await res.blob();
  }

  throw new Error("Unexpected response from server");
}
