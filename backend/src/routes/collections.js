import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, dbRun, dbGet, dbAll } from '../db/init.js';
import { sanitizeTrack } from './tracks.js';

const router = Router();
const TYPES = ['album', 'playlist'];

// owner_token is a write-capability secret (Pastebin-style delete key), not
// an identity — never include it in a response except right after creation.
function sanitizeCollection(c) {
  const { owner_token, ...s } = c;
  return s;
}

function requireOwner(req, res, collection) {
  const token = req.headers['x-owner-token'];
  if (!token || token !== collection.owner_token) {
    res.status(403).json({ error: 'Missing or invalid owner token' });
    return false;
  }
  return true;
}

router.post('/', async (req, res) => {
  const { type, name, artist, year, description } = req.body;
  if (!TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const db = await getDb();
  const id = uuidv4();
  const ownerToken = uuidv4();
  dbRun(db, `INSERT INTO collections (id, type, name, artist, year, description, owner_token) VALUES (?,?,?,?,?,?,?)`,
    [id, type, name.trim(), artist || null, year || null, description || null, ownerToken]);
  res.status(201).json(dbGet(db, 'SELECT * FROM collections WHERE id=?', [id])); // owner_token included — only time
});

router.get('/', async (req, res) => {
  const { type, q, page = 1, limit = 20 } = req.query;
  const off = (parseInt(page) - 1) * Math.min(parseInt(limit), 50);
  const db = await getDb();

  let where = '1=1';
  const params = [];
  if (type && TYPES.includes(type)) { where += ' AND type=?'; params.push(type); }
  if (q) { where += ' AND name LIKE ?'; params.push(`%${q}%`); }

  const collections = dbAll(db, `SELECT * FROM collections WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, Math.min(parseInt(limit), 50), off]);
  const tot = dbGet(db, `SELECT COUNT(*) as c FROM collections WHERE ${where}`, params);

  let counts = {};
  if (collections.length) {
    const placeholders = collections.map(() => '?').join(',');
    const rows = dbAll(db, `SELECT collection_id, COUNT(*) as c FROM collection_tracks WHERE collection_id IN (${placeholders}) GROUP BY collection_id`,
      collections.map(c => c.id));
    counts = Object.fromEntries(rows.map(r => [r.collection_id, r.c]));
  }

  res.json({
    collections: collections.map(c => ({ ...sanitizeCollection(c), track_count: counts[c.id] || 0 })),
    total: tot?.c || 0,
    page: parseInt(page),
  });
});

router.get('/:id', async (req, res) => {
  const db = await getDb();
  const collection = dbGet(db, 'SELECT * FROM collections WHERE id=?', [req.params.id]);
  if (!collection) return res.status(404).json({ error: 'Not found' });

  const trackRows = dbAll(db, `
    SELECT t.* FROM collection_tracks ct
    JOIN tracks t ON t.id = ct.track_id
    WHERE ct.collection_id=? ORDER BY ct.position ASC`, [req.params.id]);

  res.json({ ...sanitizeCollection(collection), tracks: trackRows.map(sanitizeTrack) });
});

router.patch('/:id', async (req, res) => {
  const db = await getDb();
  const collection = dbGet(db, 'SELECT * FROM collections WHERE id=?', [req.params.id]);
  if (!collection) return res.status(404).json({ error: 'Not found' });
  if (!requireOwner(req, res, collection)) return;

  const name = req.body.name !== undefined ? req.body.name.trim() : collection.name;
  const artist = req.body.artist !== undefined ? req.body.artist : collection.artist;
  const year = req.body.year !== undefined ? req.body.year : collection.year;
  const description = req.body.description !== undefined ? req.body.description : collection.description;

  dbRun(db, `UPDATE collections SET name=?, artist=?, year=?, description=?, updated_at=strftime('%s','now') WHERE id=?`,
    [name, artist, year, description, req.params.id]);
  res.json(sanitizeCollection(dbGet(db, 'SELECT * FROM collections WHERE id=?', [req.params.id])));
});

router.delete('/:id', async (req, res) => {
  const db = await getDb();
  const collection = dbGet(db, 'SELECT * FROM collections WHERE id=?', [req.params.id]);
  if (!collection) return res.status(404).json({ error: 'Not found' });
  if (!requireOwner(req, res, collection)) return;

  dbRun(db, 'DELETE FROM collection_tracks WHERE collection_id=?', [req.params.id]);
  dbRun(db, 'DELETE FROM collections WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

router.post('/:id/tracks', async (req, res) => {
  const { track_id } = req.body;
  if (!track_id) return res.status(400).json({ error: 'track_id is required' });
  const db = await getDb();
  const collection = dbGet(db, 'SELECT * FROM collections WHERE id=?', [req.params.id]);
  if (!collection) return res.status(404).json({ error: 'Not found' });
  if (!requireOwner(req, res, collection)) return;

  const track = dbGet(db, 'SELECT id FROM tracks WHERE id=?', [track_id]);
  if (!track) return res.status(404).json({ error: 'Track not found' });

  const max = dbGet(db, 'SELECT MAX(position) as p FROM collection_tracks WHERE collection_id=?', [req.params.id]);
  const position = (max?.p ?? -1) + 1;
  dbRun(db, 'INSERT OR IGNORE INTO collection_tracks (collection_id, track_id, position) VALUES (?,?,?)', [req.params.id, track_id, position]);
  dbRun(db, "UPDATE collections SET updated_at=strftime('%s','now') WHERE id=?", [req.params.id]);
  res.status(201).json({ ok: true });
});

router.delete('/:id/tracks/:trackId', async (req, res) => {
  const db = await getDb();
  const collection = dbGet(db, 'SELECT * FROM collections WHERE id=?', [req.params.id]);
  if (!collection) return res.status(404).json({ error: 'Not found' });
  if (!requireOwner(req, res, collection)) return;

  dbRun(db, 'DELETE FROM collection_tracks WHERE collection_id=? AND track_id=?', [req.params.id, req.params.trackId]);
  res.json({ ok: true });
});

router.put('/:id/tracks/order', async (req, res) => {
  const { track_ids } = req.body;
  if (!Array.isArray(track_ids)) return res.status(400).json({ error: 'track_ids must be an array' });
  const db = await getDb();
  const collection = dbGet(db, 'SELECT * FROM collections WHERE id=?', [req.params.id]);
  if (!collection) return res.status(404).json({ error: 'Not found' });
  if (!requireOwner(req, res, collection)) return;

  const reorder = db.transaction((ids) => {
    ids.forEach((trackId, i) =>
      dbRun(db, 'UPDATE collection_tracks SET position=? WHERE collection_id=? AND track_id=?', [i, req.params.id, trackId]));
  });
  reorder(track_ids);
  res.json({ ok: true });
});

export default router;
