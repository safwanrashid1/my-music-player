import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, createReadStream, statSync, mkdirSync } from 'fs';
import { getDb, dbRun, dbGet, dbAll } from '../db/init.js';
import { processTrack } from '../services/audio.js';

const router = Router();
const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const PROCESSED_DIR = process.env.PROCESSED_DIR || './processed';
const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '2048');
const LOSSLESS = ['.flac','.wav','.aiff','.aif','.alac','.dsf','.dff'];
const ACCEPTED  = [...LOSSLESS, '.mp3','.ogg','.opus','.m4a','.aac'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => { mkdirSync(UPLOADS_DIR, { recursive: true }); cb(null, UPLOADS_DIR); },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const id = uuidv4();
    req.trackId = id;
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ACCEPTED.includes(ext) ? cb(null, true) : cb(new Error(`Unsupported: ${ext}`));
  },
});

// Find-or-create-by-name — the "type an album while uploading" path. Matching
// is case-insensitive so "Live At Leeds" and "live at leeds" land in one album.
function findOrCreateAlbum(db, name) {
  const existing = dbGet(db, "SELECT * FROM collections WHERE type='album' AND name=? COLLATE NOCASE", [name]);
  if (existing) return { collection: existing, created: false };
  const id = uuidv4();
  const ownerToken = uuidv4();
  dbRun(db, `INSERT INTO collections (id, type, name, owner_token) VALUES (?, 'album', ?, ?)`, [id, name, ownerToken]);
  return { collection: dbGet(db, 'SELECT * FROM collections WHERE id=?', [id]), created: true };
}

function appendToCollection(db, collectionId, trackId) {
  const max = dbGet(db, 'SELECT MAX(position) as p FROM collection_tracks WHERE collection_id=?', [collectionId]);
  const position = (max?.p ?? -1) + 1;
  dbRun(db, 'INSERT OR IGNORE INTO collection_tracks (collection_id, track_id, position) VALUES (?,?,?)', [collectionId, trackId, position]);
}

router.post('/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
  const id = req.trackId || uuidv4();
  const ext = path.extname(req.file.originalname).toLowerCase();

  const db = await getDb();
  dbRun(db, `INSERT INTO tracks (id, title, original_filename, original_path, original_format, file_size_bytes, status)
    VALUES (?, ?, ?, ?, ?, ?, 'processing')`,
    [id, req.body.title || path.basename(req.file.originalname, ext),
     req.file.originalname, req.file.path, ext.slice(1).toUpperCase(), req.file.size]);

  let album = null;
  const albumName = req.body.album?.trim();
  if (albumName) {
    const { collection, created } = findOrCreateAlbum(db, albumName);
    appendToCollection(db, collection.id, id);
    album = created ? { id: collection.id, name: collection.name, owner_token: collection.owner_token } : { id: collection.id, name: collection.name };
  }

  res.status(202).json({ id, status: 'processing', is_lossless: LOSSLESS.includes(ext), album });

  // Background
  processTrack(req.file.path, id).then(async ({ metadata, opusPath, waveformData, loudness }) => {
    const db2 = await getDb();
    dbRun(db2, `UPDATE tracks SET
      title=COALESCE(?,title), artist=?, album=?, genre=?, year=?,
      sample_rate=?, bit_depth=?, channels=?, bitrate=?, duration_seconds=?, codec=?,
      original_format=?, opus_path=?, waveform_data=?, lufs_integrated=?, lufs_true_peak=?, status='ready',
      updated_at=strftime('%s','now') WHERE id=?`,
      [metadata.title, metadata.artist, metadata.album, metadata.genre, metadata.year,
       metadata.sample_rate, metadata.bit_depth, metadata.channels, metadata.bitrate,
       metadata.duration_seconds, metadata.codec, metadata.original_format,
       opusPath, JSON.stringify(waveformData), loudness.lufs_integrated, loudness.lufs_true_peak, id]);
  }).catch(async err => {
    console.error(`❌ Processing ${id}:`, err.message);
    const db2 = await getDb();
    dbRun(db2, "UPDATE tracks SET status='error' WHERE id=?", [id]);
  });
});

router.get('/', async (req, res) => {
  const { page = 1, limit = 20, genre, q } = req.query;
  const off = (parseInt(page) - 1) * Math.min(parseInt(limit), 50);
  const db = await getDb();

  let where = "t.status='ready' AND t.is_public=1";
  const params = [];
  if (genre) { where += ' AND t.genre LIKE ?'; params.push(`%${genre}%`); }
  if (q)     { where += ' AND (t.title LIKE ? OR t.artist LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  const tracks = dbAll(db, `
    SELECT t.* FROM tracks t
    WHERE ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Math.min(parseInt(limit), 50), off]);

  const tot = dbGet(db, `SELECT COUNT(*) as c FROM tracks t WHERE ${where}`, params);
  res.json({ tracks: tracks.map(sanitize), total: tot?.c || 0, page: parseInt(page) });
});

router.get('/:id', async (req, res) => {
  const db = await getDb();
  const track = dbGet(db, `
    SELECT t.*, (SELECT COUNT(*) FROM comments c WHERE c.track_id=t.id) as comment_count
    FROM tracks t WHERE t.id=? AND t.is_public=1`,
    [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  dbRun(db, 'UPDATE tracks SET play_count=play_count+1 WHERE id=?', [track.id]);
  res.json(sanitize(track));
});

router.get('/:id/stream', async (req, res) => {
  const db = await getDb();
  const track = dbGet(db, "SELECT * FROM tracks WHERE id=? AND is_public=1", [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const useFallback = req.query.quality === 'fallback';
  const filePath = (useFallback && track.opus_path) ? track.opus_path : track.original_path;
  if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

  const stat = statSync(filePath);
  const range = req.headers.range;
  const mime = getMime(filePath);
  // The bytes behind a given track id + quality never change post-upload,
  // so a long immutable cache lets prefetched/replayed ranges actually hit
  // the browser's HTTP cache instead of re-fetching over the network.
  const cacheControl = 'public, max-age=31536000, immutable';

  if (range) {
    const [s, e] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(s, 10);
    const end = e ? parseInt(e, 10) : stat.size - 1;
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': mime, 'Cache-Control': cacheControl });
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': cacheControl });
    createReadStream(filePath).pipe(res);
  }
});

router.get('/:id/waveform', async (req, res) => {
  const db = await getDb();
  const track = dbGet(db, 'SELECT waveform_data FROM tracks WHERE id=?', [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  const peaks = track.waveform_data ? JSON.parse(track.waveform_data) : [];
  res.json({ peaks });
});

router.get('/:id/status', async (req, res) => {
  const db = await getDb();
  const track = dbGet(db, 'SELECT id,status,sample_rate,bit_depth,duration_seconds,codec,original_format FROM tracks WHERE id=?',
    [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  res.json(track);
});

router.delete('/:id', async (req, res) => {
  const db = await getDb();
  const track = dbGet(db, 'SELECT id FROM tracks WHERE id=?', [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Not found' });
  dbRun(db, 'DELETE FROM tracks WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

router.post('/:id/like', async (req, res) => {
  const db = await getDb();
  const track = dbGet(db, 'SELECT id FROM tracks WHERE id=?', [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  dbRun(db, 'UPDATE tracks SET like_count=like_count+1 WHERE id=?', [req.params.id]);
  res.json({ liked: true });
});

router.delete('/:id/like', async (req, res) => {
  const db = await getDb();
  const track = dbGet(db, 'SELECT id FROM tracks WHERE id=?', [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Track not found' });
  dbRun(db, 'UPDATE tracks SET like_count=MAX(0, like_count-1) WHERE id=?', [req.params.id]);
  res.json({ liked: false });
});

router.get('/:id/comments', async (req, res) => {
  const db = await getDb();
  const comments = dbAll(db, `SELECT * FROM comments WHERE track_id=? ORDER BY created_at ASC`, [req.params.id]);
  res.json(comments);
});

router.post('/:id/comments', async (req, res) => {
  const { body, timestamp_seconds } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Comment body required' });
  const db = await getDb();
  const id = uuidv4();
  dbRun(db, 'INSERT INTO comments (id,track_id,body,timestamp_seconds) VALUES (?,?,?,?)',
    [id, req.params.id, body.trim(), timestamp_seconds || null]);
  const comment = dbGet(db, 'SELECT * FROM comments WHERE id=?', [id]);
  res.status(201).json(comment);
});

const MIMES = { '.flac':'audio/flac', '.wav':'audio/wav', '.aiff':'audio/aiff', '.aif':'audio/aiff', '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.opus':'audio/ogg; codecs=opus', '.m4a':'audio/mp4', '.dsf':'audio/x-dsf' };
function getMime(p) { return MIMES[path.extname(p).toLowerCase()] || 'audio/octet-stream'; }
export function sanitizeTrack(t) {
  const { original_path, opus_path, ...s } = t;
  if (s.waveform_data && typeof s.waveform_data === 'string') {
    try { s.waveform_data = JSON.parse(s.waveform_data); } catch { s.waveform_data = []; }
  }
  return s;
}
const sanitize = sanitizeTrack;

export default router;
