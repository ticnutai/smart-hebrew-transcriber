import Dexie, { type Table } from 'dexie';

// ─── Interfaces ──────────────────────────────────────────────────
export interface LocalTranscript {
  id: string;
  user_id: string;
  text: string;
  engine: string;
  tags: string[];
  notes: string;
  title: string;
  folder: string;
  category: string;
  is_favorite: boolean;
  audio_file_path: string | null;
  created_at: string;
  updated_at: string;
  /** Audio blob cached locally for offline use */
  audio_blob?: Blob;
  /** Tracks if this record needs to be pushed to cloud */
  _dirty?: boolean;
  /** Tracks if this record was deleted locally and needs cloud delete */
  _deleted?: boolean;
}

export interface LocalPreferences {
  id: string; // always 'current' for singleton
  user_id: string;
  font_size: number;
  font_family: string;
  text_color: string;
  line_height: number;
  sidebar_pinned: boolean;
  theme: string;
  engine: string;
  source_language: string;
  custom_themes: string;
  editor_columns: number;
  updated_at: string;
  _dirty?: boolean;
}

export interface LocalApiKeys {
  id: string; // always 'current' for singleton
  user_identifier: string;
  openai_key: string;
  google_key: string;
  groq_key: string;
  claude_key: string;
  assemblyai_key: string;
  deepgram_key: string;
  updated_at: string;
  _dirty?: boolean;
}

export interface LocalTranscriptionJob {
  id: string;
  user_id: string;
  status: string;
  engine: string;
  file_name: string | null;
  file_path: string | null;
  language: string | null;
  result_text: string | null;
  error_message: string | null;
  progress: number | null;
  partial_result: string | null;
  total_chunks: number | null;
  completed_chunks: number | null;
  created_at: string;
  updated_at: string;
}

export interface SyncMeta {
  id: string; // table name
  last_synced_at: string;
  last_cloud_updated_at: string;
}

// ─── Database ────────────────────────────────────────────────────
class SmartTranscriberDB extends Dexie {
  transcripts!: Table<LocalTranscript, string>;
  preferences!: Table<LocalPreferences, string>;
  apiKeys!: Table<LocalApiKeys, string>;
  jobs!: Table<LocalTranscriptionJob, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super('SmartTranscriberDB');

    this.version(1).stores({
      transcripts: 'id, user_id, created_at, updated_at, folder, engine, is_favorite, _dirty, _deleted',
      preferences: 'id, user_id',
      apiKeys: 'id, user_identifier',
      jobs: 'id, user_id, status, created_at',
      syncMeta: 'id',
    });
  }
}

export const db = new SmartTranscriberDB();

// ─── Helper: check if DB is available ────────────────────────────
let dbAvailable: boolean | null = null;

export async function isDbAvailable(): Promise<boolean> {
  if (dbAvailable !== null) return dbAvailable;
  try {
    await db.syncMeta.count();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  return dbAvailable;
}
