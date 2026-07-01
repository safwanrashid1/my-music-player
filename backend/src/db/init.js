import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || './wavform.db';

let _db = null;

export function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

// Thin wrappers kept so existing call sites (db, sql, params) stay unchanged.
export function dbRun(db, sql, params = []) {
  return db.prepare(sql).run(params);
}

export function dbGet(db, sql, params = []) {
  return db.prepare(sql).get(params) ?? null;
}

export function dbAll(db, sql, params = []) {
  return db.prepare(sql).all(params);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  genre TEXT,
  year INTEGER,
  description TEXT,
  original_filename TEXT NOT NULL,
  original_path TEXT NOT NULL,
  original_format TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  sample_rate INTEGER,
  bit_depth INTEGER,
  channels INTEGER,
  bitrate INTEGER,
  duration_seconds REAL,
  codec TEXT,
  opus_path TEXT,
  waveform_data TEXT,
  lufs_integrated REAL,
  lufs_true_peak REAL,
  status TEXT DEFAULT 'processing',
  is_public INTEGER DEFAULT 1,
  play_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  artwork_path TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS eq_presets (
  id TEXT PRIMARY KEY,
  track_id TEXT,
  name TEXT NOT NULL,
  bands TEXT NOT NULL,
  is_global INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  track_id TEXT,
  body TEXT NOT NULL,
  timestamp_seconds REAL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('album','playlist')),
  name TEXT NOT NULL,
  artist TEXT,
  year INTEGER,
  description TEXT,
  owner_token TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS collection_tracks (
  collection_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  added_at INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (collection_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_tracks_listing ON tracks(status, is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_track ON comments(track_id);
CREATE INDEX IF NOT EXISTS idx_eq_presets_track ON eq_presets(track_id);
CREATE INDEX IF NOT EXISTS idx_collections_type ON collections(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_tracks_collection ON collection_tracks(collection_id, position);
CREATE INDEX IF NOT EXISTS idx_collection_tracks_track ON collection_tracks(track_id);
`;

export async function initDb() {
  mkdirSync(process.env.UPLOADS_DIR || './uploads', { recursive: true });
  mkdirSync(process.env.PROCESSED_DIR || './processed', { recursive: true });

  const db = getDb();
  db.exec(SCHEMA);
  console.log('✅ Database initialized at', path.resolve(DB_PATH));
}

if (process.argv[1] && process.argv[1].endsWith('init.js')) {
  initDb().then(() => process.exit(0));
}
