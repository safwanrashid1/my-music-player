import { store } from '../stores/app.js';
import { playTrack } from '../components/Player.js';
import { getRecentTracks, clearLog } from '../playlog.js';

function fmtTime(s) {
  if (!s) return '';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
function fmtTs(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)       return 'just now';
  if (diff < 3600000)     return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000)    return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function renderRecents(container) {
  container.innerHTML = `
    <style>
      #recents-wrap {
        height: 100%; display: flex; flex-direction: column;
        background: var(--playlist-bg);
      }
      .recents-titlebar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 4px 8px; flex-shrink: 0;
        background: linear-gradient(90deg, var(--playlist-active) 0%, var(--lcd) 100%);
      }
      .recents-titlebar h2 {
        font-family: var(--pixel); font-size: 13px; letter-spacing: 2px;
        color: #fff; text-transform: uppercase;
      }
      .recents-list { flex: 1; overflow-y: auto; }
      .recents-empty {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        height: 100%; color: var(--playlist-dim);
        font-family: var(--pixel); font-size: 14px; letter-spacing: 2px; text-align: center;
      }
      .recent-row {
        display: flex; align-items: center; gap: 10px;
        padding: 4px 10px; cursor: pointer;
        color: var(--playlist-text); border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .recent-row:hover { background: var(--playlist-hover); }
      .recent-num { font-family: var(--mono); font-size: 11px; color: var(--playlist-dim); width: 22px; text-align: right; flex-shrink: 0; }
      .recent-info { flex: 1; min-width: 0; }
      .recent-title { font-family: var(--mono); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .recent-meta  { font-family: var(--mono); font-size: 11px; color: var(--playlist-dim); margin-top: 1px; }
      .recent-right { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; gap: 1px; }
      .recent-dur  { font-family: var(--mono); font-size: 11px; color: var(--playlist-dur); }
      .recent-ago  { font-family: var(--pixel); font-size: 11px; color: var(--playlist-dim); }
    </style>
    <div id="recents-wrap">
      <div class="recents-titlebar">
        <h2>Recently Played</h2>
        <button class="btn btn-sm" id="recents-clear">Clear</button>
      </div>
      <div class="recents-list" id="recents-list"></div>
    </div>
  `;

  function render() {
    const entries = getRecentTracks(100);
    const list = container.querySelector('#recents-list');
    if (entries.length === 0) {
      list.innerHTML = `<div class="recents-empty">
        <div style="font-size:32px;margin-bottom:12px;opacity:0.3">◷</div>
        <p>Nothing played yet.</p>
        <p style="font-size:11px;margin-top:6px;letter-spacing:1px">Tracks you play will appear here.</p>
      </div>`;
      return;
    }
    list.innerHTML = entries.map((e, i) => {
      const meta = [e.artist, e.genre].filter(Boolean).join(' · ');
      return `
        <div class="recent-row" data-id="${escHtml(e.id)}"
             data-title="${escHtml(e.title)}" data-artist="${escHtml(e.artist || '')}"
             data-duration="${e.duration || 0}">
          <span class="recent-num">${i + 1}.</span>
          <div class="recent-info">
            <div class="recent-title">${escHtml(e.title)}${e.original_format ? ` [${e.original_format}]` : ''}</div>
            ${meta ? `<div class="recent-meta">${escHtml(meta)}</div>` : ''}
          </div>
          <div class="recent-right">
            ${e.duration ? `<span class="recent-dur">${fmtTime(e.duration)}</span>` : ''}
            <span class="recent-ago">${fmtTs(e.ts)}</span>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.recent-row').forEach(row => {
      row.addEventListener('click', () => {
        playTrack({
          id: row.dataset.id, title: row.dataset.title,
          artist: row.dataset.artist || null, duration_seconds: parseFloat(row.dataset.duration) || 0,
        });
      });
    });
  }

  render();
  container.querySelector('#recents-clear').addEventListener('click', () => {
    if (!confirm('Clear play history?')) return;
    clearLog();
    render();
  });
}
