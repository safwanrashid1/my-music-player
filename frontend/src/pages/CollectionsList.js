import { store } from '../stores/app.js';
import { api } from '../api/client.js';
import { saveOwnerToken } from '../ownership.js';
import { playCollection } from '../components/Player.js';

const ACCENT_COLORS = ['#5CE8D4','#F5A623','#E05252','#7C3AED','#2563EB','#059669','#D97706'];

function colorFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xFFFFFFFF;
  return ACCENT_COLORS[Math.abs(h) % ACCENT_COLORS.length];
}

function metaLine(c) {
  if (c.type === 'album') {
    const parts = [c.artist || '—'];
    if (c.year) parts.push(c.year);
    parts.push(`${c.track_count} track${c.track_count !== 1 ? 's' : ''}`);
    return parts.join(' · ');
  }
  const parts = [`${c.track_count} track${c.track_count !== 1 ? 's' : ''}`];
  if (c.description) parts.push(c.description);
  return parts.join(' · ');
}

// Flat Winamp-playlist-style row — same aesthetic as the Songs page
function buildRow(c, index) {
  const row = document.createElement('div');
  row.className = 'coll-row';
  row.dataset.id = c.id;
  row.innerHTML = `
    <span class="coll-row-num">${index + 1}.</span>
    <div class="coll-row-info">
      <span class="coll-row-name">${escHtml(c.name)}</span>
      <span class="coll-row-sep"> · </span>
      <span class="coll-row-meta">${escHtml(metaLine(c))}</span>
    </div>
    <button class="coll-row-play" data-play-btn title="Play all">▶</button>
  `;
  row.addEventListener('click', (e) => {
    if (e.target.closest('[data-play-btn]')) return;
    store.set('pageData', { collectionId: c.id, type: c.type });
    store.set('page', 'collection');
  });
  row.querySelector('[data-play-btn]').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const full = await api.getCollection(c.id);
      playCollection(full.tracks);
    } catch {}
  });
  return row;
}

export function renderCollectionsPage(container, type) {
  const label = type === 'album' ? 'Albums' : 'Playlists';
  const newLabel = type === 'album' ? 'New album' : 'New playlist';

  container.innerHTML = `
    <style>
      /* Winamp playlist-style — dark navy, flat rows, no cards */
      #coll-wrap {
        height: 100%; display: flex; flex-direction: column;
        background: var(--playlist-bg);
      }

      /* Title / action bar (gradient titlebar like other Winamp windows) */
      .coll-titlebar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 4px 8px; flex-shrink: 0;
        background: linear-gradient(90deg, var(--playlist-active) 0%, var(--lcd) 100%);
      }
      .coll-titlebar h2 {
        font-family: var(--pixel); font-size: 13px; letter-spacing: 2px;
        color: #fff; text-transform: uppercase;
      }

      /* Slide-in create form */
      #coll-create-form {
        padding: 6px 8px; flex-shrink: 0; display: none;
        background: var(--chrome);
        box-shadow: inset 0 -1px 0 var(--chrome-lo);
      }
      #coll-create-form.open { display: block; }
      #coll-create-form .form-row { display: flex; gap: 6px; }
      #coll-create-form .form-group { flex: 1; margin-bottom: 6px; }
      #coll-create-form label { font-family: var(--pixel); font-size: 11px; color: var(--text3); letter-spacing: 1px; display: block; margin-bottom: 2px; text-transform: uppercase; }

      /* List container */
      #coll-grid { flex: 1; overflow-y: auto; }

      /* Flat Winamp-style rows */
      .coll-row {
        display: flex; align-items: center; gap: 8px;
        padding: 4px 8px; cursor: pointer;
        color: var(--playlist-text);
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .coll-row:hover { background: var(--playlist-hover); }
      .coll-row-num {
        font-family: var(--mono); font-size: 11px;
        color: var(--playlist-dim); width: 22px; text-align: right; flex-shrink: 0;
      }
      .coll-row-info { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 0; overflow: hidden; }
      .coll-row-name {
        font-family: var(--mono); font-size: 13px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; max-width: 60%;
      }
      .coll-row-sep { color: var(--playlist-dim); font-family: var(--mono); font-size: 11px; flex-shrink: 0; }
      .coll-row-meta {
        font-family: var(--mono); font-size: 11px; color: var(--playlist-dim);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .coll-row-play {
        font-family: var(--pixel); font-size: 12px; padding: 2px 6px;
        flex-shrink: 0; cursor: pointer; opacity: 0;
        background: var(--chrome); color: var(--text);
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
      }
      .coll-row:hover .coll-row-play { opacity: 1; }
      .coll-row-play:active { box-shadow: inset 1px 1px 0 var(--chrome-lo), inset -1px -1px 0 var(--chrome-hi), 0 0 0 1px var(--chrome-edge); }

      /* Bottom load-more strip */
      #coll-load-more { padding: 4px 8px; flex-shrink: 0; background: var(--playlist-bg); }

      /* Empty state */
      .empty-state {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 40px; color: var(--playlist-dim);
        font-family: var(--pixel); font-size: 14px; letter-spacing: 2px; text-align: center;
      }
    </style>
    <div id="coll-wrap">
      <div class="coll-titlebar">
        <h2>${label}</h2>
        <button class="btn btn-primary btn-sm" id="coll-new-btn">+ ${newLabel}</button>
      </div>

      <div id="coll-create-form">
        ${type === 'album' ? `
          <div class="form-row">
            <div class="form-group"><label>Title</label><input type="text" id="cf-name" placeholder="Album title" /></div>
            <div class="form-group"><label>Artist</label><input type="text" id="cf-artist" placeholder="Artist name" /></div>
            <div class="form-group" style="max-width:80px"><label>Year</label><input type="number" id="cf-year" placeholder="2024" min="1000" max="9999" /></div>
          </div>` : `
          <div class="form-row">
            <div class="form-group"><label>Name</label><input type="text" id="cf-name" placeholder="Playlist name" /></div>
            <div class="form-group"><label>Description</label><input type="text" id="cf-desc" placeholder="Optional" /></div>
          </div>`}
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn btn-primary btn-sm" id="cf-submit">Create</button>
          <button class="btn btn-ghost btn-sm" id="cf-cancel">Cancel</button>
          <span id="cf-err" style="font-size:12px;color:var(--red)"></span>
        </div>
      </div>

      <div id="coll-grid"></div>
      <div id="coll-load-more" style="display:none">
        <button class="btn btn-sm" id="coll-more-btn">Load more…</button>
      </div>
    </div>
  `;

  const wrap = container.querySelector('#coll-wrap');
  const grid = container.querySelector('#coll-grid');
  const createForm = container.querySelector('#coll-create-form');
  let page = 1, exhausted = false;

  container.querySelector('#coll-new-btn').addEventListener('click', () => {
    createForm.classList.toggle('open');
    if (createForm.classList.contains('open')) createForm.querySelector('#cf-name').focus();
  });

  container.querySelector('#cf-cancel').addEventListener('click', () => {
    createForm.classList.remove('open');
    clearCreateForm(container);
  });

  container.querySelector('#cf-submit').addEventListener('click', () => doCreate(container, type));
  container.querySelector('#cf-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doCreate(container, type);
  });

  container.querySelector('#coll-more-btn')?.addEventListener('click', () => {
    page++;
    loadCollections(container, grid, type, page, true);
  });

  grid.addEventListener('scroll', () => {
    if (!exhausted && grid.scrollTop + grid.clientHeight > grid.scrollHeight - 200) {
      page++;
      loadCollections(container, grid, type, page, true);
    }
  });

  loadCollections(container, grid, type, 1, false);

  function getExhausted() { return exhausted; }
  function setExhausted(v) { exhausted = v; }
  loadCollections._getExhausted = getExhausted;
  loadCollections._setExhausted = setExhausted;
}

async function loadCollections(container, grid, type, page, append) {
  try {
    const data = await api.getCollections({ type, page, limit: 24 });
    const items = data.collections || [];

    if (!append) grid.innerHTML = '';

    if (items.length === 0 && !append) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${type === 'album' ? '◈' : '♪'}</div>
          <p>No ${type}s yet. Create your first one above.</p>
        </div>`;
    } else {
      const startIdx = append ? grid.querySelectorAll('.coll-row').length : 0;
      items.forEach((c, i) => grid.appendChild(buildRow(c, startIdx + i)));
      const moreBtn = container.querySelector('#coll-load-more');
      if (items.length < 24) {
        if (moreBtn) moreBtn.style.display = 'none';
      } else {
        if (moreBtn) moreBtn.style.display = 'block';
      }
    }
  } catch (err) {
    if (!append) grid.innerHTML = `<div class="empty-state"><p class="text-red">Failed to load: ${escHtml(err.message)}</p></div>`;
  }
}

async function doCreate(container, type) {
  const nameEl = container.querySelector('#cf-name');
  const errEl = container.querySelector('#cf-err');
  const name = nameEl.value.trim();
  if (!name) { errEl.textContent = 'Name is required'; return; }

  const body = { type, name };
  if (type === 'album') {
    const artist = container.querySelector('#cf-artist')?.value.trim();
    const year = container.querySelector('#cf-year')?.value;
    if (artist) body.artist = artist;
    if (year) body.year = parseInt(year);
  } else {
    const desc = container.querySelector('#cf-desc')?.value.trim();
    if (desc) body.description = desc;
  }

  const submitBtn = container.querySelector('#cf-submit');
  submitBtn.disabled = true;
  errEl.textContent = '';
  try {
    const coll = await api.createCollection(body);
    saveOwnerToken(coll.id, coll.owner_token);
    clearCreateForm(container);
    container.querySelector('#coll-create-form').classList.remove('open');
    store.set('pageData', { collectionId: coll.id, type: coll.type });
    store.set('page', 'collection');
  } catch (err) {
    errEl.textContent = err.message;
    submitBtn.disabled = false;
  }
}

function clearCreateForm(container) {
  ['#cf-name','#cf-artist','#cf-year','#cf-desc'].forEach(sel => {
    const el = container.querySelector(sel);
    if (el) el.value = '';
  });
  const errEl = container.querySelector('#cf-err');
  if (errEl) errEl.textContent = '';
  const submitBtn = container.querySelector('#cf-submit');
  if (submitBtn) submitBtn.disabled = false;
}

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
