# music player

**Open-source lossless audio platform.** Upload FLAC, WAV, DSD. Stream bitperfect. EQ in the browser. Route to your external DAC. Potentially mobile app, made for myself becuz I wanted to play stuff that was unreleased on youtube. All vibe coded. 

---

## Quick start

```bash
# 1. Clone
git clone <your-repo> wavform && cd wavform

# 2. Install all deps
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Run everything
./dev.sh
```

- **Frontend:** http://localhost:5173  
- **Backend API:** http://localhost:3001/api/health

---

## Project structure

```
wavform/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express server entry, gzip + cache headers
│   │   ├── db/init.js        # SQLite schema + helpers (better-sqlite3, native + file-backed)
│   │   ├── middleware/compression.js # Gzip for JSON responses (no extra dependency)
│   │   ├── routes/
│   │   │   ├── tracks.js     # Upload, stream, waveform, likes, comments
│   │   │   └── eq.js         # EQ presets CRUD
│   │   └── services/audio.js # ffmpeg transcoding, real waveform peaks, EBU R128 loudness
│   ├── uploads/              # Original lossless files (git-ignored)
│   ├── processed/            # Opus fallback streams + waveform JSON
│   ├── wavform.db            # SQLite database (git-ignored)
│   └── .env                  # Config
│
├── frontend/
│   ├── src/
│   │   ├── main.js           # App entry, routing
│   │   ├── keyboard.js       # Global playback shortcuts
│   │   ├── styles.css        # Design tokens + global styles + responsive breakpoints
│   │   ├── api/client.js     # REST client
│   │   ├── audio/engine.js   # Web Audio API: EQ chain (real bypass), loudness normalization, DAC routing
│   │   ├── stores/app.js     # Reactive state (no framework), persists playback settings
│   │   ├── components/
│   │   │   ├── Nav.js        # Top navigation
│   │   │   ├── Sidebar.js    # Left nav + DAC selector + EQ toggle (off-canvas on mobile)
│   │   │   ├── Player.js     # Waveform player bar + EQ panel + normalization toggle
│   │   │   └── DropOverlay.js # Drop-anywhere upload portal
│   │   └── pages/
│   │       ├── Feed.js       # Discovery grid with infinite scroll
│   │       └── Upload.js     # Multi-file drag-drop upload queue
│   └── vite.config.js        # Dev proxy to backend
│
└── dev.sh                    # One-command dev startup
```

---

## API reference

No accounts, no login — everything is open. Tracks, likes, comments, and EQ presets are anonymous and shared by anyone using the instance.

### Tracks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tracks/upload` | `multipart/form-data`, field `audio` + optional `title` |
| GET  | `/api/tracks` | Feed — supports `?q=`, `?genre=`, `?page=`, `?limit=` |
| GET  | `/api/tracks/:id` | Single track metadata |
| GET  | `/api/tracks/:id/stream` | Range-request audio stream (`?quality=fallback` for Opus) |
| GET  | `/api/tracks/:id/waveform` | `{peaks: number[]}` — 200 normalized samples |
| GET  | `/api/tracks/:id/status` | Processing status poll |
| DELETE | `/api/tracks/:id` | Delete |
| POST | `/api/tracks/:id/like` | Increment like count |
| GET  | `/api/tracks/:id/comments` | Comments list |
| POST | `/api/tracks/:id/comments` | `{body, timestamp_seconds?}` |

### EQ
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/eq/defaults` | Default 10-band config |
| GET  | `/api/eq/presets` | Shared presets, global first |
| POST | `/api/eq/presets` | `{name, bands[]}` |
| DELETE | `/api/eq/presets/:id` | Delete preset |

---

## Audio engine (Web Audio API)

```
AudioMediaElement → GainNode (pre) → BiquadFilter×10 → DynamicsCompressor → GainNode (master) → destination (DAC)
```

**EQ bands:** 10 parametric bands (32Hz–16kHz), lowshelf/peaking/highshelf types. Disabling EQ truly bypasses the chain (ramps every band to 0dB unity gain) rather than just toggling a UI indicator.  
**Loudness normalization:** EBU R128 integrated loudness is computed per upload via ffmpeg's `ebur128` filter; playback applies a gentle pre-EQ gain trim toward -14 LUFS, toggleable per-session.  
**DAC routing:** `audioEl.setSinkId(deviceId)` via `navigator.mediaDevices.enumerateDevices()`.  
**Streaming:** HTTP range requests on the lossless original file, with long-lived immutable cache headers — browser handles buffering, and the next queue item is prefetched ahead of time.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `←` / `→` | Seek -5s / +5s |
| `↑` / `↓` | Volume up / down |
| `M` | Mute / unmute |
| `N` / `P` | Next / previous track |

Disabled while typing in a text field.

---

## Supported formats

| Format | Lossless | Notes |
|--------|----------|-------|
| FLAC | ✅ | Preferred — up to 32-bit/384kHz |
| WAV / AIFF | ✅ | 32-bit float supported |
| ALAC (.m4a) | ✅ | Apple lossless |
| DSD / DSF | ✅ | Stored natively |
| MP3 / AAC / Opus | ❌ | Accepted, stored as-is |

All uploads auto-generate a **320kbps Opus** stream for mobile fallback.

---

## Environment variables (`backend/.env`)

```env
PORT=3001
DB_PATH=./wavform.db
UPLOADS_DIR=./uploads
PROCESSED_DIR=./processed
MAX_FILE_SIZE_MB=2048
ALLOWED_ORIGINS=http://localhost:5173
NODE_ENV=development
```

---

## What's built vs. what's next

### ✅ Built
- Open, account-free upload and browsing — no sign-in required
- Track upload with ffmpeg transcoding pipeline
- Real waveform peaks decoded from the actual audio (not a placeholder pattern)
- EBU R128 loudness analysis with auto-normalized playback (toggleable)
- HTTP range-request streaming (lossless + Opus fallback), immutably cached, with next-track prefetch
- Native file-backed SQLite (better-sqlite3) with indexes — no full-database rewrite per write
- Gzip-compressed JSON API responses
- 10-band parametric EQ with frequency response curve and a true bypass toggle
- DAC device detection and routing
- Shared EQ presets (save/load/apply), persisted playback settings (volume/EQ/normalization) across sessions
- Discovery feed with search + genre filters
- Likes and comments (anonymous)
- Multi-file upload queue, drag-and-drop from anywhere in the app
- Responsive layout (off-canvas sidebar on mobile/tablet) and global keyboard shortcuts (space, arrows, M/N/P)

### 🔜 Next priorities
- **Federation / ActivityPub** — self-hostable nodes that share content
- **Creator payments** — Stripe integration, tip button, pay-per-download
- **Artwork upload** — album art in upload flow
- **Track pages** — dedicated `/tracks/:id` URL with waveform + comments
- **PWA / offline** — service worker caching for mobile
- **Electron wrapper** — desktop app with system-level audio access

---

## License

MIT — fork it, self-host it, contribute back.
