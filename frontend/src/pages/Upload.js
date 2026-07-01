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

export function addFiles(fileList) {
  const album = currentAlbumName.trim(); // snapshot at add-time
  const accepted = [];
  for (const file of fileList) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED.includes(ext)) continue;
    accepted.push({ uid: nextUid++, file, ext, album, status: 'pending', progress: 0, trackId: null, error: null });
  }
  if (accepted.length === 0) return false;
  queue.push(...accepted);
  onQueueChange?.();
  runQueue();
  return true;
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
  container.innerHTML = `
    <style>
      #upload-wrap { padding: 32px; max-width: 640px; margin: 0 auto; overflow-y: auto; height: 100%; }
      #dropzone {
        border: 1.5px dashed var(--border2);
        border-radius: var(--r2); padding: 48px 24px;
        text-align: center; cursor: pointer; transition: all 0.2s;
        margin-bottom: 20px;
      }
      #dropzone:hover { border-color: var(--accent); background: rgba(92,232,212,0.04); }
      #dropzone .dz-icon { font-size: 42px; margin-bottom: 14px; opacity: 0.5; }
      #dropzone .dz-title { font-size: 16px; font-weight: 500; margin-bottom: 6px; }
      #dropzone .dz-sub { font-size: 13px; color: var(--text2); }
      #dropzone .dz-formats { margin-top: 16px; display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }

      .upload-row {
        display: flex; align-items: center; gap: 12px; padding: 12px 14px;
        background: var(--bg2); border: 0.5px solid var(--border);
        border-radius: var(--r); margin-bottom: 8px;
      }
      .upload-row-info { flex: 1; min-width: 0; }
      .upload-row-status { display: flex; align-items: center; gap: 8px; flex-shrink: 0; max-width: 160px; }
      .file-icon { font-size: 24px; flex-shrink: 0; }
      .file-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .file-size { font-size: 11px; color: var(--text2); margin-top: 2px; }

      .progress-bar-wrap { width: 100px; background: var(--bg3); border-radius: 99px; height: 4px; overflow: hidden; }
      .progress-bar { height: 100%; background: var(--accent); transition: width 0.3s; border-radius: 99px; }

      .action-btn { font-size: 11px; padding: 4px 8px; border-radius: 4px; border: 0.5px solid var(--border2); color: var(--text2); cursor: pointer; transition: all 0.12s; white-space: nowrap; flex-shrink: 0; }
      .action-btn:hover { border-color: var(--text); color: var(--text); }
      .action-btn.del:hover { border-color: var(--red); color: var(--red); }
      .badge-red { border-color: rgba(224,82,82,0.3); color: var(--red); background: rgba(224,82,82,0.08); }

      .format-tip {
        background: rgba(92,232,212,0.05); border: 0.5px solid rgba(92,232,212,0.2);
        border-radius: var(--r); padding: 12px 16px; font-size: 12px;
        color: var(--text2); margin-bottom: 20px;
        display: flex; gap: 8px; align-items: flex-start;
      }
      .format-tip-icon { flex-shrink: 0; color: var(--accent); }
    </style>

    <div id="upload-wrap">
      <h2 style="margin-bottom:20px">Upload tracks</h2>

      <div class="format-tip">
        <span class="format-tip-icon">◈</span>
        <span>Wavform preserves your original file exactly — no re-encoding. FLAC, WAV, DSD, and ALAC are stored bitperfect. A 320kbps Opus stream is auto-generated for mobile listeners. Drop multiple files to queue them.</span>
      </div>

      <div id="dropzone">
        <div class="dz-icon">♪</div>
        <div class="dz-title">Drop audio files here</div>
        <div class="dz-sub">or click to browse — multiple files supported</div>
        <div class="dz-formats">
          ${[...LOSSLESS].map(f => `<span class="badge">${f.slice(1).toUpperCase()}</span>`).join('')}
          <span class="badge" style="opacity:0.5">MP3</span>
          <span class="badge" style="opacity:0.5">AAC</span>
        </div>
      </div>
      <input type="file" id="file-input" accept="${ACCEPTED.join(',')}" multiple style="display:none" />

      <div class="form-group" style="margin-bottom:14px">
        <label style="font-size:12px;color:var(--text2)">Album (optional — applies to all files in this batch)</label>
        <input type="text" id="album-input" placeholder="e.g. Kind of Blue · 1959, or leave blank" />
      </div>

      <div id="upload-queue-list"></div>
    </div>
  `;

  const dropzone = container.querySelector('#dropzone');
  const fileInput = container.querySelector('#file-input');
  const albumInput = container.querySelector('#album-input');

  // Keep the module-level name in sync so addFiles() stamps each new item
  // with the album name that was showing in the input when files were added.
  albumInput.addEventListener('input', () => { currentAlbumName = albumInput.value; });

  // Drag-and-drop anywhere on the page is handled by the global DropOverlay
  // (mounted once in main.js) so dropping here vs. elsewhere behaves the same.
  dropzone.addEventListener('click', () => fileInput.click());

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

  list.innerHTML = queue.map(queueRowHtml).join('');

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

function queueRowHtml(item) {
  const isLossless = LOSSLESS.includes(item.ext);
  const removable = item.status === 'pending' || item.status === 'ready' || item.status === 'error';

  let statusHtml;
  if (item.status === 'pending') {
    statusHtml = `<span class="badge">Queued</span>`;
  } else if (item.status === 'uploading') {
    statusHtml = `<div class="progress-bar-wrap"><div class="progress-bar" style="width:${item.progress}%"></div></div>`;
  } else if (item.status === 'processing') {
    statusHtml = `<span class="badge text-accent">⟳ Processing…</span>`;
  } else if (item.status === 'ready') {
    statusHtml = `<span class="badge" style="border-color:var(--accent);color:var(--accent)">✓ Ready</span><span class="action-btn" data-go-feed>View</span>`;
  } else {
    statusHtml = `<span class="badge badge-red" title="${escHtml(item.error || '')}">✗ Failed</span><span class="action-btn" data-retry>Retry</span>`;
  }

  return `
    <div class="upload-row" data-uid="${item.uid}">
      <span class="file-icon">${isLossless ? '◈' : '♪'}</span>
      <div class="upload-row-info">
        <div class="file-name">${escHtml(item.file.name)}</div>
        <div class="file-size">${formatBytes(item.file.size)} · <span class="badge ${isLossless ? '' : 'badge-amber'}">${item.ext.slice(1).toUpperCase()}</span></div>
      </div>
      <div class="upload-row-status">${statusHtml}</div>
      ${removable ? `<button class="action-btn del" data-remove title="Remove">✕</button>` : ''}
    </div>
  `;
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
