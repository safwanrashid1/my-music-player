import { api } from '../api/client.js';
import { getStats } from '../playlog.js';

function fmtDuration(sec) {
  if (!sec || sec < 60) return `${Math.round(sec || 0)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export async function renderStatistics(container) {
  container.innerHTML = `
    <style>
      #stats-wrap {
        height: 100%; overflow-y: auto;
        background: var(--playlist-bg);
        display: flex; flex-direction: column;
      }
      .stats-titlebar {
        display: flex; align-items: center;
        padding: 4px 8px; flex-shrink: 0;
        background: linear-gradient(90deg, var(--playlist-active) 0%, var(--lcd) 100%);
      }
      .stats-titlebar h2 {
        font-family: var(--pixel); font-size: 13px; letter-spacing: 2px;
        color: #fff; text-transform: uppercase;
      }
      .stats-body { padding: 12px; flex: 1; }

      /* Hero stat cards */
      .stats-hero {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 8px; margin-bottom: 16px;
      }
      .stat-card {
        background: var(--lcd);
        box-shadow: inset 1px 1px 0 #000, inset -1px -1px 0 #203040, 0 0 0 1px var(--chrome-edge);
        padding: 10px 12px;
      }
      .stat-label {
        font-family: var(--pixel); font-size: 11px; letter-spacing: 2px;
        color: var(--lcd-dim); text-transform: uppercase; margin-bottom: 4px;
      }
      .stat-value {
        font-family: var(--pixel); font-size: 22px; letter-spacing: 1px;
        color: var(--lcd-text); line-height: 1.1;
      }
      .stat-sub {
        font-family: var(--mono); font-size: 11px; color: var(--lcd-dim);
        margin-top: 3px;
      }

      /* Section headers */
      .stats-section-title {
        font-family: var(--pixel); font-size: 12px; letter-spacing: 2px;
        color: var(--playlist-dim); text-transform: uppercase;
        padding: 6px 0 4px; margin-top: 10px;
        border-bottom: 1px solid var(--playlist-dim);
        margin-bottom: 6px;
      }

      /* Bar chart rows */
      .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
      .bar-name {
        font-family: var(--mono); font-size: 12px; color: var(--playlist-text);
        width: 140px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .bar-track { flex: 1; height: 10px; background: rgba(0,80,100,0.4); }
      .bar-fill { height: 100%; background: var(--lcd-text); transition: width 0.4s ease; }
      .bar-count {
        font-family: var(--pixel); font-size: 11px; color: var(--playlist-dur);
        width: 36px; text-align: right; flex-shrink: 0;
      }

      /* Library section (from API) */
      .lib-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 6px; margin-top: 6px;
      }
      .lib-card {
        background: var(--lcd); padding: 8px 10px;
        box-shadow: inset 1px 1px 0 #000, inset -1px -1px 0 #203040;
      }
      .lib-label { font-family: var(--pixel); font-size: 10px; color: var(--lcd-dim); letter-spacing: 1px; }
      .lib-val   { font-family: var(--pixel); font-size: 18px; color: var(--lcd-text); margin-top: 2px; }

      .no-data {
        font-family: var(--pixel); font-size: 14px; letter-spacing: 2px;
        color: var(--playlist-dim); text-align: center; padding: 40px;
      }
    </style>
    <div id="stats-wrap">
      <div class="stats-titlebar"><h2>Statistics</h2></div>
      <div class="stats-body" id="stats-body">
        <div style="padding:40px;text-align:center;font-family:var(--pixel);color:var(--playlist-dim);letter-spacing:2px">LOADING…</div>
      </div>
    </div>
  `;

  const body = container.querySelector('#stats-body');

  const [stats, libraryData] = await Promise.all([
    Promise.resolve(getStats()),
    api.getFeed({ limit: 200 }).catch(() => ({ tracks: [] })),
  ]);

  const tracks = libraryData.tracks || [];

  // Library aggregate stats
  const libTotalDuration = tracks.reduce((s, t) => s + (t.duration_seconds || 0), 0);
  const libPlayCount     = tracks.reduce((s, t) => s + (t.play_count || 0), 0);
  const libLikeCount     = tracks.reduce((s, t) => s + (t.like_count || 0), 0);
  const formatCount = {};
  tracks.forEach(t => { if (t.original_format) formatCount[t.original_format] = (formatCount[t.original_format] || 0) + 1; });
  const topFormat = Object.entries(formatCount).sort((a, b) => b[1] - a[1])[0];

  const heroSection = `
    <div class="stats-section-title">Your listening</div>
    ${stats ? `
    <div class="stats-hero">
      <div class="stat-card">
        <div class="stat-label">Time Listened</div>
        <div class="stat-value">${fmtDuration(stats.totalListenedSec)}</div>
        <div class="stat-sub">${stats.totalPlays} total plays</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Fav Artist</div>
        <div class="stat-value" style="font-size:16px">${escHtml(stats.topArtist?.name || '—')}</div>
        <div class="stat-sub">${stats.topArtist ? `${stats.topArtist.plays} plays` : 'Not enough data'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Fav Genre</div>
        <div class="stat-value" style="font-size:16px">${escHtml(stats.topGenre?.name || '—')}</div>
        <div class="stat-sub">${stats.topGenre ? `${stats.topGenre.plays} plays` : 'Not enough data'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Unique Tracks</div>
        <div class="stat-value">${stats.uniqueTracks}</div>
        <div class="stat-sub">played at least once</div>
      </div>
    </div>

    ${stats.artistBreakdown.length > 0 ? `
    <div class="stats-section-title">Artists</div>
    ${renderBars(stats.artistBreakdown)}` : ''}

    ${stats.genreBreakdown.length > 0 ? `
    <div class="stats-section-title">Genres</div>
    ${renderBars(stats.genreBreakdown)}` : ''}

    ` : `<div class="no-data">NO LISTENING DATA YET<br><br>
    <span style="font-size:12px;color:var(--playlist-dim)">Play some tracks to see your stats.</span></div>`}
  `;

  const librarySection = `
    <div class="stats-section-title">Library</div>
    <div class="lib-grid">
      <div class="lib-card"><div class="lib-label">TRACKS</div><div class="lib-val">${tracks.length}</div></div>
      <div class="lib-card"><div class="lib-label">TOTAL DURATION</div><div class="lib-val" style="font-size:14px">${fmtDuration(libTotalDuration)}</div></div>
      <div class="lib-card"><div class="lib-label">TOTAL PLAYS</div><div class="lib-val">${libPlayCount}</div></div>
      <div class="lib-card"><div class="lib-label">TOTAL LIKES</div><div class="lib-val">${libLikeCount}</div></div>
      ${topFormat ? `<div class="lib-card"><div class="lib-label">TOP FORMAT</div><div class="lib-val" style="font-size:14px">${escHtml(topFormat[0])}</div><div class="lib-label">${topFormat[1]} tracks</div></div>` : ''}
    </div>

    ${Object.keys(formatCount).length > 1 ? `
    <div style="margin-top:8px">
    ${renderBars(Object.entries(formatCount).sort((a,b) => b[1]-a[1]))}
    </div>` : ''}
  `;

  body.innerHTML = heroSection + librarySection;
}

function renderBars(entries) {
  if (!entries.length) return '';
  const max = entries[0][1];
  return entries.map(([name, count]) => `
    <div class="bar-row">
      <div class="bar-name">${escHtml(name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((count / max) * 100)}%"></div></div>
      <div class="bar-count">${count}</div>
    </div>`).join('');
}
