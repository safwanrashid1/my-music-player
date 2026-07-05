import { store } from '../stores/app.js';
import { playTrack } from './Player.js';

export function renderQueue(container) {
  container.innerHTML = `
    <style>
      #queue-panel {
        grid-area: queue;
        display: flex; flex-direction: column;
        background: var(--playlist-bg);
        overflow: hidden;
        box-shadow: inset -2px 0 0 #000810, inset 1px 0 0 #002840;
      }

      /* Title bar — matches the Winamp playlist editor window chrome */
      .queue-titlebar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 3px 8px; flex-shrink: 0;
        background: linear-gradient(90deg, var(--playlist-active) 0%, var(--lcd) 100%);
        font-family: var(--pixel); font-size: 12px; letter-spacing: 3px;
        color: #FFFFFF; text-transform: uppercase;
      }
      .queue-count {
        font-size: 10px; letter-spacing: 1px; color: rgba(255,255,255,0.45);
      }

      /* Now Playing strip */
      .queue-nowplaying {
        padding: 5px 8px; flex-shrink: 0;
        background: rgba(0,60,100,0.4);
        border-bottom: 1px solid rgba(0,200,200,0.12);
      }
      .queue-np-label {
        font-family: var(--pixel); font-size: 9px; letter-spacing: 2px;
        color: #00DCDC; text-transform: uppercase; margin-bottom: 2px;
      }
      .queue-np-title {
        font-family: var(--mono); font-size: 13px;
        color: #D0E8EC; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
        letter-spacing: 0.3px;
      }
      .queue-np-artist {
        font-family: var(--mono); font-size: 11px;
        color: var(--playlist-dim); white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
      }

      /* Queue list */
      .queue-list { flex: 1; overflow-y: auto; }

      .queue-row {
        display: flex; align-items: center; gap: 6px;
        padding: 3px 7px; cursor: pointer;
        color: var(--playlist-text);
        border-bottom: 1px solid rgba(255,255,255,0.03);
      }
      .queue-row:hover { background: var(--playlist-hover); }
      .queue-row.current {
        background: var(--playlist-active);
        color: #FFFFFF;
      }
      .queue-row.current .q-num { color: #00DCDC; }

      .q-num {
        font-family: var(--mono); font-size: 11px;
        color: var(--playlist-dim); width: 18px;
        text-align: right; flex-shrink: 0;
      }
      .q-title {
        flex: 1; min-width: 0;
        font-family: var(--mono); font-size: 12px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .q-dur {
        font-family: var(--mono); font-size: 11px;
        color: var(--playlist-dim); flex-shrink: 0;
      }

      /* Empty state */
      .queue-empty {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 24px; color: var(--playlist-dim);
        font-family: var(--pixel); font-size: 12px;
        letter-spacing: 1.5px; text-align: center; line-height: 1.8;
      }
      .queue-empty-icon { font-size: 28px; margin-bottom: 10px; opacity: 0.25; }
    </style>

    <div id="queue-panel">
      <div class="queue-titlebar">
        <span>Queue</span>
        <span class="queue-count" id="queue-count">0 tracks</span>
      </div>
      <div class="queue-nowplaying" id="queue-np" style="display:none">
        <div class="queue-np-label">Now Playing</div>
        <div class="queue-np-title"  id="queue-np-title">—</div>
        <div class="queue-np-artist" id="queue-np-artist">—</div>
      </div>
      <div class="queue-list" id="queue-list"></div>
    </div>
  `;

  function render() {
    const queue   = store.get('queue') || [];
    const qIdx    = store.get('queueIndex') ?? -1;
    const current = store.get('currentTrack');

    // Track count
    const countEl = container.querySelector('#queue-count');
    if (countEl) countEl.textContent = `${queue.length} track${queue.length !== 1 ? 's' : ''}`;

    // Now playing strip
    const npEl     = container.querySelector('#queue-np');
    const npTitle  = container.querySelector('#queue-np-title');
    const npArtist = container.querySelector('#queue-np-artist');
    if (current && npEl) {
      npEl.style.display = 'block';
      if (npTitle)  npTitle.textContent  = current.title  || 'Untitled';
      if (npArtist) npArtist.textContent = current.artist || '—';
    } else if (npEl) {
      npEl.style.display = 'none';
    }

    // Queue list
    const listEl = container.querySelector('#queue-list');
    if (!listEl) return;

    if (queue.length === 0) {
      listEl.innerHTML = `
        <div class="queue-empty">
          <div class="queue-empty-icon">♪</div>
          QUEUE EMPTY<br>
          <span style="font-size:10px;letter-spacing:1px">Play a track to begin</span>
        </div>`;
      return;
    }

    listEl.innerHTML = queue.map((t, i) => {
      const dur = t.duration_seconds ? fmtTime(t.duration_seconds) : '';
      return `
        <div class="queue-row ${i === qIdx ? 'current' : ''}" data-idx="${i}">
          <span class="q-num">${i + 1}</span>
          <span class="q-title">${escHtml(t.title || 'Untitled')}</span>
          ${dur ? `<span class="q-dur">${dur}</span>` : ''}
        </div>`;
    }).join('');

    listEl.querySelectorAll('.queue-row').forEach(row => {
      row.addEventListener('click', () => {
        const t = queue[parseInt(row.dataset.idx)];
        if (t) playTrack(t);
      });
    });
  }

  store.subscribe('queue',        render);
  store.subscribe('queueIndex',   render);
  store.subscribe('currentTrack', render);
  render();
}

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
