import { store } from '../stores/app.js';
import { engine, DEFAULT_BANDS } from '../audio/engine.js';
import { api } from '../api/client.js';
import { logPlay } from '../playlog.js';

let waveformCanvas, waveformCtx, progressEl;
let eqCanvas, eqCtx;
let animFrame;

export function renderPlayer(container) {
  const player = document.createElement('div');
  player.id = 'player';
  player.innerHTML = `
    <style>
      #player {
        grid-area: player;
        background: var(--chrome);
        display: flex; flex-direction: column;
        position: relative; z-index: 10;
        box-shadow:
          inset 0 1px 0 var(--chrome-hi),
          0 0 0 1px var(--chrome-edge);
      }

      /* ── EQ Panel — slides up, looks like a rack-mount EQ module ── */
      #eq-panel {
        position: absolute; bottom: var(--player-h); left: 0; right: 0;
        background: var(--chrome);
        box-shadow: inset 0 1px 0 var(--chrome-hi), 0 0 0 1px var(--chrome-edge);
        padding: 8px 16px 8px;
        display: none; flex-direction: column; gap: 8px;
      }
      #eq-panel.open { display: flex; }
      .eq-titlebar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 2px 4px;
        background: linear-gradient(90deg, var(--playlist-active) 0%, var(--lcd) 100%);
        margin: -8px -16px 4px;
      }
      .eq-title {
        font-family: var(--pixel); font-size: 13px;
        color: #FFFFFF; letter-spacing: 3px; text-transform: uppercase;
      }
      #eq-on-btn, #eq-auto-btn {
        font-size: 10px; letter-spacing: 1px; padding: 1px 5px;
        background: var(--chrome-dark); color: var(--text3);
      }
      #eq-on-btn.active, #eq-auto-btn.active {
        background: var(--lcd-green); color: #000;
        box-shadow: inset 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(0,0,0,0.3), 0 0 4px var(--lcd-green);
      }
      .eq-curve-wrap {
        height: 64px; position: relative;
        background: var(--lcd);
        box-shadow: inset 1px 1px 0 #000, inset -1px -1px 0 #203040;
      }
      #eq-curve { width: 100%; height: 64px; display: block; }
      .eq-bands-row { display: flex; align-items: flex-end; gap: 4px; justify-content: space-between; }
      .eq-band { display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; }
      .eq-band-val {
        font-family: var(--pixel); font-size: 10px; color: var(--lcd-text);
        min-width: 30px; text-align: center;
      }
      .eq-band-label {
        font-family: var(--pixel); font-size: 10px; color: var(--text3);
        letter-spacing: 0.5px;
      }
      .eq-presets-row { display: flex; gap: 4px; align-items: center; overflow-x: auto; padding-bottom: 2px; }
      .eq-preset-pill {
        font-family: var(--pixel); font-size: 12px; padding: 2px 8px;
        white-space: nowrap; cursor: pointer; flex-shrink: 0;
        background: var(--chrome);
        color: var(--text2);
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
        letter-spacing: 0.5px;
      }
      .eq-preset-pill:hover { background: var(--chrome-hi); }
      .eq-preset-pill.active {
        background: var(--lcd);
        color: var(--lcd-text);
        box-shadow: inset 1px 1px 0 #000, inset -1px -1px 0 #203040, 0 0 0 1px var(--chrome-edge);
      }

      /* ── Main player bar ── */
      #player-bar {
        height: var(--player-h); display: flex; align-items: center;
        gap: 10px; padding: 0 12px; flex-shrink: 0;
      }

      /* LCD display block — track info + time */
      #player-lcd {
        background: var(--lcd);
        box-shadow: inset 1px 1px 0 #000, inset -1px -1px 0 #203040, 0 0 0 1px var(--chrome-edge);
        padding: 5px 10px;
        display: flex; flex-direction: column; justify-content: center;
        width: 200px; flex-shrink: 0; height: 52px; overflow: hidden;
      }
      .player-title {
        font-family: var(--pixel); font-size: 15px;
        color: var(--lcd-text); letter-spacing: 1px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .player-artist {
        font-family: var(--pixel); font-size: 12px;
        color: var(--lcd-dim); letter-spacing: 0.5px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .player-badges { display: flex; gap: 3px; margin-top: 3px; flex-wrap: wrap; }

      /* Transport buttons — chunky tape-deck style */
      .player-controls { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
      .ctrl-btn {
        width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; flex-shrink: 0;
        background: var(--chrome);
        color: var(--text);
        box-shadow:
          inset 1px 1px 0 var(--chrome-hi),
          inset -1px -1px 0 var(--chrome-lo),
          0 0 0 1px var(--chrome-edge);
      }
      .ctrl-btn:hover { background: var(--chrome-hi); }
      .ctrl-btn:active {
        box-shadow:
          inset 1px 1px 0 var(--chrome-lo),
          inset -1px -1px 0 var(--chrome-hi),
          0 0 0 1px var(--chrome-edge);
      }
      #btn-play {
        width: 36px; height: 36px; font-size: 14px;
        background: var(--lcd);
        color: var(--lcd-text);
        box-shadow:
          inset 1px 1px 0 #002840,
          inset -1px -1px 0 #000810,
          0 0 0 1px var(--chrome-edge);
      }
      #btn-play:hover { background: var(--playlist-hover); color: #fff; }
      #btn-play:active {
        box-shadow:
          inset 1px 1px 0 #000,
          inset -1px -1px 0 #004060,
          0 0 0 1px var(--chrome-edge);
      }

      /* Waveform + time */
      .player-waveform-wrap { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .time-row {
        display: flex; justify-content: space-between;
        font-family: var(--pixel); font-size: 14px;
        color: var(--lcd-text); letter-spacing: 1px;
        padding: 1px 6px;
        background: var(--lcd);
        box-shadow: inset 1px 1px 0 #000, inset -1px -1px 0 #203040, 0 0 0 1px var(--chrome-edge);
        flex-shrink: 0; height: 18px;
      }
      #time-current { color: var(--lcd-text); }
      #time-duration { color: var(--lcd-dim); }
      #waveform-canvas {
        width: 100%; cursor: pointer; display: block;
        height: 22px; flex-shrink: 0;
      }

      /* Right controls */
      .player-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .vol-wrap { display: flex; align-items: center; gap: 4px; }
      .vol-icon { font-size: 13px; color: var(--text3); font-family: var(--pixel); }
      #vol-slider { width: 64px; }
      .eq-toggle-btn {
        font-family: var(--pixel); font-size: 13px; padding: 3px 8px;
        letter-spacing: 1px; text-transform: uppercase;
        background: var(--chrome);
        color: var(--text2);
        box-shadow:
          inset 1px 1px 0 var(--chrome-hi),
          inset -1px -1px 0 var(--chrome-lo),
          0 0 0 1px var(--chrome-edge);
      }
      .eq-toggle-btn:hover { background: var(--chrome-hi); }
      .eq-toggle-btn.active {
        background: var(--lcd);
        color: var(--lcd-text);
        box-shadow:
          inset 1px 1px 0 #000,
          inset -1px -1px 0 #203040,
          0 0 0 1px var(--chrome-edge);
      }

      /* idle state */
      #player-bar.idle #player-lcd { opacity: 0.45; }
      #player-bar.idle .player-waveform-wrap { opacity: 0.3; }
    </style>

    <!-- EQ Panel -->
    <div id="eq-panel">
      <!-- EQ title bar — like Winamp's EQUALIZER window header -->
      <div class="eq-titlebar">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="eq-title">EQUALIZER</span>
          <!-- ON / AUTO / PRESETS — the three classic Winamp EQ toggles -->
          <button class="btn btn-sm" id="eq-on-btn" title="EQ on/off">ON</button>
          <button class="btn btn-sm" id="eq-auto-btn" title="Auto-EQ">AUTO</button>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <button class="btn btn-sm" id="eq-reset">RESET</button>
          <button class="btn btn-sm" id="eq-save">SAVE PRESET</button>
          <div class="eq-presets-row" id="eq-presets-row"></div>
        </div>
      </div>
      <div class="eq-curve-wrap">
        <canvas id="eq-curve"></canvas>
      </div>
      <div class="eq-bands-row" id="eq-bands-row"></div>
    </div>

    <!-- Player Bar -->
    <div id="player-bar" class="idle">
      <div id="player-lcd">
        <div class="player-title" id="player-title">NO TRACK LOADED</div>
        <div class="player-artist" id="player-artist">——</div>
        <div class="player-badges" id="player-badges"></div>
      </div>

      <div class="player-controls">
        <button class="ctrl-btn" id="btn-prev" title="Previous">⏮</button>
        <button class="ctrl-btn" id="btn-play" title="Play / Pause">▶</button>
        <button class="ctrl-btn" id="btn-next" title="Next">⏭</button>
      </div>

      <div class="player-waveform-wrap">
        <div class="time-row">
          <span id="time-current">0:00</span>
          <span id="time-duration">0:00</span>
        </div>
        <canvas id="waveform-canvas"></canvas>
      </div>

      <div class="player-right">
        <div class="vol-wrap">
          <span class="vol-icon">▲</span>
          <input type="range" id="vol-slider" min="0" max="100" value="85" title="Volume" />
        </div>
        <button class="eq-toggle-btn active" id="normalize-toggle-btn" title="Loudness normalization">NORM</button>
        <button class="eq-toggle-btn" id="eq-toggle-btn">EQ</button>
      </div>
    </div>
  `;
  container.appendChild(player);

  waveformCanvas = player.querySelector('#waveform-canvas');
  waveformCtx = waveformCanvas.getContext('2d');
  eqCanvas = player.querySelector('#eq-curve');
  eqCtx = eqCanvas.getContext('2d');

  setupTransport(player);
  setupWaveform(player);
  setupEQ(player);
  setupVolume(player);
  setupNormalization(player);
  bindEngineEvents(player);
}

// ─── Transport ─────────────────────────────────────────────────────────────

export function togglePlay() {
  if (!store.get('currentTrack')) return;
  engine.toggle();
}

export function prevTrack() {
  const q = store.get('queue'), i = store.get('queueIndex');
  if (i > 0) playQueueItem(i - 1);
  else engine.seek(0);
}

export function nextTrack() {
  const q = store.get('queue'), i = store.get('queueIndex');
  if (i < q.length - 1) playQueueItem(i + 1);
}

function setupTransport(player) {
  player.querySelector('#btn-play').addEventListener('click', togglePlay);
  player.querySelector('#btn-prev').addEventListener('click', prevTrack);
  player.querySelector('#btn-next').addEventListener('click', nextTrack);
}

export async function playTrack(track) {
  const queue = store.get('queue') || [];
  let idx = queue.findIndex(t => t.id === track.id);
  if (idx === -1) {
    queue.push(track);
    idx = queue.length - 1;
    store.set('queue', queue);
  }
  store.set('queueIndex', idx);
  store.set('currentTrack', track);

  const bar = document.querySelector('#player-bar');
  if (bar) bar.classList.remove('idle');

  updatePlayerInfo(track);

  logPlay(track);
  const streamUrl = api.streamUrl(track.id);
  await engine.loadTrack(track.id, streamUrl, { lufsIntegrated: track.lufs_integrated });
  await engine.play();
  prefetchNext(queue, idx);
}

function playQueueItem(idx) {
  const q = store.get('queue');
  if (q[idx]) {
    store.set('queueIndex', idx);
    playTrack(q[idx]);
  }
}

// Replace the whole queue with a collection's tracks and start playing. Used
// by Album/Playlist detail pages' "Play all" button.
export function playCollection(tracks, startIndex = 0) {
  if (!tracks || tracks.length === 0) return;
  store.set('queue', [...tracks]);
  playTrack(tracks[startIndex]);
}

// Warms the connection + browser cache for the upcoming track with a small
// leading range, so the gap when it actually starts is mostly hidden. Capped
// at ~1.5MB since lossless files can be huge and most queue items are never
// reached (skip/stop), so a full prefetch would waste real bandwidth.
const PREFETCH_BYTES = 1.5 * 1024 * 1024;

function prefetchNext(queue, currentIdx) {
  const next = queue[currentIdx + 1];
  if (!next) return;
  fetch(api.streamUrl(next.id), {
    headers: { Range: `bytes=0-${PREFETCH_BYTES - 1}` },
    priority: 'low',
  }).catch(() => {});
}

// ─── Track Info ────────────────────────────────────────────────────────────

function updatePlayerInfo(track) {
  const title = document.querySelector('#player-title');
  const artist = document.querySelector('#player-artist');
  const badges = document.querySelector('#player-badges');

  if (title) title.textContent = (track.title || 'UNTITLED').toUpperCase();
  if (artist) artist.textContent = track.artist || '——';
  if (badges) {
    const parts = [];
    if (track.original_format) parts.push(`<span class="badge">${track.original_format}</span>`);
    if (track.sample_rate) parts.push(`<span class="badge">${Math.round(track.sample_rate / 1000)}K</span>`);
    if (track.bit_depth) parts.push(`<span class="badge">${track.bit_depth}BIT</span>`);
    if (typeof track.lufs_integrated === 'number') parts.push(`<span class="badge" title="Integrated loudness">${track.lufs_integrated.toFixed(1)}LU</span>`);
    badges.innerHTML = parts.join('');
  }

  // Load waveform data
  if (track.waveform_data && Array.isArray(track.waveform_data)) {
    store.set('waveformPeaks', track.waveform_data);
    drawWaveform();
  } else {
    api.getWaveform(track.id).then(d => {
      store.set('waveformPeaks', d.peaks);
      drawWaveform();
    }).catch(() => {});
  }
}

// ─── Waveform ──────────────────────────────────────────────────────────────

function setupWaveform(player) {
  const canvas = player.querySelector('#waveform-canvas');
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    engine.seekPercent(pct * 100);
  });

  // Resize observer
  const ro = new ResizeObserver(() => {
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    waveformCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    drawWaveform();
  });
  ro.observe(canvas);
}

function drawWaveform() {
  if (!waveformCanvas || !waveformCtx) return;
  const peaks = store.get('waveformPeaks') || [];
  const progress = store.get('duration') > 0 ? store.get('currentTime') / store.get('duration') : 0;
  const W = waveformCanvas.offsetWidth || 400;
  const H = waveformCanvas.offsetHeight || 32;

  waveformCtx.fillStyle = '#001828';
  waveformCtx.fillRect(0, 0, W, H);
  if (peaks.length === 0) {
    // Empty bars placeholder
    const n = 80;
    for (let i = 0; i < n; i++) {
      waveformCtx.fillStyle = 'rgba(0,120,140,0.3)';
      const x = (i / n) * W;
      const w = Math.max(1, W / n - 1.5);
      const h = 4 + Math.sin(i * 0.3) * 3;
      waveformCtx.fillRect(x, (H - h) / 2, w, h);
    }
    return;
  }

  const n = peaks.length;
  const barW = Math.max(1, W / n - 1);
  const progressX = progress * W;

  for (let i = 0; i < n; i++) {
    const x = (i / n) * W;
    const h = Math.max(2, peaks[i] * H * 0.9);
    const played = x < progressX;
    waveformCtx.fillStyle = played ? '#00DCDC' : 'rgba(0,100,130,0.5)';
    waveformCtx.fillRect(x, (H - h) / 2, barW, h);
  }

  // Playhead
  if (progress > 0 && progress < 1) {
    waveformCtx.fillStyle = '#fff';
    waveformCtx.fillRect(progressX - 0.75, 0, 1.5, H);
  }
}

// ─── EQ ────────────────────────────────────────────────────────────────────

const BAND_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

function syncSliderUI(player, bands) {
  bands.forEach((b, i) => {
    const sl = player.querySelector(`#eq-slider-${i}`);
    const val = player.querySelector(`#eq-val-${i}`);
    if (sl) sl.value = b.gain;
    if (val) val.textContent = (b.gain >= 0 ? '+' : '') + b.gain.toFixed(1) + 'dB';
  });
}

function setupEQ(player) {
  const bandsRow = player.querySelector('#eq-bands-row');

  // Build 10 band sliders
  DEFAULT_BANDS.forEach((band, i) => {
    const div = document.createElement('div');
    div.className = 'eq-band';
    div.innerHTML = `
      <span class="eq-band-val" id="eq-val-${i}">0dB</span>
      <input type="range" class="vertical" min="-12" max="12" step="0.5" value="0" id="eq-slider-${i}" title="${band.freq}Hz" />
      <span class="eq-band-label">${BAND_LABELS[i]}</span>
    `;
    const slider = div.querySelector(`#eq-slider-${i}`);
    const valEl  = div.querySelector(`#eq-val-${i}`);
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valEl.textContent = (v >= 0 ? '+' : '') + v.toFixed(1) + 'dB';
      engine.setEqBand(i, v);
      drawEqCurve();
      store.set('eqBands', engine.getCurrentBands());
    });
    bandsRow.appendChild(div);
  });

  // Rehydrate a custom curve persisted from a previous session
  const savedBands = store.get('eqBands');
  if (savedBands && savedBands.length === DEFAULT_BANDS.length) {
    engine.applyEqPreset(savedBands);
    syncSliderUI(player, savedBands);
  }

  // EQ toggle panel
  const toggleBtn = player.querySelector('#eq-toggle-btn');
  const eqPanel = player.querySelector('#eq-panel');
  const eqOnBtn = player.querySelector('#eq-on-btn');
  const eqAutoBtn = player.querySelector('#eq-auto-btn');

  toggleBtn.addEventListener('click', () => {
    const open = eqPanel.classList.toggle('open');
    toggleBtn.classList.toggle('active', open);
    store.set('showEq', open);
    if (open) {
      setTimeout(() => {
        eqCanvas.width = eqCanvas.offsetWidth * window.devicePixelRatio;
        eqCanvas.height = eqCanvas.offsetHeight * window.devicePixelRatio;
        eqCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
        drawEqCurve();
        loadEqPresets();
      }, 50);
    }
  });

  // ON button — mirrors the sidebar EQ enabled toggle
  eqOnBtn?.addEventListener('click', () => {
    store.set('eqEnabled', !store.get('eqEnabled'));
  });
  store.subscribe('eqEnabled', (enabled) => {
    eqOnBtn?.classList.toggle('active', !!enabled);
  });

  // AUTO button — visual toggle only (linked to normalization)
  eqAutoBtn?.addEventListener('click', () => {
    store.set('normalizeEnabled', !store.get('normalizeEnabled'));
  });
  store.subscribe('normalizeEnabled', (enabled) => {
    eqAutoBtn?.classList.toggle('active', !!enabled);
  });

  store.subscribe('showEq', (open) => {
    eqPanel.classList.toggle('open', !!open);
    toggleBtn.classList.toggle('active', !!open);
  });

  // Reset
  player.querySelector('#eq-reset').addEventListener('click', () => {
    engine.resetEq();
    syncSliderUI(player, DEFAULT_BANDS);
    drawEqCurve();
    store.set('eqBands', engine.getCurrentBands());
    store.set('activePreset', 'flat');
  });

  // Save preset
  player.querySelector('#eq-save').addEventListener('click', () => {
    const name = prompt('Preset name:');
    if (!name) return;
    api.saveEqPreset({ name, bands: engine.getCurrentBands() }).then(() => {
      showToast('Preset saved', 'success');
      loadEqPresets();
    });
  });

  const ro = new ResizeObserver(() => {
    if (!eqPanel.classList.contains('open')) return;
    eqCanvas.width = eqCanvas.offsetWidth * window.devicePixelRatio;
    eqCanvas.height = eqCanvas.offsetHeight * window.devicePixelRatio;
    eqCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    drawEqCurve();
  });
  ro.observe(eqPanel);
}

function drawEqCurve() {
  if (!eqCtx || !eqCanvas) return;
  const W = eqCanvas.offsetWidth || 400;
  const H = eqCanvas.offsetHeight || 60;
  const maxDb = 14;

  eqCtx.clearRect(0, 0, W, H);

  // Grid lines at 0dB and ±6dB
  [-6, 0, 6].forEach(db => {
    const y = H / 2 - (db / maxDb) * (H / 2);
    eqCtx.beginPath();
    eqCtx.strokeStyle = db === 0 ? 'rgba(0,200,200,0.25)' : 'rgba(0,100,120,0.2)';
    eqCtx.lineWidth = 0.5;
    eqCtx.moveTo(0, y); eqCtx.lineTo(W, y);
    eqCtx.stroke();
  });

  const resp = engine.getFrequencyResponse(512);
  if (!resp) return;

  const { db } = resp;
  const n = db.length;

  // Fill
  eqCtx.beginPath();
  eqCtx.moveTo(0, H / 2);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * W;
    const y = H / 2 - Math.max(-maxDb, Math.min(maxDb, db[i])) / maxDb * (H / 2);
    if (i === 0) eqCtx.lineTo(x, y); else eqCtx.lineTo(x, y);
  }
  eqCtx.lineTo(W, H / 2);
  eqCtx.closePath();
  const grad = eqCtx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,200,200,0.35)');
  grad.addColorStop(1, 'rgba(0,80,100,0.05)');
  eqCtx.fillStyle = grad;
  eqCtx.fill();

  // Line
  eqCtx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * W;
    const y = H / 2 - Math.max(-maxDb, Math.min(maxDb, db[i])) / maxDb * (H / 2);
    if (i === 0) eqCtx.moveTo(x, y); else eqCtx.lineTo(x, y);
  }
  eqCtx.strokeStyle = '#00DCDC';
  eqCtx.lineWidth = 1.5;
  eqCtx.stroke();
}

async function loadEqPresets() {
  const row = document.querySelector('#eq-presets-row');
  if (!row) return;
  try {
    const presets = await api.getEqPresets();
    row.innerHTML = presets.map(p =>
      `<div class="eq-preset-pill" data-id="${p.id}" data-bands='${JSON.stringify(p.bands)}'>${p.name}</div>`
    ).join('');
    row.querySelectorAll('.eq-preset-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.id === store.get('activePreset'));
      pill.addEventListener('click', () => {
        const bands = JSON.parse(pill.dataset.bands);
        engine.applyEqPreset(bands);
        syncSliderUI(document, bands);
        drawEqCurve();
        row.querySelectorAll('.eq-preset-pill').forEach(p2 => p2.classList.toggle('active', p2 === pill));
        store.set('eqBands', bands);
        store.set('activePreset', pill.dataset.id);
      });
    });
  } catch { /* preset fetch failed — leave row empty */ }
}

// ─── Volume ────────────────────────────────────────────────────────────────

function setupVolume(player) {
  const slider = player.querySelector('#vol-slider');
  slider.addEventListener('input', () => {
    store.set('volume', slider.value / 100);
  });
  // Single source of truth: any volume change (slider, keyboard, mute) flows
  // through the store, which is what actually applies it to the engine — so
  // the persisted/default volume gets applied on boot too, not just on drag.
  store.subscribe('volume', (v) => {
    slider.value = Math.round(v * 100);
    engine.setVolume(v);
  });
}

// ─── Loudness Normalization ────────────────────────────────────────────────

function setupNormalization(player) {
  const btn = player.querySelector('#normalize-toggle-btn');
  btn.addEventListener('click', () => {
    store.set('normalizeEnabled', !engine.normalizeEnabled);
  });
  store.subscribe('normalizeEnabled', (enabled) => {
    enabled = enabled !== false;
    engine.setNormalization(enabled);
    btn.classList.toggle('active', enabled);
    btn.title = enabled
      ? "Loudness normalization is ON — matches tracks to a common level. Click to disable and hear the file's native level."
      : 'Loudness normalization is OFF — playing at the file\'s native level. Click to enable.';
  });
}

// ─── Engine Events ─────────────────────────────────────────────────────────

function bindEngineEvents(player) {
  const playBtn  = player.querySelector('#btn-play');
  const timeCur  = player.querySelector('#time-current');
  const timeDur  = player.querySelector('#time-duration');

  engine.on('playstate', (playing) => {
    playBtn.textContent = playing ? '⏸' : '▶';
    store.set('isPlaying', playing);
    if (playing) startWaveformLoop(); else stopWaveformLoop();
  });

  engine.on('timeupdate', ({ currentTime, duration }) => {
    store.set('currentTime', currentTime);
    store.set('duration', duration);
    if (timeCur) timeCur.textContent = formatTime(currentTime);
    if (timeDur) timeDur.textContent = formatTime(duration);
    drawWaveform();
  });

  engine.on('ended', () => {
    const q = store.get('queue'), i = store.get('queueIndex');
    if (i < q.length - 1) playQueueItem(i + 1);
    else { store.set('isPlaying', false); playBtn.textContent = '▶'; }
  });

  engine.on('buffering', (isBuffering) => {
    store.set('isBuffering', isBuffering);
    if (isBuffering) playBtn.textContent = '…';
  });

  engine.on('error', ({ message }) => showToast(`Playback error: ${message}`, 'error'));
}

function startWaveformLoop() {
  stopWaveformLoop();
  function loop() { drawWaveform(); animFrame = requestAnimationFrame(loop); }
  loop();
}
function stopWaveformLoop() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => { t.className = ''; }, 3200);
}
