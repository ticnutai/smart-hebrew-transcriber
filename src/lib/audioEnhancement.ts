import { getServerUrl } from "@/lib/serverConfig";

export type EnhancementPreset = "clean" | "ai_voice" | "podcast" | "broadcast";
export type EnhancementOutputFormat = "mp3" | "opus" | "aac";

export interface EnhanceAudioOptions {
  preset: EnhancementPreset;
  outputFormat: EnhancementOutputFormat;
  signal?: AbortSignal;
}

export interface EnhanceAudioResult {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

function parseFileNameFromContentDisposition(cd: string | null, fallback: string): string {
  if (!cd) return fallback;
  const m = cd.match(/filename\*?=(?:UTF-8''|\")?([^;\"\n]+)/i);
  if (!m || !m[1]) return fallback;
  try {
    return decodeURIComponent(m[1].replace(/\"/g, "").trim());
  } catch {
    return m[1].replace(/\"/g, "").trim();
  }
}

function getFallbackName(inputName: string, outputFormat: EnhancementOutputFormat): string {
  const ext = outputFormat === "aac" ? "m4a" : outputFormat;
  return inputName.replace(/\.[^/.]+$/, "") + `.enhanced.${ext}`;
}

export async function enhanceAudioOnServer(file: File, options: EnhanceAudioOptions): Promise<EnhanceAudioResult> {
  const serverUrl = getServerUrl();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("preset", options.preset);
  formData.append("output_format", options.outputFormat);

  const res = await fetch(`${serverUrl}/enhance-audio`, {
    method: "POST",
    body: formData,
    signal: options.signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Server enhancement failed" }));
    throw new Error(body.error || `Enhancement failed (${res.status})`);
  }

  const blob = await res.blob();
  const mimeType = res.headers.get("content-type") || blob.type || "application/octet-stream";
  const fileName = parseFileNameFromContentDisposition(
    res.headers.get("content-disposition"),
    getFallbackName(file.name, options.outputFormat),
  );

  return { blob, fileName, mimeType };
}
