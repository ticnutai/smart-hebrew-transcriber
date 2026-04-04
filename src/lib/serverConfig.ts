/**
 * Centralized server URL configuration.
 * All components should import from here instead of hardcoding localhost:3000.
 */

const DEFAULT_SERVER_URL = '/whisper';

/**
 * Normalize a raw server URL value from localStorage.
 * Converts legacy localhost:3000 references to the Vite proxy path when running locally.
 */
export function normalizeServerUrl(raw: string | null | undefined): string {
  const v = (raw || '').trim();
  if (!v) return DEFAULT_SERVER_URL;

  if (typeof window !== 'undefined') {
    const isLocalPage = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const isPort4000 = window.location.port === '4000';
    const isLegacy3000 = v.includes('localhost:3000') || v.includes('127.0.0.1:3000');
    if (isLocalPage && isPort4000 && isLegacy3000) {
      return DEFAULT_SERVER_URL;
    }
  }

  return v;
}

/** Read the configured server URL from localStorage and normalize it. */
export function getServerUrl(): string {
  return normalizeServerUrl(localStorage.getItem('whisper_server_url'));
}

/** The default proxy path for local whisper server. */
export { DEFAULT_SERVER_URL };
