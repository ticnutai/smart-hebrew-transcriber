export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  details?: string;
}

type Listener = (entries: LogEntry[]) => void;

class DebugLogger {
  private entries: LogEntry[] = [];
  private listeners: Set<Listener> = new Set();
  private nextId = 1;
  private maxEntries = 500;

  private emit() {
    const snapshot = [...this.entries];
    this.listeners.forEach((fn) => fn(snapshot));
  }

  private add(level: LogLevel, source: string, message: string, details?: unknown) {
    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      level,
      source,
      message,
      details: details !== undefined ? (typeof details === 'string' ? details : JSON.stringify(details, null, 2)) : undefined,
    };
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }
    this.emit();

    // Also log to console
    const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleFn(`[${source}] ${message}`, details ?? '');
  }

  info(source: string, message: string, details?: unknown) {
    this.add('info', source, message, details);
  }

  warn(source: string, message: string, details?: unknown) {
    this.add('warn', source, message, details);
  }

  error(source: string, message: string, details?: unknown) {
    this.add('error', source, message, details);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getErrorCount(): number {
    return this.entries.filter((e) => e.level === 'error').length;
  }

  clear() {
    this.entries = [];
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Copy-friendly text dump */
  toText(): string {
    return this.entries
      .slice()
      .reverse()
      .map((e) => {
        const time = new Date(e.timestamp).toLocaleTimeString('he-IL', { hour12: false, fractionalSecondDigits: 3 });
        const det = e.details ? `\n    ${e.details.replace(/\n/g, '\n    ')}` : '';
        return `[${time}] [${e.level.toUpperCase()}] [${e.source}] ${e.message}${det}`;
      })
      .join('\n');
  }
}

export const debugLog = new DebugLogger();
