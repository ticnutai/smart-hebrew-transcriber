/**
 * FFmpeg WASM converter v2 – parallel, persistent, resumable.
 *
 * - Multiple FFmpeg WASM instances run in parallel (up to 3)
 * - Queue + results persisted to IndexedDB (survive page refresh)
 * - Failed jobs can be retried; interrupted jobs detected on restore
 * - Real progress via FFmpeg duration detection + time-based tracking
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

export type JobStatus = "queued" | "loading" | "converting" | "done" | "error";

export interface ConversionJob {
  id: string;
  fileName: string;
  fileSize: number;
  file?: File;              // only in-memory, not persisted
  status: JobStatus;
  progress: number;         // 0-100 – real, time-based
  outputBlob?: Blob;
  outputUrl?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  duration?: number;        // total duration in seconds (for real progress)
  retryCount: number;
}

export type JobUpdateCallback = (job: ConversionJob) => void;

const SUPPORTED_EXTENSIONS = new Set([
  "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "3gp", "ogv",
  "ts", "mts", "m2ts", "vob", "mpg", "mpeg",
  "m4a", "wav", "ogg", "flac", "aac", "wma", "opus", "amr",
]);

export function isSupportedFormat(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function getSupportedExtensions(): string[] {
  return [...SUPPORTED_EXTENSIONS];
}

// ─── IndexedDB persistence ───────────────────────────────────────────────────

const DB_NAME = "FFmpegConverterDB";
const DB_VERSION = 1;
const STORE_JOBS = "jobs";
const STORE_OUTPUTS = "outputs";

interface PersistedJob {
  id: string;
  fileName: string;
  fileSize: number;
  status: JobStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  retryCount: number;
}

interface PersistedOutput {
  jobId: string;
  blob: Blob;
  fileName: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_JOBS)) db.createObjectStore(STORE_JOBS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_OUTPUTS)) db.createObjectStore(STORE_OUTPUTS, { keyPath: "jobId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut<T>(store: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(store: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function persistJob(job: ConversionJob) {
  const pj: PersistedJob = {
    id: job.id, fileName: job.fileName, fileSize: job.fileSize,
    status: job.status, startedAt: job.startedAt,
    finishedAt: job.finishedAt, error: job.error, retryCount: job.retryCount,
  };
  await dbPut(STORE_JOBS, pj).catch(() => {});
}

async function persistOutput(jobId: string, blob: Blob, fileName: string) {
  await dbPut(STORE_OUTPUTS, { jobId, blob, fileName, savedAt: Date.now() } as PersistedOutput).catch(() => {});
}

/** Restore completed/failed jobs from IndexedDB on page load */
export async function restorePersistedJobs(): Promise<ConversionJob[]> {
  try {
    const [pJobs, pOutputs] = await Promise.all([
      dbGetAll<PersistedJob>(STORE_JOBS),
      dbGetAll<PersistedOutput>(STORE_OUTPUTS),
    ]);
    const outputMap = new Map(pOutputs.map((o) => [o.jobId, o]));
    return pJobs.map((pj) => {
      const output = outputMap.get(pj.id);
      const job: ConversionJob = {
        id: pj.id, fileName: pj.fileName, fileSize: pj.fileSize,
        status: pj.status, progress: pj.status === "done" ? 100 : 0,
        startedAt: pj.startedAt, finishedAt: pj.finishedAt,
        error: pj.error, retryCount: pj.retryCount,
      };
      if (output) {
        job.outputBlob = output.blob;
        job.outputUrl = URL.createObjectURL(output.blob);
      }
      // Interrupted mid-conversion → mark as error so user can retry
      if (job.status !== "done" && job.status !== "error") {
        job.status = "error";
        job.error = "ההמרה הופסקה — לחץ לנסות שוב";
      }
      return job;
    });
  } catch {
    return [];
  }
}

/** Remove persisted data for a job */
export async function removePersistedJob(jobId: string) {
  await Promise.all([dbDelete(STORE_JOBS, jobId), dbDelete(STORE_OUTPUTS, jobId)]).catch(() => {});
}

// ─── FFmpeg instance pool for parallelism ────────────────────────────────────

const CDN_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
let cachedCoreURL: string | null = null;
let cachedWasmURL: string | null = null;

async function loadCoreUrls() {
  if (cachedCoreURL && cachedWasmURL) return { coreURL: cachedCoreURL, wasmURL: cachedWasmURL };
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${CDN_BASE}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${CDN_BASE}/ffmpeg-core.wasm`, "application/wasm"),
  ]);
  cachedCoreURL = coreURL;
  cachedWasmURL = wasmURL;
  return { coreURL, wasmURL };
}

async function createFFmpegInstance(): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  const { coreURL, wasmURL } = await loadCoreUrls();
  await ffmpeg.load({ coreURL, wasmURL });
  return ffmpeg;
}

const instancePool: FFmpeg[] = [];
const MAX_PARALLEL = 3;
let createdCount = 0;
const waiters: Array<(inst: FFmpeg) => void> = [];

async function acquireFFmpeg(): Promise<FFmpeg> {
  const available = instancePool.pop();
  if (available) return available;
  if (createdCount < MAX_PARALLEL) {
    createdCount++;
    return createFFmpegInstance();
  }
  // Wait for a released instance
  return new Promise((resolve) => { waiters.push(resolve); });
}

function releaseFFmpeg(inst: FFmpeg) {
  const waiter = waiters.shift();
  if (waiter) { waiter(inst); }
  else { instancePool.push(inst); }
}

// ─── Global listeners ────────────────────────────────────────────────────────

const listeners = new Set<JobUpdateCallback>();

export function onJobUpdate(cb: JobUpdateCallback): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyAll(job: ConversionJob) {
  listeners.forEach((cb) => { try { cb({ ...job }); } catch { /* */ } });
}

// ─── Real progress parsing from FFmpeg logs ──────────────────────────────────

function parseDuration(msg: string): number | null {
  const m = msg.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100;
}

function parseTime(msg: string): number | null {
  const m = msg.match(/time=\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100;
}

// ─── Conversion engine ──────────────────────────────────────────────────────

async function runConversion(job: ConversionJob) {
  const file = job.file;
  if (!file) {
    job.status = "error";
    job.error = "קובץ לא נמצא — יש להוסיף מחדש";
    job.finishedAt = Date.now();
    notifyAll(job);
    await persistJob(job);
    return;
  }

  let ffmpeg: FFmpeg | null = null;
  try {
    job.status = "loading";
    job.startedAt = Date.now();
    job.progress = 0;
    notifyAll(job);
    await persistJob(job);

    ffmpeg = await acquireFFmpeg();

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
    const inputName = `in_${job.id}.${ext}`;
    const outputName = `out_${job.id}.mp3`;

    const data = await fetchFile(file);
    await ffmpeg.writeFile(inputName, data);

    job.status = "converting";
    notifyAll(job);
    await persistJob(job);

    // Real progress via log parsing
    let totalDuration = 0;
    const onLog = ({ message }: { message: string }) => {
      if (!totalDuration) {
        const d = parseDuration(message);
        if (d && d > 0) { totalDuration = d; job.duration = d; }
      }
      const t = parseTime(message);
      if (t !== null && totalDuration > 0) {
        job.progress = Math.min(99, Math.round((t / totalDuration) * 100));
        notifyAll(job);
      }
    };
    ffmpeg.on("log", onLog);

    // Fallback progress from built-in event
    const onProgress = ({ progress }: { progress: number }) => {
      if (!totalDuration) {
        job.progress = Math.min(99, Math.round(progress * 100));
        notifyAll(job);
      }
    };
    ffmpeg.on("progress", onProgress);

    await ffmpeg.exec([
      "-i", inputName, "-vn",
      "-acodec", "libmp3lame", "-ab", "192k", "-ar", "44100", "-ac", "2",
      outputName,
    ]);

    ffmpeg.off("log", onLog);
    ffmpeg.off("progress", onProgress);

    const outputData = await ffmpeg.readFile(outputName);
    const bytes = outputData instanceof Uint8Array ? outputData : new TextEncoder().encode(outputData as string);
    const blob = new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    job.status = "done";
    job.progress = 100;
    job.outputBlob = blob;
    job.outputUrl = url;
    job.finishedAt = Date.now();
    notifyAll(job);

    const mp3Name = file.name.replace(/\.[^/.]+$/, "") + ".mp3";
    await Promise.all([persistJob(job), persistOutput(job.id, blob, mp3Name)]);
  } catch (err: unknown) {
    job.status = "error";
    job.error = err instanceof Error ? err.message : "שגיאה לא ידועה";
    job.finishedAt = Date.now();
    notifyAll(job);
    await persistJob(job);
  } finally {
    if (ffmpeg) releaseFFmpeg(ffmpeg);
    drainQueue();
  }
}

// ─── Queue with parallel dispatch ────────────────────────────────────────────

const queue: ConversionJob[] = [];
let activeCount = 0;

function enqueue(job: ConversionJob) {
  queue.push(job);
  drainQueue();
}

function drainQueue() {
  while (activeCount < MAX_PARALLEL && queue.length > 0) {
    const job = queue.shift()!;
    activeCount++;
    runConversion(job).finally(() => { activeCount--; drainQueue(); });
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

let idCounter = 0;

export function convertToMp3(file: File): ConversionJob {
  const job: ConversionJob = {
    id: `conv_${++idCounter}_${Date.now()}`,
    fileName: file.name,
    fileSize: file.size,
    file,
    status: "queued",
    progress: 0,
    retryCount: 0,
  };
  enqueue(job);
  return job;
}

/** Retry a failed job — requires the original File object */
export function retryJob(job: ConversionJob, file: File): ConversionJob {
  job.file = file;
  job.status = "queued";
  job.progress = 0;
  job.error = undefined;
  job.finishedAt = undefined;
  job.retryCount++;
  notifyAll(job);
  enqueue(job);
  return job;
}

export function revokeJobUrl(job: ConversionJob) {
  if (job.outputUrl) URL.revokeObjectURL(job.outputUrl);
}

/** Pre-load FFmpeg WASM core URLs */
export async function preloadFFmpeg(): Promise<void> {
  await loadCoreUrls();
}

export function getMaxParallel(): number {
  return MAX_PARALLEL;
}
