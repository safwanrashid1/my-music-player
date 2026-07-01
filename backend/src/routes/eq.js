import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, dbRun, dbGet, dbAll } from '../db/init.js';

const router = Router();

const DEFAULT_BANDS = [
  { freq: 32,    type: 'lowshelf',  gain: 0, q: 0.7 },
  { freq: 64,    type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 125,   type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 250,   type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 500,   type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 1000,  type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 2000,  type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 4000,  type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 8000,  type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 16000, type: 'highshelf', gain: 0, q: 0.7 },
];

router.get('/presets', async (req, res) => {
  const db = await getDb();
  const presets = dbAll(db, 'SELECT * FROM eq_presets ORDER BY is_global DESC, created_at DESC');
  const parsed = presets.map(p => ({ ...p, bands: JSON.parse(p.bands) }));
  res.json([{ id: 'flat', name: 'Flat (no EQ)', is_global: 1, bands: DEFAULT_BANDS }, ...parsed]);
});

router.post('/presets', async (req, res) => {
  const { name, bands, track_id } = req.body;
  if (!name || !bands) return res.status(400).json({ error: 'name and bands required' });
  const db = await getDb();
  const id = uuidv4();
  dbRun(db, 'INSERT INTO eq_presets (id,track_id,name,bands) VALUES (?,?,?,?)',
    [id, track_id || null, name, JSON.stringify(bands)]);
  const preset = dbGet(db, 'SELECT * FROM eq_presets WHERE id=?', [id]);
  res.status(201).json({ ...preset, bands: JSON.parse(preset.bands) });
});

router.delete('/presets/:id', async (req, res) => {
  const db = await getDb();
  const p = dbGet(db, 'SELECT id FROM eq_presets WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Preset not found' });
  dbRun(db, 'DELETE FROM eq_presets WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

router.get('/defaults', (req, res) => res.json({ bands: DEFAULT_BANDS }));

export default router;
