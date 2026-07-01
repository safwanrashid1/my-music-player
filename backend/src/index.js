import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { initDb } from './db/init.js';
import { jsonCompression } from './middleware/compression.js';
import tracksRoutes from './routes/tracks.js';
import eqRoutes from './routes/eq.js';
import collectionsRoutes from './routes/collections.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 50 });
app.use('/api/', apiLimiter);
app.use('/api/tracks/upload', uploadLimiter);

app.use('/api', jsonCompression);
app.use('/api/tracks', tracksRoutes);
app.use('/api/eq', eqRoutes);
app.use('/api/collections', collectionsRoutes);

// Content-addressed by track id and never rewritten in place — safe to cache hard.
const staticAssetOpts = { maxAge: '7d', immutable: true };
app.use('/uploads', express.static(path.resolve('uploads'), staticAssetOpts));
app.use('/processed', express.static(path.resolve('processed'), staticAssetOpts));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0', time: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// Await DB init before binding
async function start() {
  await initDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎵 Wavform backend running at http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
