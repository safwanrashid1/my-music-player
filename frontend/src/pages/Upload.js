import { store } from '../stores/app.js';
import { api } from '../api/client.js';
import { saveOwnerToken } from '../ownership.js';

const LOSSLESS = ['.flac', '.wav', '.aiff', '.aif', '.alac', '.dsf', '.dff'];
const ACCEPTED = [...LOSSLESS, '.mp3', '.ogg', '.opus', '.m4a', '.aac'];

// Module-level (not tied to the rendered DOM) so an in-flight upload survives
// the user navigating to another page and back, and so a global drop target
// elsewhere in the app can hand files off even when this page isn't mounted.
const queue = [];
let nextUid = 1;
let onQueueChange = null;
let currentAlbumName = '';

// Matches backend MAX_FILE_SIZE_MB env default; shown to user before upload attempt.
const MAX_FILE_BYTES = 2048 * 1024 * 1024; // 2 GB

export function addFiles(fileList) {
  const album = currentAlbumName.trim();
  const accepted = [];
  for (const file of fileList) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED.includes(ext)) continue;
    // Client-side size guard — catch it before the browser even tries to XHR
    // a multi-GB file, which can lock the UI or clip the upload mid-stream.
    if (file.size > MAX_FILE_BYTES) {
      accepted.push({
        uid: nextUid++, file, ext, album,
        status: 'error',
        error: `File too large: ${fmtBytes(file.size)} (max 2 GB)`,
        progress: 0, trackId: null,
      });
      continue;
    }
    accepted.push({ uid: nextUid++, file, ext, album, status: 'pending', progress: 0, trackId: null, error: null });
  }
  if (accepted.length === 0) return false;
  queue.push(...accepted);
  onQueueChange?.();
  runQueue();
  return true;
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

let queueRunning = false;
async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  for (const item of queue) {
    if (item.status === 'pending') await uploadItem(item);
  }
  queueRunning = false;
}

async function uploadItem(item) {
  item.status = 'uploading';
  onQueueChange?.();
  const title = item.file.name.replace(/\.[^.]+$/, '');
  try {
    const result = await api.uploadTrack(item.file, title, (pct) => {
      item.progress = pct;
      onQueueChange?.();
    }, item.album || undefined);
    // If a new album was created server-side during this upload, save the
    // owner token so this browser can manage it later.
    if (result.album?.owner_token) saveOwnerToken(result.album.id, result.album.owner_token);
    item.trackId = result.id;
    item.status = 'processing';
    onQueueChange?.();
    await pollStatus(item);
  } catch (err) {
    item.status = 'error';
    item.error = err.message;
    onQueueChange?.();
  }
}

function pollStatus(item) {
  return new Promise((resolve) => {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        clearInterval(timer);
        item.status = 'error';
        item.error = 'Processing timed out';
        onQueueChange?.();
        return resolve();
      }
      try {
        const track = await api.getStatus(item.trackId);
        if (track.status === 'ready') {
          clearInterval(timer);
          item.status = 'ready';
          onQueueChange?.();
          resolve();
        } else if (track.status === 'error') {
          clearInterval(timer);
          item.status = 'error';
          item.error = 'Processing failed — check the file and retry.';
          onQueueChange?.();
          resolve();
        }
      } catch { /* transient — keep polling */ }
    }, 2000);
  });
}

export function renderUpload(container) {
  const fmtBadges = [...LOSSLESS, '.mp3', '.aac']
    .map(f => `<span class="badge" style="${f === '.mp3' || f === '.aac' ? 'opacity:0.5' : ''}">${f.slice(1).toUpperCase()}</span>`).join('');

  container.innerHTML = `
    <style>
      /* ── Winamp-inspired: information-dense, no decoration ── */
      #upload-wrap {
        height: 100%; display: flex; flex-direction: column;
        background: var(--playlist-bg);
      }

      /* Compact toolbar at top — like Winamp's Add button bar */
      .up-toolbar {
        display: flex; align-items: center; gap: 6px; padding: 6px 8px;
        background: var(--chrome); flex-shrink: 0;
        box-shadow: inset 0 -1px 0 var(--chrome-lo);
      }
      .up-formats { display: flex; gap: 2px; flex-wrap: wrap; }
      .up-album-input {
        flex: 1; min-width: 120px;
        font-family: var(--mono); font-size: 12px;
        background: var(--lcd); color: var(--lcd-text);
        border: none; padding: 3px 8px; height: 22px;
        box-shadow: inset 1px 1px 0 #000, inset -1px -1px 0 #203040, 0 0 0 1px var(--chrome-edge);
      }
      .up-album-input::placeholder { color: var(--lcd-dim); }
      .up-album-label {
        font-family: var(--pixel); font-size: 11px; color: var(--text3);
        letter-spacing: 1px; white-space: nowrap;
      }

      /* Queue — plain list like Winamp's playlist */
      #upload-queue-list { flex: 1; overflow-y: auto; padding: 2px 0; }

      .upload-row {
        display: flex; align-items: center; gap: 8px;
        padding: 3px 8px;
        color: var(--playlist-text); cursor: default;
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .upload-row:hover { background: rgba(255,255,255,0.03); }
      .up-row-num { font-family: var(--mono); font-size: 11px; color: var(--playlist-dim); width: 22px; text-align: right; flex-shrink: 0; }
      .upload-row-info { flex: 1; min-width: 0; }
      .file-name  { font-family: var(--mono); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .file-size  { font-family: var(--mono); font-size: 10px; color: var(--playlist-dim); }
      .upload-row-status { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

      /* Compact progress bar */
      .progress-bar-wrap { width: 80px; background: rgba(0,100,130,0.3); height: 3px; }
      .progress-bar { height: 100%; background: var(--lcd-text); transition: width 0.2s; }

      .action-btn {
        font-family: var(--pixel); font-size: 11px; padding: 2px 7px; cursor: pointer;
        background: var(--chrome); color: var(--text2); white-space: nowrap;
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
      }
      .action-btn:hover { color: var(--text); background: var(--chrome-hi); }
      .action-btn.del:hover { color: var(--red); }

      /* Drop hint */
      .up-hint {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        flex: 1; padding: 40px; color: var(--playlist-dim);
        font-family: var(--pixel); font-size: 14px; letter-spacing: 2px; text-align: center;
      }
      .up-hint-icon { font-size: 36px; margin-bottom: 10px; opacity: 0.3; }
    </style>

    <div id="upload-wrap">
      <!-- Toolbar: browse + album name + format legend -->
      <div class="up-toolbar">
        <button class="btn btn-primary btn-sm" id="up-browse-btn" title="Click or drop files anywhere">+ Add Files</button>
        <span class="up-album-label">Album:</span>
        <input class="up-album-input" id="album-input" type="text" placeholder="optional — applies to whole batch" />
        <div class="up-formats">${fmtBadges}</div>
      </div>
      <input type="file" id="file-input" accept="${ACCEPTED.join(',')}" multiple style="display:none" />
      <div id="upload-queue-list"></div>
    </div>
  `;

  const fileInput = container.querySelector('#file-input');
  const albumInput = container.querySelector('#album-input');

  albumInput.addEventListener('input', () => { currentAlbumName = albumInput.value; });
  container.querySelector('#up-browse-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) addFiles(e.target.files);
    fileInput.value = '';
  });

  onQueueChange = () => renderQueueList(container);
  renderQueueList(container);
}

function renderQueueList(container) {
  const list = container.querySelector('#upload-queue-list');
  if (!list) return; // page navigated away — queue keeps running in the background

  if (queue.length === 0) {
    list.innerHTML = `<div class="up-hint"><div class="up-hint-icon">♪</div>Drop files here or click "+ Add Files"<br><span style="font-size:11px;letter-spacing:1px">FLAC · WAV · DSD · AIFF · ALAC · MP3 · AAC · Opus</span></div>`;
    return;
  }
  list.innerHTML = queue.map((item, i) => queueRowHtml(item, i)).join('');

  queue.forEach(item => {
    const row = list.querySelector(`[data-uid="${item.uid}"]`);
    if (!row) return;
    row.querySelector('[data-remove]')?.addEventListener('click', () => {
      const idx = queue.indexOf(item);
      if (idx >= 0) queue.splice(idx, 1);
      renderQueueList(container);
    });
    row.querySelector('[data-retry]')?.addEventListener('click', () => {
      item.status = 'pending';
      item.error = null;
      renderQueueList(container);
      runQueue();
    });
    row.querySelector('[data-go-feed]')?.addEventListener('click', () => store.set('page', 'feed'));
  });
}

function queueRowHtml(item, index) {
  const isLossless = LOSSLESS.includes(item.ext);
  const removable  = item.status === 'pending' || item.status === 'ready' || item.status === 'error';

  let statusHtml;
  if (item.status === 'pending') {
    statusHtml = `<span style="font-family:var(--pixel);font-size:11px;color:var(--playlist-dim)">queued</span>`;
  } else if (item.status === 'uploading') {
    statusHtml = `<div class="progress-bar-wrap"><div class="progress-bar" style="width:${item.progress}%"></div></div>
                  <span style="font-family:var(--pixel);font-size:10px;color:var(--lcd-text)">${item.progress}%</span>`;
  } else if (item.status === 'processing') {
    statusHtml = `<span style="font-family:var(--pixel);font-size:11px;color:var(--lcd-text)">⟳ proc</span>`;
  } else if (item.status === 'ready') {
    statusHtml = `<span style="font-family:var(--pixel);font-size:11px;color:var(--lcd-green)">✓ OK</span>
                  <button class="action-btn" data-go-feed>Songs</button>`;
  } else {
    statusHtml = `<span style="font-family:var(--pixel);font-size:11px;color:var(--led-red)" title="${escHtml(item.error || '')}">✗ ERR</span>
                  <button class="action-btn" data-retry>Retry</button>`;
  }

  return `
    <div class="upload-row" data-uid="${item.uid}">
      <span class="up-row-num">${index + 1}.</span>
      <div class="upload-row-info">
        <div class="file-name">${escHtml(item.file.name)}</div>
        <div class="file-size">${fmtBytes(item.file.size)} · ${item.ext.slice(1).toUpperCase()}${isLossless ? '' : ' (lossy)'}</div>
      </div>
      <div class="upload-row-status">${statusHtml}</div>
      ${removable ? `<button class="action-btn del" data-remove title="Remove">✕</button>` : ''}
    </div>
  `;
}

// fmtBytes defined at top of module (alongside addFiles) — removed duplicate here

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
