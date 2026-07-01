import { store } from '../stores/app.js';
import { api } from '../api/client.js';
import { isOwner, forgetOwnerToken } from '../ownership.js';
import { playTrack, playCollection } from '../components/Player.js';

const ACCENT_COLORS = ['#5CE8D4','#F5A623','#E05252','#7C3AED','#2563EB','#059669','#D97706'];

function colorFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xFFFFFFFF;
  return ACCENT_COLORS[Math.abs(h) % ACCENT_COLORS.length];
}

function formatTime(s) {
  if (!s || isNaN(s)) return '';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export async function renderCollectionDetail(container, { collectionId }) {
  // refresh() re-fetches + re-renders this same page — used after any mutation.
  const refresh = () => renderCollectionDetail(container, { collectionId });

  container.innerHTML = `
    <style>
      #cd-wrap { padding: 24px; overflow-y: auto; height: 100%; }
      .cd-header {
        display: flex; align-items: flex-start; gap: 20px; margin-bottom: 24px;
        padding: 20px; background: var(--bg2); border: 0.5px solid var(--border);
        border-radius: var(--r2);
      }
      .cd-art {
        width: 96px; height: 96px; border-radius: var(--r); flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 44px; font-weight: 700; font-family: var(--mono);
      }
      .cd-meta { flex: 1; min-width: 0; }
      .cd-name { font-size: 22px; font-weight: 600; }
      .cd-sub { font-size: 13px; color: var(--text2); margin-top: 4px; }
      .cd-desc { font-size: 12px; color: var(--text3); margin-top: 4px; }
      .cd-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
      .cd-edit-form {
        margin-bottom: 16px; padding: 16px;
        background: var(--bg2); border: 0.5px solid var(--border); border-radius: var(--r2);
      }
      .cd-edit-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
      .cd-edit-row input { flex: 1; min-width: 100px; }
      .cd-track-row {
        display: flex; align-items: center; gap: 12px; padding: 10px 12px;
        background: var(--bg2); border: 0.5px solid var(--border);
        border-radius: var(--r); margin-bottom: 6px; cursor: pointer;
        transition: border-color 0.12s;
      }
      .cd-track-row:hover { border-color: var(--border2); }
      .cd-track-row.playing { border-color: var(--accent); }
      .cd-track-num { font-family: var(--mono); font-size: 11px; color: var(--text3); width: 22px; text-align: right; flex-shrink: 0; }
      .cd-track-info { flex: 1; min-width: 0; }
      .cd-track-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cd-track-meta { font-size: 11px; color: var(--text2); margin-top: 1px; }
      .cd-track-dur { font-family: var(--mono); font-size: 11px; color: var(--text3); flex-shrink: 0; }
      .cd-track-btns { display: flex; gap: 4px; flex-shrink: 0; }
      .icon-btn { font-size: 12px; padding: 3px 7px; border-radius: 4px; border: 0.5px solid var(--border2); color: var(--text2); cursor: pointer; transition: all 0.12s; }
      .icon-btn:hover { border-color: var(--text); color: var(--text); }
      .icon-btn.del:hover { border-color: var(--red); color: var(--red); }
      .icon-btn:disabled { opacity: 0.3; cursor: default; pointer-events: none; }
      .cd-empty { text-align: center; padding: 40px; color: var(--text2); }
    </style>
    <div id="cd-wrap"><div style="padding:40px;text-align:center"><span class="spinner"></span></div></div>
  `;

  let coll;
  try {
    coll = await api.getCollection(collectionId);
  } catch (err) {
    container.querySelector('#cd-wrap').innerHTML =
      `<p class="text-red" style="padding:20px">Failed to load: ${escHtml(err.message)}</p>`;
    return;
  }

  const owner = isOwner(coll.id);
  const color = colorFor(coll.id);
  const totalSec = coll.tracks.reduce((s, t) => s + (t.duration_seconds || 0), 0);
  const durStr = totalSec > 3600
    ? `${Math.floor(totalSec / 3600)}h ${Math.floor((totalSec % 3600) / 60)}m`
    : totalSec > 0 ? `${Math.floor(totalSec / 60)}m ${Math.floor(totalSec % 60)}s` : '';

  const subParts = [];
  if (coll.type === 'album') {
    if (coll.artist) subParts.push(coll.artist);
    if (coll.year)   subParts.push(coll.year);
  }
  subParts.push(`${coll.tracks.length} track${coll.tracks.length !== 1 ? 's' : ''}`);
  if (durStr) subParts.push(durStr);

  const wrap = container.querySelector('#cd-wrap');
  wrap.innerHTML = `
    <div class="cd-header">
      <div class="cd-art" style="background:${color}22;color:${color}">${escHtml(coll.name.charAt(0).toUpperCase())}</div>
      <div class="cd-meta">
        <div class="cd-name">${escHtml(coll.name)}</div>
        <div class="cd-sub">${escHtml(subParts.join(' · '))}</div>
        ${coll.description ? `<div class="cd-desc">${escHtml(coll.description)}</div>` : ''}
        <div class="cd-actions">
          <button class="btn btn-primary btn-sm" id="cd-play-all">▶ Play all</button>
          ${owner ? `<button class="btn btn-ghost btn-sm" id="cd-edit-btn">Edit</button>` : ''}
          ${owner ? `<button class="btn btn-ghost btn-sm" id="cd-delete-btn" style="color:var(--red);border-color:rgba(224,82,82,0.4)">Delete</button>` : ''}
          <button class="btn btn-ghost btn-sm" id="cd-back-btn">← Back</button>
        </div>
      </div>
    </div>

    ${owner ? `
    <div id="cd-edit-form" class="cd-edit-form" style="display:none">
      ${coll.type === 'album' ? `
        <div class="cd-edit-row">
          <input id="edit-name" value="${escHtml(coll.name)}" placeholder="Title" />
          <input id="edit-artist" value="${escHtml(coll.artist || '')}" placeholder="Artist" />
          <input id="edit-year" type="number" value="${coll.year || ''}" placeholder="Year" style="width:80px;flex:none" />
        </div>` : `
        <div class="cd-edit-row">
          <input id="edit-name" value="${escHtml(coll.name)}" placeholder="Name" />
          <input id="edit-desc" value="${escHtml(coll.description || '')}" placeholder="Description" />
        </div>`}
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary btn-sm" id="edit-save">Save</button>
        <button class="btn btn-ghost btn-sm" id="edit-cancel">Cancel</button>
        <span id="edit-err" style="font-size:12px;color:var(--red)"></span>
      </div>
    </div>` : ''}

    <div id="cd-track-list"></div>
  `;

  // ─── Buttons ───────────────────────────────────────────────────────────────
  wrap.querySelector('#cd-play-all').addEventListener('click', () => {
    if (coll.tracks.length) playCollection(coll.tracks);
  });
  wrap.querySelector('#cd-back-btn').addEventListener('click', () => {
    store.set('page', coll.type === 'album' ? 'albums' : 'playlists');
  });

  if (owner) {
    const editForm = wrap.querySelector('#cd-edit-form');
    wrap.querySelector('#cd-edit-btn').addEventListener('click', () => {
      editForm.style.display = editForm.style.display === 'none' ? 'block' : 'none';
    });
    wrap.querySelector('#edit-cancel').addEventListener('click', () => { editForm.style.display = 'none'; });
    wrap.querySelector('#edit-save').addEventListener('click', async () => {
      const errEl = wrap.querySelector('#edit-err');
      const body = { name: wrap.querySelector('#edit-name').value.trim() };
      if (!body.name) { errEl.textContent = 'Name required'; return; }
      if (coll.type === 'album') {
        body.artist = wrap.querySelector('#edit-artist').value.trim() || null;
        const yr = wrap.querySelector('#edit-year').value;
        body.year = yr ? parseInt(yr) : null;
      } else {
        body.description = wrap.querySelector('#edit-desc').value.trim() || null;
      }
      try { await api.updateCollection(coll.id, body); await refresh(); }
      catch (err) { errEl.textContent = err.message; }
    });
    wrap.querySelector('#cd-delete-btn').addEventListener('click', async () => {
      if (!confirm(`Delete "${coll.name}"? This removes the collection but keeps all tracks.`)) return;
      try {
        await api.deleteCollection(coll.id);
        forgetOwnerToken(coll.id);
        store.set('page', coll.type === 'album' ? 'albums' : 'playlists');
      } catch (err) { alert(`Delete failed: ${err.message}`); }
    });
  }

  // ─── Track list ────────────────────────────────────────────────────────────
  const listEl = wrap.querySelector('#cd-track-list');
  if (coll.tracks.length === 0) {
    listEl.innerHTML = `<div class="cd-empty"><p>No tracks yet.</p><p style="font-size:12px;margin-top:6px;color:var(--text3)">Add tracks from the feed using the + button on any track card.</p></div>`;
  } else {
    coll.tracks.forEach((track, idx) => {
      const dur = formatTime(track.duration_seconds);
      const row = document.createElement('div');
      row.className = 'cd-track-row';
      row.dataset.trackId = track.id;
      row.innerHTML = `
        <span class="cd-track-num">${idx + 1}</span>
        <div class="cd-track-info">
          <div class="cd-track-title">${escHtml(track.title || 'Untitled')}</div>
          ${track.artist ? `<div class="cd-track-meta">${escHtml(track.artist)}</div>` : ''}
        </div>
        ${dur ? `<span class="cd-track-dur">${dur}</span>` : ''}
        ${owner ? `
        <div class="cd-track-btns">
          <button class="icon-btn" data-up title="Move up" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-down title="Move down" ${idx === coll.tracks.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn del" data-remove title="Remove">✕</button>
        </div>` : ''}
      `;
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-up],[data-down],[data-remove]')) return;
        playCollection(coll.tracks, idx);
      });
      if (owner) {
        row.querySelector('[data-up]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ids = coll.tracks.map(t => t.id);
          [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
          try { await api.reorderCollectionTracks(coll.id, ids); await refresh(); } catch {}
        });
        row.querySelector('[data-down]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ids = coll.tracks.map(t => t.id);
          [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
          try { await api.reorderCollectionTracks(coll.id, ids); await refresh(); } catch {}
        });
        row.querySelector('[data-remove]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Remove "${track.title}" from this ${coll.type}?`)) return;
          try { await api.removeTrackFromCollection(coll.id, track.id); await refresh(); } catch {}
        });
      }
      listEl.appendChild(row);
    });

    store.subscribe('currentTrack', (ct) => {
      listEl.querySelectorAll('.cd-track-row').forEach(r => {
        r.classList.toggle('playing', ct && r.dataset.trackId === ct.id);
      });
    });
  }
}
