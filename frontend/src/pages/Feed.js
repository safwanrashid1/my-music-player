import { store } from '../stores/app.js';
import { api } from '../api/client.js';
import { playTrack } from '../components/Player.js';
import { openAddToCollectionModal } from '../components/AddToCollectionModal.js';

let page = 1;
let loading = false;
let exhausted = false;
let rowCounter = 0;

export function renderFeed(container) {
  container.innerHTML = `
    <style>
      /* ── Winamp Playlist ── deep navy, monospace rows ── */
      #feed-wrap {
        padding: 0; overflow-y: auto; height: 100%;
        background: var(--playlist-bg);
        display: flex; flex-direction: column;
      }
      .feed-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 4px 8px;
        background: linear-gradient(90deg, var(--playlist-active) 0%, var(--lcd) 100%);
        flex-shrink: 0;
      }
      #feed-title {
        font-family: var(--pixel); font-size: 13px; letter-spacing: 2px;
        color: #FFFFFF; text-transform: uppercase;
      }
      .feed-filters { display: flex; gap: 2px; flex-wrap: wrap; }
      .filter-pill {
        font-family: var(--pixel); font-size: 12px; padding: 2px 8px;
        letter-spacing: 1px; cursor: pointer;
        color: var(--playlist-dim);
        background: var(--lcd);
        box-shadow: inset 1px 1px 0 #002840, inset -1px -1px 0 #000810, 0 0 0 1px var(--chrome-edge);
      }
      .filter-pill.active, .filter-pill:hover {
        color: var(--lcd-text);
        background: var(--playlist-hover);
      }
      #track-grid {
        flex: 1; display: flex; flex-direction: column;
        padding: 4px 0;
        overflow-y: auto;
      }
      /* ── Playlist row ── each track is a Winamp playlist entry ── */
      .track-card {
        display: flex; align-items: center; gap: 0;
        cursor: pointer; padding: 3px 8px;
        border: none; background: transparent;
        color: var(--playlist-text);
      }
      .track-card:hover { background: var(--playlist-hover); }
      .track-card.playing { background: var(--playlist-active); color: #FFFFFF; }
      .track-card.playing .track-num { color: var(--lcd-green); }

      .track-num {
        font-family: var(--mono); font-size: 11px;
        color: var(--playlist-dim); width: 24px; flex-shrink: 0;
        text-align: right; margin-right: 8px;
      }

      /* Hide artwork in playlist mode */
      .track-art { display: none; }
      .waveform-mini-canvas { display: none; }

      .track-body { flex: 1; min-width: 0; padding: 0; }
      .track-title {
        font-family: var(--mono); font-size: 13px;
        font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        color: inherit;
      }
      .track-meta {
        font-family: var(--mono); font-size: 11px;
        color: var(--playlist-dim); margin-top: 1px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .track-footer {
        display: flex; align-items: center; gap: 8px;
        flex-shrink: 0; margin-left: 8px;
      }
      .track-badges { display: flex; gap: 2px; }
      .track-stats {
        display: flex; gap: 6px;
        font-family: var(--mono); font-size: 11px;
        color: var(--playlist-dur);
      }
      .track-stat { display: flex; align-items: center; gap: 2px; }
      .like-btn { cursor: pointer; }
      .like-btn:hover, .like-btn.liked { color: var(--led-red); }
      .add-btn { cursor: pointer; }
      .add-btn:hover { color: var(--lcd-text); }

      .load-more { padding: 4px 8px; text-align: center; flex-shrink: 0; background: var(--playlist-bg); }
      .empty-state {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 40px; color: var(--playlist-dim);
      }
      .empty-icon {
        font-size: 40px; margin-bottom: 12px; opacity: 0.4;
        font-family: var(--pixel); letter-spacing: 4px;
      }

      /* ── Playlist Editor bottom action bar ── */
      #playlist-statusbar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 3px 6px; flex-shrink: 0;
        background: var(--chrome);
        box-shadow:
          inset 0 1px 0 var(--chrome-hi),
          0 0 0 1px var(--chrome-edge);
        border-top: 1px solid var(--chrome-lo);
      }
      .pl-actions { display: flex; gap: 2px; }
      .pl-action-btn {
        font-family: var(--pixel); font-size: 11px; letter-spacing: 0.5px;
        padding: 2px 8px; cursor: pointer;
        background: var(--chrome); color: var(--text);
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
      }
      .pl-action-btn:hover { background: var(--chrome-hi); }
      .pl-action-btn:active { box-shadow: inset 1px 1px 0 var(--chrome-lo), inset -1px -1px 0 var(--chrome-hi), 0 0 0 1px var(--chrome-edge); }
      .pl-time {
        font-family: var(--pixel); font-size: 12px; letter-spacing: 1px;
        color: var(--lcd-text);
        background: var(--lcd);
        padding: 1px 8px;
        box-shadow: inset 1px 1px 0 #000, inset -1px -1px 0 #203040;
      }
    </style>
    <div id="feed-wrap">
      <!-- ALL SONGS title bar -->
      <div class="feed-header">
        <h2 id="feed-title">ALL SONGS</h2>
        <div class="feed-filters">
          <div class="filter-pill active" data-genre="">ALL</div>
          <div class="filter-pill" data-genre="electronic">ELECTRONIC</div>
          <div class="filter-pill" data-genre="jazz">JAZZ</div>
          <div class="filter-pill" data-genre="classical">CLASSICAL</div>
          <div class="filter-pill" data-genre="ambient">AMBIENT</div>
          <div class="filter-pill" data-genre="rock">ROCK</div>
        </div>
      </div>
      <div id="track-grid"></div>
      <div class="load-more" id="load-more" style="display:none">
        <button class="pl-action-btn" id="load-more-btn">LOAD MORE…</button>
      </div>
      <!-- Winamp-style bottom bar: ADD · REM · SEL · MISC + time readout -->
      <div id="playlist-statusbar">
        <div class="pl-actions">
          <button class="pl-action-btn" id="pl-add" title="Upload a track">+ ADD</button>
          <button class="pl-action-btn" id="pl-sel-all" title="Select all">SEL</button>
          <button class="pl-action-btn" id="pl-albums" title="View Albums">ALBUMS</button>
          <button class="pl-action-btn" id="pl-playlists" title="View Playlists">PLAYLISTS</button>
          <button class="pl-action-btn" id="pl-manage" title="Manage Playlist">MANAGE PLAYLIST</button>
        </div>
        <div class="pl-time" id="pl-total-time">0:00:00</div>
      </div>
    </div>
  `;

  const grid = container.querySelector('#track-grid');
  const wrap = container.querySelector('#feed-wrap');

  // Genre filters
  container.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      store.set('feedGenre', pill.dataset.genre);
      page = 1; exhausted = false;
      grid.innerHTML = '';
      loadTracks(grid, container);
    });
  });

  // Search subscription
  store.subscribe('feedQuery', (q) => {
    const title = container.querySelector('#feed-title');
    if (title) title.textContent = q ? `SEARCH: "${q.toUpperCase()}"` : 'ALL SONGS';
    page = 1; exhausted = false;
    grid.innerHTML = '';
    loadTracks(grid, container);
  });

  // Bottom bar buttons
  container.querySelector('#pl-add')?.addEventListener('click', () => store.set('page', 'upload'));
  container.querySelector('#pl-albums')?.addEventListener('click', () => store.set('page', 'albums'));
  container.querySelector('#pl-playlists')?.addEventListener('click', () => store.set('page', 'playlists'));
  container.querySelector('#pl-manage')?.addEventListener('click', () => store.set('page', 'playlists'));

  // Load more
  container.querySelector('#load-more-btn')?.addEventListener('click', () => {
    page++;
    loadTracks(grid, container, true);
  });

  // Infinite scroll
  wrap.addEventListener('scroll', () => {
    if (exhausted || loading) return;
    if (wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 200) {
      page++;
      loadTracks(grid, container, true);
    }
  });

  // Current track highlight
  store.subscribe('currentTrack', () => {
    updatePlayingCard(grid);
  });

  loadTracks(grid, container);
}

async function loadTracks(grid, container, append = false) {
  if (loading || exhausted) return;
  loading = true;

  if (!append) {
    grid.innerHTML = `<div style="padding:20px 8px;font-family:var(--pixel);font-size:14px;color:var(--playlist-dim);letter-spacing:2px">LOADING...</div>`;
  }

  try {
    const params = { page, limit: 20 };
    const q = store.get('feedQuery');
    const genre = store.get('feedGenre');
    if (q) params.q = q;
    if (genre) params.genre = genre;

    const data = await api.getFeed(params);
    const tracks = data.tracks || [];

    if (!append) { grid.innerHTML = ''; rowCounter = 0; }

    if (tracks.length === 0 && !append) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">♪ ♪ ♪</div>
          <p style="font-family:var(--pixel);letter-spacing:2px;font-size:16px">NO TRACKS FOUND</p>
          <p style="font-family:var(--mono);font-size:12px;margin-top:8px">Upload your first track to get started.</p>
        </div>
      `;
      exhausted = true;
    } else {
      tracks.forEach(track => {
        const card = buildTrackCard(track);
        grid.appendChild(card);
        drawMiniWaveform(card, track.waveform_data);
      });

      if (tracks.length < 20) {
        exhausted = true;
        container.querySelector('#load-more').style.display = 'none';
      } else {
        container.querySelector('#load-more').style.display = 'block';
      }
    }
    updatePlayingCard(grid);
    updateTotalTime(container, grid);
  } catch (err) {
    if (!append) {
      grid.innerHTML = `<div class="empty-state"><p class="text-red" style="font-family:var(--pixel)">ERROR: ${err.message}</p></div>`;
    }
  } finally {
    loading = false;
  }
}

function buildTrackCard(track) {
  const num = ++rowCounter;
  const card = document.createElement('div');
  card.className = 'track-card';
  card.dataset.trackId = track.id;

  const dur = track.duration_seconds ? fmtTime(track.duration_seconds) : '';
  const fmtBadge = track.original_format ? ` [${track.original_format}]` : '';
  const metaParts = [track.artist, track.album].filter(Boolean).join(' - ');

  card.innerHTML = `
    <span class="track-num">${num}.</span>
    <div class="track-body">
      <div class="track-title">${escHtml((track.title || 'Untitled') + fmtBadge)}</div>
      ${metaParts ? `<div class="track-meta">${escHtml(metaParts)}</div>` : ''}
    </div>
    <div class="track-footer">
      <div class="track-stats">
        <span class="track-stat like-btn" data-like-btn title="Like">♥${fmtNum(track.like_count)}</span>
        <span class="track-stat add-btn" data-add-btn title="Add to album or playlist">+</span>
        ${dur ? `<span class="track-stat" style="color:var(--playlist-dur)">${dur}</span>` : ''}
      </div>
    </div>
  `;

  // Play
  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-like-btn],[data-add-btn]')) return;
    playTrack(track);
  });

  // Like
  const likeBtn = card.querySelector('[data-like-btn]');
  likeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await api.likeTrack(track.id);
      track.like_count = (track.like_count || 0) + 1;
      likeBtn.className = 'track-stat like-btn liked';
      likeBtn.innerHTML = `♥ ${fmtNum(track.like_count)}`;
    } catch {}
  });

  // Add to playlist/album
  card.querySelector('[data-add-btn]').addEventListener('click', (e) => {
    e.stopPropagation();
    openAddToCollectionModal(track.id);
  });

  return card;
}

function drawMiniWaveform() { /* no-op — playlist view hides mini waveforms */ }

function updateTotalTime(container, grid) {
  const el = container.querySelector('#pl-total-time');
  if (!el) return;
  let total = 0;
  grid.querySelectorAll('.track-card').forEach(card => {
    const dur = card.querySelector('.track-stat:last-child');
    if (dur) {
      const [m, s] = (dur.textContent || '0:00').split(':').map(Number);
      total += (m || 0) * 60 + (s || 0);
    }
  });
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  el.textContent = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updatePlayingCard(grid) {
  const current = store.get('currentTrack');
  grid.querySelectorAll('.track-card').forEach(card => {
    card.classList.toggle('playing', current && card.dataset.trackId === current.id);
  });
}

function fmtNum(n) {
  if (!n) return '';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
function fmtTime(s) {
  if (!s || isNaN(s)) return '';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
