import { store } from '../stores/app.js';
import { api } from '../api/client.js';
import { saveOwnerToken } from '../ownership.js';

let currentTrackId = null;

export function openAddToCollectionModal(trackId) {
  currentTrackId = trackId;
  let modal = document.getElementById('add-coll-modal');
  if (!modal) modal = buildModal();
  modal.style.display = 'flex';
  loadTab(modal, 'playlist');
}

function buildModal() {
  const overlay = document.createElement('div');
  overlay.id = 'add-coll-modal';
  overlay.className = 'modal-overlay';
  overlay.style.display = 'none';

  overlay.innerHTML = `
    <div class="modal" style="width:480px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="font-size:16px">Add to…</h2>
        <button id="acm-close" style="font-size:18px;color:var(--text2)">✕</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button class="acm-tab btn btn-ghost btn-sm active" data-tab="playlist">Playlists</button>
        <button class="acm-tab btn btn-ghost btn-sm" data-tab="album">Albums</button>
      </div>
      <div id="acm-list" style="max-height:240px;overflow-y:auto;margin-bottom:12px"></div>
      <div id="acm-create-area">
        <button class="btn btn-ghost btn-sm w-full" id="acm-show-create">+ Create new</button>
        <div id="acm-create-form" style="display:none;margin-top:10px">
          <div style="display:flex;gap:8px">
            <input id="acm-new-name" placeholder="Name" style="flex:1" />
            <button class="btn btn-primary btn-sm" id="acm-create-submit">Create & add</button>
          </div>
          <span id="acm-create-err" style="font-size:12px;color:var(--red);display:block;margin-top:4px"></span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#acm-close').addEventListener('click', () => close(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(overlay); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.style.display === 'flex') close(overlay); });

  overlay.querySelectorAll('.acm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.acm-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTab(overlay, tab.dataset.tab);
    });
  });

  overlay.querySelector('#acm-show-create').addEventListener('click', () => {
    const form = overlay.querySelector('#acm-create-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'block') overlay.querySelector('#acm-new-name').focus();
  });

  overlay.querySelector('#acm-create-submit').addEventListener('click', () => doCreateAndAdd(overlay));
  overlay.querySelector('#acm-new-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doCreateAndAdd(overlay);
  });

  return overlay;
}

async function loadTab(overlay, type) {
  const list = overlay.querySelector('#acm-list');
  list.innerHTML = `<div style="text-align:center;padding:16px"><span class="spinner"></span></div>`;

  // Reset create area for the new tab
  overlay.querySelector('#acm-create-form').style.display = 'none';
  overlay.querySelector('#acm-new-name').value = '';
  overlay.querySelector('#acm-create-err').textContent = '';
  overlay.dataset.tab = type;

  try {
    const data = await api.getCollections({ type, limit: 50 });
    const items = data.collections || [];

    if (items.length === 0) {
      list.innerHTML = `<p style="font-size:13px;color:var(--text2);padding:12px 0">No ${type}s yet. Create one below.</p>`;
    } else {
      list.innerHTML = items.map(c => `
        <div class="acm-item" data-id="${c.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:var(--r);cursor:default;margin-bottom:4px;background:var(--bg3)">
          <div>
            <div style="font-size:13px;font-weight:500">${escHtml(c.name)}</div>
            <div style="font-size:11px;color:var(--text2)">${c.track_count} track${c.track_count !== 1 ? 's' : ''}${c.artist ? ` · ${escHtml(c.artist)}` : ''}</div>
          </div>
          <button class="btn btn-primary btn-sm" data-add="${c.id}">Add</button>
        </div>
      `).join('');

      list.querySelectorAll('[data-add]').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = '…';
          try {
            await api.addTrackToCollection(btn.dataset.add, currentTrackId);
            btn.textContent = '✓ Added';
            btn.className = 'btn btn-ghost btn-sm';
            setTimeout(() => close(overlay), 800);
          } catch (err) {
            btn.textContent = 'Add';
            btn.disabled = false;
            showToast(err.message, 'error');
          }
        });
      });
    }
  } catch (err) {
    list.innerHTML = `<p style="font-size:12px;color:var(--red);padding:12px 0">${escHtml(err.message)}</p>`;
  }
}

async function doCreateAndAdd(overlay) {
  const nameEl = overlay.querySelector('#acm-new-name');
  const errEl = overlay.querySelector('#acm-create-err');
  const submitBtn = overlay.querySelector('#acm-create-submit');
  const type = overlay.dataset.tab || 'playlist';
  const name = nameEl.value.trim();

  if (!name) { errEl.textContent = 'Name required'; return; }
  submitBtn.disabled = true;
  errEl.textContent = '';

  try {
    const coll = await api.createCollection({ type, name });
    saveOwnerToken(coll.id, coll.owner_token);
    await api.addTrackToCollection(coll.id, currentTrackId);
    close(overlay);
    showToast(`Added to new ${type} "${name}"`, 'success');
  } catch (err) {
    errEl.textContent = err.message;
    submitBtn.disabled = false;
  }
}

function close(overlay) {
  overlay.style.display = 'none';
  currentTrackId = null;
}

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => { t.className = ''; }, 3000);
}
