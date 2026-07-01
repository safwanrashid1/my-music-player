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

function buildCard(c) {
  const color = colorFor(c.id);
  const card = document.createElement('div');
  card.className = 'coll-card';
  card.dataset.id = c.id;
  card.innerHTML = `
    <div class="coll-art" style="background:${color}22;border-color:${color}44">
      <div class="coll-art-initial" style="color:${color}">${escHtml(c.name.charAt(0).toUpperCase())}</div>
      <div class="coll-art-overlay">
        <div class="coll-play-btn" data-play-btn>▶</div>
      </div>
    </div>
    <div class="coll-body">
      <div class="coll-name truncate">${escHtml(c.name)}</div>
      <div class="coll-meta truncate">${escHtml(metaLine(c))}</div>
    </div>
  `;
  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-play-btn]')) return;
    store.set('pageData', { collectionId: c.id, type: c.type });
    store.set('page', 'collection');
  });
  card.querySelector('[data-play-btn]').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const full = await api.getCollection(c.id);
      playCollection(full.tracks);
    } catch { /* toast could go here */ }
  });
  return card;
}

export function renderCollectionsPage(container, type) {
  const label = type === 'album' ? 'Albums' : 'Playlists';
  const newLabel = type === 'album' ? 'New album' : 'New playlist';

  container.innerHTML = `
    <style>
      #coll-wrap { padding: 24px; overflow-y: auto; height: 100%; }
      .coll-page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
      #coll-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; }
      .coll-card {
        background: var(--bg2); border: 0.5px solid var(--border);
        border-radius: var(--r2); overflow: hidden; cursor: pointer;
        transition: border-color 0.15s, transform 0.12s;
      }
      .coll-card:hover { border-color: var(--border2); transform: translateY(-1px); }
      .coll-art {
        height: 120px; border-bottom: 0.5px solid var(--border);
        display: flex; align-items: center; justify-content: center;
        position: relative; overflow: hidden;
      }
      .coll-art-initial { font-size: 52px; font-weight: 700; font-family: var(--mono); opacity: 0.9; }
      .coll-art-overlay {
        position: absolute; inset: 0; background: rgba(8,11,18,0.5);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.15s;
      }
      .coll-card:hover .coll-art-overlay { opacity: 1; }
      .coll-play-btn {
        width: 40px; height: 40px; background: var(--accent); color: var(--bg);
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-size: 16px; font-weight: bold;
      }
      .coll-body { padding: 10px 12px; }
      .coll-name { font-size: 13px; font-weight: 500; }
      .coll-meta { font-size: 11px; color: var(--text2); margin-top: 3px; }

      /* Create form */
      #coll-create-form {
        background: var(--bg2); border: 0.5px solid var(--border2);
        border-radius: var(--r2); padding: 18px; margin-bottom: 20px; display: none;
      }
      #coll-create-form.open { display: block; }
      #coll-create-form .form-row { display: flex; gap: 10px; }
      #coll-create-form .form-group { flex: 1; }

      .empty-state { grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text2); }
      .empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.3; }
    </style>
    <div id="coll-wrap">
      <div class="coll-page-header">
        <h2>${label}</h2>
        <button class="btn btn-primary btn-sm" id="coll-new-btn">+ ${newLabel}</button>
      </div>

      <div id="coll-create-form">
        ${type === 'album' ? `
          <div class="form-row">
            <div class="form-group"><label>Title</label><input type="text" id="cf-name" placeholder="Album title" /></div>
            <div class="form-group"><label>Artist</label><input type="text" id="cf-artist" placeholder="Artist name" /></div>
            <div class="form-group" style="max-width:90px"><label>Year</label><input type="number" id="cf-year" placeholder="2024" min="1000" max="9999" /></div>
          </div>` : `
          <div class="form-row">
            <div class="form-group"><label>Name</label><input type="text" id="cf-name" placeholder="Playlist name" /></div>
            <div class="form-group"><label>Description</label><input type="text" id="cf-desc" placeholder="Optional description" /></div>
          </div>`}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-primary btn-sm" id="cf-submit">Create</button>
          <button class="btn btn-ghost btn-sm" id="cf-cancel">Cancel</button>
          <span id="cf-err" style="font-size:12px;color:var(--red);align-self:center"></span>
        </div>
      </div>

      <div id="coll-grid"></div>
      <div id="coll-load-more" style="text-align:center;padding:20px;display:none">
        <button class="btn btn-ghost btn-sm" id="coll-more-btn">Load more</button>
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

  wrap.addEventListener('scroll', () => {
    if (!exhausted && wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 200) {
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
      items.forEach(c => grid.appendChild(buildCard(c)));
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
