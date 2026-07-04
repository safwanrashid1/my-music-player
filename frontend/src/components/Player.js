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

      /* ══════════════════════════════════════════════════════════════════════
         WINAMP 2.x CLASSIC SKIN — main player layout
         Two-zone: LCD display area (top) + chrome hardware controls (bottom)
         ══════════════════════════════════════════════════════════════════════ */

      @keyframes marquee-text {
        0%   { transform: translateX(0); }
        15%  { transform: translateX(0); }
        85%  { transform: translateX(var(--marquee-offset, -40%)); }
        100% { transform: translateX(0); }
      }

      #player-bar {
        display: flex; flex-direction: column;
        height: var(--player-h); flex-shrink: 0;
      }

      /* ─ Zone 1: LCD display ─────────────────────────────────────────────── */
      #player-display {
        flex: 1; min-height: 0;
        background: #001828;
        display: flex; flex-direction: column;
        padding: 3px 8px 2px;
        gap: 1px;
        box-shadow:
          inset 2px 2px 0 #000810,
          inset -1px -1px 0 #002840;
      }

      /* Title row */
      #disp-title-row {
        display: flex; align-items: center; gap: 6px;
        flex-shrink: 0; overflow: hidden; height: 20px;
      }

      /* Playing LED indicator */
      #playing-led {
        width: 7px; height: 7px; flex-shrink: 0;
        background: #003040;
        box-shadow: inset 1px 1px 0 rgba(0,0,0,0.5);
      }
      #playing-led.on {
        background: #00CC44;
        box-shadow: 0 0 4px #00CC44, 0 0 8px rgba(0,204,68,0.5);
      }

      /* Scrolling title */
      #title-marquee-wrap {
        flex: 1; overflow: hidden; min-width: 0;
      }
      #title-marquee { white-space: nowrap; }
      #title-marquee.scrolling #player-title {
        animation: marquee-text 12s ease-in-out infinite;
      }
      #player-title {
        font-family: var(--pixel); font-size: 15px;
        color: #00DCDC; letter-spacing: 1px;
        display: inline-block;
      }

      /* Spec: artist · kbps · kHz · ST */
      #spec-badges {
        display: flex; align-items: center; gap: 3px;
        flex-shrink: 0;
        font-family: var(--mono); font-size: 10px;
      }
      .spec-val   { color: #00AAAA; }
      .spec-label { color: #005A60; font-size: 9px; }
      .spec-sep   { color: #003040; }
      #player-stereo {
        font-family: var(--pixel); font-size: 11px;
        color: #00CC44; letter-spacing: 1px;
      }

      /* ─ Waveform + time row ─ */
      #disp-wave-row {
        display: flex; align-items: stretch; gap: 6px;
        flex: 1; min-height: 0; overflow: hidden;
      }

      /* Time display — large 7-segment LCD style */
      #time-display {
        display: flex; align-items: flex-end; gap: 1px;
        flex-shrink: 0; padding-bottom: 1px;
      }
      .time-sign {
        font-family: var(--pixel); font-size: 12px;
        color: #005060; line-height: 1; padding-bottom: 2px;
      }
      #time-current {
        font-family: var(--pixel); font-size: 28px; letter-spacing: 3px;
        color: #00DCDC; line-height: 1;
      }
      #time-duration-wrap {
        display: flex; align-items: flex-end; flex-shrink: 0;
        padding-bottom: 1px;
      }
      #time-duration {
        font-family: var(--pixel); font-size: 13px;
        color: #00606A; letter-spacing: 1px; line-height: 1;
      }

      /* Waveform canvas — fills the gap between the time displays */
      #waveform-canvas {
        flex: 1; width: 100%; min-width: 0;
        cursor: pointer; display: block;
        background: #001828;
      }

      /* Badges row (format / kHz / bit-depth) */
      .player-badges { display: flex; gap: 2px; flex-wrap: wrap; }
      .player-artist { display: none; } /* hidden — shown in spec badges instead */

      /* ─ Zone 2: Chrome hardware controls ─────────────────────────────────── */
      #player-controls {
        display: flex; align-items: center; gap: 5px;
        padding: 3px 8px; flex-shrink: 0; height: 36px;
        background: var(--chrome);
        box-shadow: inset 0 1px 0 var(--chrome-hi);
      }

      /* Tape-deck transport buttons */
      #transport { display: flex; gap: 2px; flex-shrink: 0; }
      .tp-btn {
        font-family: var(--pixel); font-size: 13px; letter-spacing: 0.5px;
        padding: 3px 6px; cursor: pointer; flex-shrink: 0;
        background: var(--chrome); color: var(--text);
        box-shadow:
          inset 1px 1px 0 var(--chrome-hi),
          inset -1px -1px 0 var(--chrome-lo),
          0 0 0 1px var(--chrome-edge);
        display: flex; align-items: center; justify-content: center;
        min-width: 24px; height: 22px;
      }
      .tp-btn:hover { background: var(--chrome-hi); }
      .tp-btn:active {
        box-shadow:
          inset 1px 1px 0 var(--chrome-lo),
          inset -1px -1px 0 var(--chrome-hi),
          0 0 0 1px var(--chrome-edge);
      }
      /* Play button — LCD-styled, stands out */
      #btn-play {
        background: #001828;
        color: #00DCDC;
        padding: 3px 12px; font-size: 14px;
        box-shadow:
          inset 1px 1px 0 #002840,
          inset -1px -1px 0 #000810,
          0 0 0 1px var(--chrome-edge);
      }
      #btn-play:hover { background: #002040; color: #00FFFF; }
      #btn-play:active {
        box-shadow:
          inset 1px 1px 0 #000,
          inset -1px -1px 0 #004060,
          0 0 0 1px var(--chrome-edge);
      }
      #btn-play.paused { color: #00888A; }

      /* Volume / Balance sliders */
      #vol-group, #bal-group {
        display: flex; align-items: center; gap: 3px; flex-shrink: 0;
      }
      .sl-label {
        font-family: var(--pixel); font-size: 11px; letter-spacing: 1px;
        color: var(--text3); flex-shrink: 0;
      }
      #vol-slider { width: 68px; }
      #bal-slider { width: 46px; }

      /* Mode / utility buttons (right cluster) */
      #mode-btns {
        display: flex; align-items: center; gap: 1px;
        margin-left: auto; flex-shrink: 0;
      }
      .mode-btn {
        font-family: var(--pixel); font-size: 11px; letter-spacing: 0.5px;
        padding: 2px 6px; cursor: pointer;
        background: var(--chrome-dark); color: var(--text3);
        box-shadow:
          inset 1px 1px 0 var(--chrome-hi),
          inset -1px -1px 0 var(--chrome-lo),
          0 0 0 1px var(--chrome-edge);
        height: 18px; display: flex; align-items: center;
        text-transform: uppercase; white-space: nowrap;
      }
      .mode-btn:hover { background: var(--chrome); color: var(--text); }
      .mode-btn.active {
        background: #001828;
        color: #00DCDC;
        box-shadow:
          inset 1px 1px 0 #000,
          inset -1px -1px 0 #203040,
          0 0 0 1px var(--chrome-edge);
      }
      .mode-sep {
        width: 0; height: 14px; margin: 0 3px;
        border-left: 1px solid var(--chrome-lo);
        border-right: 1px solid var(--chrome-hi);
      }

      /* Idle: dim display, keep controls usable */
      #player-bar.idle #player-display { opacity: 0.65; }

      /* Aliases for legacy code that targets old class names */
      .eq-toggle-btn { /* mapped to .mode-btn by HTML */ }
      .ctrl-btn      { /* mapped to .tp-btn by HTML */ }

      /* ── DJ Console Panel ── */
      #dj-panel {
        position: absolute; bottom: var(--player-h); left: 0; right: 0;
        background: var(--chrome);
        box-shadow: inset 0 1px 0 var(--chrome-hi), 0 0 0 1px var(--chrome-edge);
        display: none; flex-direction: column;
      }
      #dj-panel.open { display: flex; }
      .dj-titlebar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 3px 8px;
        background: linear-gradient(90deg, #800040 0%, #400020 100%);
        flex-shrink: 0;
      }
      .dj-titlebar-title { font-family: var(--pixel); font-size: 13px; color: #FF80B0; letter-spacing: 3px; }
      .dj-stem-pills { display: flex; gap: 3px; }
      .dj-stem-pill {
        font-family: var(--pixel); font-size: 11px; padding: 2px 7px; cursor: pointer;
        background: rgba(255,100,150,0.15); color: #FF80B0; letter-spacing: 1px;
        box-shadow: inset 1px 1px 0 rgba(255,150,180,0.2), inset -1px -1px 0 rgba(0,0,0,0.4), 0 0 0 1px #400020;
      }
      .dj-stem-pill:hover { background: rgba(255,100,150,0.35); }

      .dj-body {
        display: flex; gap: 0; padding: 8px 10px; overflow-x: auto;
      }
      .dj-section {
        padding: 0 10px; flex-shrink: 0;
        border-right: 1px solid var(--chrome-lo);
      }
      .dj-section:first-child { padding-left: 0; }
      .dj-section:last-child  { border-right: none; }
      .dj-section-title {
        font-family: var(--pixel); font-size: 10px; letter-spacing: 2px;
        color: var(--text3); text-transform: uppercase; margin-bottom: 5px;
      }

      /* Filter sliders */
      .dj-filter-row { display: flex; gap: 8px; }
      .dj-fader {
        display: flex; flex-direction: column; align-items: center; gap: 3px;
      }
      .dj-fader-label { font-family: var(--pixel); font-size: 10px; color: #FF80B0; letter-spacing: 1px; }
      .dj-fader input[type=range] { height: 60px; width: 8px; }
      .dj-fader-val { font-family: var(--mono); font-size: 9px; color: var(--lcd-dim); }

      /* Kill buttons */
      .dj-kills { display: flex; gap: 4px; }
      .dj-kill-btn {
        font-family: var(--pixel); font-size: 14px; letter-spacing: 1px;
        padding: 4px 10px; cursor: pointer;
        background: var(--chrome-dark); color: var(--text2);
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
      }
      .dj-kill-btn:hover { background: var(--chrome-hi); }
      .dj-kill-btn.killed {
        background: var(--led-red); color: #fff;
        box-shadow: inset 1px 1px 0 rgba(255,120,120,0.5), inset -1px -1px 0 rgba(0,0,0,0.5), 0 0 8px var(--led-red), 0 0 0 1px var(--chrome-edge);
      }

      /* Loop */
      .dj-loop-display {
        font-family: var(--mono); font-size: 11px; color: var(--lcd-text);
        background: var(--lcd); padding: 3px 8px; margin-bottom: 5px;
        box-shadow: inset 1px 1px 0 #000, inset -1px -1px 0 #203040;
        white-space: nowrap; min-width: 140px;
      }
      .dj-loop-btns { display: flex; gap: 3px; }
      .dj-btn {
        font-family: var(--pixel); font-size: 12px; padding: 3px 8px; cursor: pointer;
        background: var(--chrome); color: var(--text);
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
        letter-spacing: 0.5px;
      }
      .dj-btn:hover { background: var(--chrome-hi); }
      .dj-btn:active, .dj-btn.active {
        background: var(--lcd); color: var(--lcd-text);
        box-shadow: inset 1px 1px 0 #000, inset -1px -1px 0 #203040, 0 0 0 1px var(--chrome-edge);
      }

      /* Hot cue pads */
      .dj-cues { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
      .dj-cue-pad {
        font-family: var(--pixel); font-size: 11px; line-height: 1.3;
        padding: 5px 8px; cursor: pointer; text-align: center;
        background: var(--chrome-dark); color: var(--text3);
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
        min-width: 56px;
      }
      .dj-cue-pad:hover { background: var(--chrome); }
      .dj-cue-pad.set { background: #003050; color: var(--lcd-text); box-shadow: inset 1px 1px 0 #002840, inset -1px -1px 0 #000810, 0 0 4px var(--accent), 0 0 0 1px var(--chrome-edge); }
      .dj-cue-pad:active { box-shadow: inset 1px 1px 0 var(--chrome-lo), inset -1px -1px 0 var(--chrome-hi), 0 0 0 1px var(--chrome-edge); }
      .cue-num { color: #FF80B0; font-size: 10px; }
    </style>

    <!-- DJ Console Panel -->
    <div id="dj-panel">
      <div class="dj-titlebar">
        <span class="dj-titlebar-title">DJ CONSOLE</span>
        <div class="dj-stem-pills">
          <button class="dj-stem-pill" data-stem="bass">BASS</button>
          <button class="dj-stem-pill" data-stem="vocal">VOCAL</button>
          <button class="dj-stem-pill" data-stem="tops">TOPS</button>
          <button class="dj-stem-pill" data-stem="full">FULL</button>
        </div>
      </div>
      <div class="dj-body">

        <!-- FILTERS -->
        <div class="dj-section">
          <div class="dj-section-title">Filters</div>
          <div class="dj-filter-row">
            <div class="dj-fader">
              <div class="dj-fader-label">HP</div>
              <input type="range" class="vertical" id="dj-hp" min="20" max="2000" value="20" title="High-pass: sweep bass out" />
              <div class="dj-fader-val" id="dj-hp-val">20Hz</div>
            </div>
            <div class="dj-fader">
              <div class="dj-fader-label">LP</div>
              <input type="range" class="vertical" id="dj-lp" min="500" max="20000" value="20000" title="Low-pass: sweep highs out" />
              <div class="dj-fader-val" id="dj-lp-val">20k</div>
            </div>
            <div class="dj-fader">
              <div class="dj-fader-label">REV</div>
              <input type="range" class="vertical" id="dj-rev" min="0" max="100" value="0" title="Reverb send" />
              <div class="dj-fader-val" id="dj-rev-val">0%</div>
            </div>
            <div class="dj-fader">
              <div class="dj-fader-label">DLY</div>
              <input type="range" class="vertical" id="dj-dly" min="0" max="100" value="0" title="Delay send" />
              <div class="dj-fader-val" id="dj-dly-val">0%</div>
            </div>
          </div>
        </div>

        <!-- EQ KILLS -->
        <div class="dj-section">
          <div class="dj-section-title">EQ Kill</div>
          <div class="dj-kills">
            <button class="dj-kill-btn" id="dj-kill-bass" title="Silence bass frequencies">LO</button>
            <button class="dj-kill-btn" id="dj-kill-mid" title="Silence mids">MID</button>
            <button class="dj-kill-btn" id="dj-kill-high" title="Silence highs">HI</button>
          </div>
        </div>

        <!-- LOOP -->
        <div class="dj-section">
          <div class="dj-section-title">Loop</div>
          <div class="dj-loop-display" id="dj-loop-display">— SET IN + OUT —</div>
          <div class="dj-loop-btns">
            <button class="dj-btn" id="dj-loop-in" title="Set loop start">IN</button>
            <button class="dj-btn" id="dj-loop-out" title="Set loop end">OUT</button>
            <button class="dj-btn" id="dj-loop-toggle" title="Toggle loop">LOOP</button>
          </div>
        </div>

        <!-- HOT CUES -->
        <div class="dj-section">
          <div class="dj-section-title">Hot Cues <span style="font-size:9px;color:var(--text3)">(click=set/jump · right-click=clear)</span></div>
          <div class="dj-cues">
            <button class="dj-cue-pad" id="dj-cue-0"><div class="cue-num">1</div><div class="cue-time">—</div></button>
            <button class="dj-cue-pad" id="dj-cue-1"><div class="cue-num">2</div><div class="cue-time">—</div></button>
            <button class="dj-cue-pad" id="dj-cue-2"><div class="cue-num">3</div><div class="cue-time">—</div></button>
            <button class="dj-cue-pad" id="dj-cue-3"><div class="cue-num">4</div><div class="cue-time">—</div></button>
          </div>
        </div>

      </div>
    </div>

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

    <!-- ══ MAIN PLAYER — Winamp 2.x authentic layout ══ -->
    <div id="player-bar" class="idle">

      <!-- Zone 1: LCD display area -->
      <div id="player-display">

        <!-- Row 1: scrolling title + spec info -->
        <div id="disp-title-row">
          <div id="playing-led" title="Playing"></div>
          <div id="title-marquee-wrap">
            <div id="title-marquee">
              <span id="player-title">NO TRACK LOADED</span>
            </div>
          </div>
          <div id="spec-badges">
            <span id="player-artist" class="spec-val" style="display:none"></span>
            <span id="player-kbps"  class="spec-val">---</span>
            <span class="spec-label">kbps</span>
            <span class="spec-sep">·</span>
            <span id="player-khz"   class="spec-val">--.-</span>
            <span class="spec-label">kHz</span>
            <span id="player-stereo" class="spec-val">ST</span>
          </div>
        </div>

        <!-- Row 2: time + waveform visualizer + duration + badges -->
        <div id="disp-wave-row">
          <div id="time-display">
            <span class="time-sign">+</span>
            <span id="time-current">0:00</span>
          </div>
          <canvas id="waveform-canvas"></canvas>
          <div id="time-duration-wrap">
            <span id="time-duration">0:00</span>
          </div>
          <div class="player-badges" id="player-badges"></div>
        </div>

      </div>

      <!-- Zone 2: Chrome hardware controls -->
      <div id="player-controls">

        <!-- Tape-deck transport buttons -->
        <div id="transport">
          <button class="tp-btn" id="btn-prev"  title="Previous (P)">⏮</button>
          <button class="tp-btn" id="btn-play"  title="Play/Pause (Space)">▶</button>
          <button class="tp-btn" id="btn-stop"  title="Stop">■</button>
          <button class="tp-btn" id="btn-next"  title="Next (N)">⏭</button>
        </div>

        <!-- Volume -->
        <div id="vol-group">
          <span class="sl-label">VOL</span>
          <input type="range" id="vol-slider" min="0" max="100" value="85" title="Volume (↑↓)" />
        </div>

        <!-- Balance -->
        <div id="bal-group">
          <span class="sl-label">BAL</span>
          <input type="range" id="bal-slider" min="-50" max="50" value="0" title="Balance" />
        </div>

        <!-- Utility / mode buttons (right cluster) -->
        <div id="mode-btns">
          <button class="mode-btn" id="shuffle-btn"         title="Shuffle">SHF</button>
          <button class="mode-btn" id="repeat-btn"          title="Repeat">REP</button>
          <div class="mode-sep"></div>
          <button class="mode-btn active" id="normalize-toggle-btn" title="Loudness Normalization">NORM</button>
          <button class="mode-btn" id="eq-toggle-btn"       title="Equalizer (EQ)">EQ</button>
          <button class="mode-btn" id="dj-toggle-btn"       title="DJ Console" style="color:#FF90C0">DJ</button>
          <div class="mode-sep"></div>
          <button class="mode-btn" id="expand-toggle-btn"   title="Expand / collapse player">▲</button>
        </div>

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
  setupDJ(player);
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
  player.querySelector('#btn-stop')?.addEventListener('click', () => {
    engine.pause();
    engine.seek(0);
  });

  // Shuffle
  let _shuffle = false;
  player.querySelector('#shuffle-btn')?.addEventListener('click', () => {
    _shuffle = !_shuffle;
    player.querySelector('#shuffle-btn').classList.toggle('active', _shuffle);
    store.set('shuffle', _shuffle);
  });

  // Repeat
  let _repeat = false;
  player.querySelector('#repeat-btn')?.addEventListener('click', () => {
    _repeat = !_repeat;
    player.querySelector('#repeat-btn').classList.toggle('active', _repeat);
    store.set('repeat', _repeat);
  });

  // Balance slider (stereo pan via Web Audio StereoPannerNode if available)
  const balSlider = player.querySelector('#bal-slider');
  balSlider?.addEventListener('input', () => {
    const v = parseFloat(balSlider.value) / 50; // -1…+1
    if (engine.ctx && engine.masterGain) {
      // Simple L/R balance via gain if no dedicated panner
      if (!engine._balPanner) {
        engine._balPanner = engine.ctx.createStereoPanner();
        engine.masterGain.disconnect();
        engine.masterGain.connect(engine._balPanner);
        engine._balPanner.connect(engine.ctx.destination);
      }
      engine._balPanner.pan.setTargetAtTime(v, engine.ctx.currentTime, 0.02);
    }
  });
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
  // ─ Winamp LCD title (with marquee scroll for long titles) ─
  const titleEl   = document.querySelector('#player-title');
  const marqueeEl = document.querySelector('#title-marquee');
  const titleStr  = (track.title || 'UNTITLED').toUpperCase();
  if (titleEl) {
    titleEl.textContent = titleStr;
    // Trigger marquee only when text overflows the container
    if (marqueeEl) {
      marqueeEl.classList.remove('scrolling');
      requestAnimationFrame(() => {
        const wrap = marqueeEl.parentElement;
        if (wrap && titleEl.scrollWidth > wrap.clientWidth) {
          const overflow = titleEl.scrollWidth - wrap.clientWidth;
          const pct = Math.min(60, Math.round((overflow / wrap.clientWidth) * 100));
          marqueeEl.style.setProperty('--marquee-offset', `-${pct}%`);
          marqueeEl.classList.add('scrolling');
        }
      });
    }
  }

  // ─ Spec badges: kbps · kHz · ST ─
  const kbpsEl   = document.querySelector('#player-kbps');
  const khzEl    = document.querySelector('#player-khz');
  const stereoEl = document.querySelector('#player-stereo');
  if (kbpsEl)   kbpsEl.textContent   = track.bitrate ? Math.round(track.bitrate / 1000) : '---';
  if (khzEl)    khzEl.textContent    = track.sample_rate ? (track.sample_rate / 1000).toFixed(1) : '--.-';
  if (stereoEl) stereoEl.textContent = track.channels === 1 ? 'MO' : 'ST';

  // ─ Format / LUFS badges (shown next to duration) ─
  const badges = document.querySelector('#player-badges');
  if (badges) {
    const parts = [];
    if (track.original_format) parts.push(`<span class="badge">${track.original_format}</span>`);
    if (track.bit_depth) parts.push(`<span class="badge">${track.bit_depth}b</span>`);
    if (typeof track.lufs_integrated === 'number') parts.push(`<span class="badge" title="Loudness">${track.lufs_integrated.toFixed(1)}LU</span>`);
    badges.innerHTML = parts.join('');
  }

  // ─ Playing LED on ─
  document.querySelector('#playing-led')?.classList.add('on');

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
  const peaks    = store.get('waveformPeaks') || [];
  const dur      = store.get('duration') || 0;
  const progress = dur > 0 ? store.get('currentTime') / dur : 0;

  const dpr = window.devicePixelRatio || 1;
  const W   = waveformCanvas.offsetWidth  || 400;
  const H   = waveformCanvas.offsetHeight || 44;

  if (waveformCanvas.width  !== Math.round(W * dpr) ||
      waveformCanvas.height !== Math.round(H * dpr)) {
    waveformCanvas.width  = Math.round(W * dpr);
    waveformCanvas.height = Math.round(H * dpr);
    waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  waveformCtx.fillStyle = '#001828';
  waveformCtx.fillRect(0, 0, W, H);

  const cy = H / 2;

  if (peaks.length === 0) {
    const n = 120;
    for (let i = 0; i < n; i++) {
      const x    = (i / n) * W;
      const barW = Math.max(1, W / n - 0.8);
      const barH = 2 + Math.abs(Math.sin(i * 0.5)) * 3;
      waveformCtx.fillStyle = 'rgba(0,100,120,0.35)';
      waveformCtx.fillRect(x, cy - barH / 2, barW, barH);
    }
    // Center axis
    waveformCtx.fillStyle = 'rgba(0,160,160,0.15)';
    waveformCtx.fillRect(0, cy - 0.5, W, 1);
    return;
  }

  const n         = peaks.length;
  const barW      = Math.max(1.5, W / n - 0.5);
  const progressX = progress * W;

  for (let i = 0; i < n; i++) {
    const x     = (i / n) * W;
    const barH  = Math.max(2, peaks[i] * H * 0.88);
    const played = x < progressX;

    // SoundCloud-style: bars grow symmetrically from center
    waveformCtx.fillStyle = played
      ? '#00DCDC'                     // played: bright teal
      : 'rgba(0,120,150,0.45)';       // unplayed: dim

    waveformCtx.fillRect(x, cy - barH / 2, barW, barH);
  }

  // Playhead — sharp bright line
  if (progress > 0.001 && progress < 0.999) {
    waveformCtx.fillStyle = 'rgba(255,255,255,0.9)';
    waveformCtx.fillRect(Math.round(progressX) - 1, 0, 2, H);
  }

  // Center axis reference
  waveformCtx.fillStyle = 'rgba(0,180,180,0.1)';
  waveformCtx.fillRect(0, cy - 0.5, W, 1);
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
  const playBtn    = player.querySelector('#btn-play');
  const timeCur    = player.querySelector('#time-current');
  const timeDur    = player.querySelector('#time-duration');
  const expandBtn  = player.querySelector('#expand-toggle-btn');

  expandBtn?.addEventListener('click', () => {
    const app = document.getElementById('app');
    const expanded = app?.classList.toggle('player-expanded');
    expandBtn.textContent = expanded ? '▼' : '▲';
    expandBtn.classList.toggle('active', !!expanded);
    // close sub-panels when collapsing
    if (!expanded) {
      player.querySelector('#eq-panel')?.classList.remove('open');
      player.querySelector('#dj-panel')?.classList.remove('open');
    }
  });

  engine.on('playstate', (playing) => {
    playBtn.textContent = playing ? '⏸' : '▶';
    playBtn.classList.toggle('paused', !playing);
    document.querySelector('#playing-led')?.classList.toggle('on', playing);
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
    else {
      store.set('isPlaying', false);
      playBtn.textContent = '▶';
      document.querySelector('#playing-led')?.classList.remove('on');
    }
  });

  engine.on('buffering', (isBuffering) => {
    store.set('isBuffering', isBuffering);
    if (isBuffering) playBtn.textContent = '…';
    else if (!engine.isPlaying) playBtn.textContent = '▶';
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

// ─── DJ Console ────────────────────────────────────────────────────────────

function fmtSec(s) {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2,'0')}.${ms}`;
}

function setupDJ(player) {
  const djPanel  = player.querySelector('#dj-panel');
  const djToggle = player.querySelector('#dj-toggle-btn');
  const eqPanel  = player.querySelector('#eq-panel');
  const eqToggle = player.querySelector('#eq-toggle-btn');

  // DJ toggle — mutually exclusive with EQ panel
  djToggle.addEventListener('click', () => {
    const opening = !djPanel.classList.contains('open');
    djPanel.classList.toggle('open', opening);
    djToggle.classList.toggle('active', opening);
    if (opening) {
      djToggle.style.color = opening ? '#FF80B0' : '';
      eqPanel.classList.remove('open');
      eqToggle.classList.remove('active');
      store.set('showEq', false);
    } else {
      djToggle.style.color = '';
    }
  });

  // ── Stem presets ────────────────────────────────────────────────────────
  player.querySelectorAll('[data-stem]').forEach(btn => {
    btn.addEventListener('click', () => {
      engine.applyStemPreset(btn.dataset.stem);
      // Sync kill button visual state after stem changes kills
      updateKillButtons(player);
      showToast(`Stem: ${btn.dataset.stem.toUpperCase()}`, 'success');
    });
  });

  // ── Filter sliders ───────────────────────────────────────────────────────
  const hpSlider  = player.querySelector('#dj-hp');
  const hpVal     = player.querySelector('#dj-hp-val');
  const lpSlider  = player.querySelector('#dj-lp');
  const lpVal     = player.querySelector('#dj-lp-val');
  const revSlider = player.querySelector('#dj-rev');
  const revVal    = player.querySelector('#dj-rev-val');
  const dlySlider = player.querySelector('#dj-dly');
  const dlyVal    = player.querySelector('#dj-dly-val');

  hpSlider.addEventListener('input', () => {
    const hz = parseInt(hpSlider.value);
    engine.setHPFreq(hz);
    hpVal.textContent = hz < 1000 ? `${hz}Hz` : `${(hz/1000).toFixed(1)}k`;
  });
  lpSlider.addEventListener('input', () => {
    const hz = parseInt(lpSlider.value);
    engine.setLPFreq(hz);
    lpVal.textContent = hz >= 10000 ? `${(hz/1000).toFixed(0)}k` : `${(hz/1000).toFixed(1)}k`;
  });
  revSlider.addEventListener('input', () => {
    engine.setReverbLevel(parseInt(revSlider.value) / 100);
    revVal.textContent = `${revSlider.value}%`;
  });
  dlySlider.addEventListener('input', () => {
    engine.setDelayLevel(parseInt(dlySlider.value) / 100);
    dlyVal.textContent = `${dlySlider.value}%`;
  });

  // ── EQ Kill buttons ───────────────────────────────────────────────────────
  player.querySelector('#dj-kill-bass').addEventListener('click', () => {
    engine.killBand('bass', !engine.isKilled('bass'));
    updateKillButtons(player);
  });
  player.querySelector('#dj-kill-mid').addEventListener('click', () => {
    engine.killBand('mid', !engine.isKilled('mid'));
    updateKillButtons(player);
  });
  player.querySelector('#dj-kill-high').addEventListener('click', () => {
    engine.killBand('high', !engine.isKilled('high'));
    updateKillButtons(player);
  });

  // Sync kill buttons when state changes externally (e.g., stem presets)
  engine.on('killchanged', () => updateKillButtons(player));

  // ── Loop controls ──────────────────────────────────────────────────────────
  const loopDisplay = player.querySelector('#dj-loop-display');
  const loopToggle  = player.querySelector('#dj-loop-toggle');

  player.querySelector('#dj-loop-in').addEventListener('click', () => {
    engine.setLoopIn();
    updateLoopDisplay(player);
  });
  player.querySelector('#dj-loop-out').addEventListener('click', () => {
    engine.setLoopOut();
    updateLoopDisplay(player);
  });
  loopToggle.addEventListener('click', () => {
    engine.toggleLoop();
    loopToggle.classList.toggle('active', engine.loopState.active);
    updateLoopDisplay(player);
  });

  engine.on('loopchanged', () => {
    loopToggle.classList.toggle('active', engine.loopState.active);
    updateLoopDisplay(player);
  });

  // ── Hot Cue pads ──────────────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const pad = player.querySelector(`#dj-cue-${i}`);
    pad.addEventListener('click', () => {
      engine.jumpToHotCue(i);
      updateCuePads(player);
    });
    pad.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      engine.clearHotCue(i);
      updateCuePads(player);
    });
  }

  engine.on('hotcuechanged', () => updateCuePads(player));
  updateCuePads(player);
}

function updateKillButtons(player) {
  player.querySelector('#dj-kill-bass')?.classList.toggle('killed', engine.isKilled('bass'));
  player.querySelector('#dj-kill-mid')?.classList.toggle('killed', engine.isKilled('mid'));
  player.querySelector('#dj-kill-high')?.classList.toggle('killed', engine.isKilled('high'));
}

function updateLoopDisplay(player) {
  const el = player.querySelector('#dj-loop-display');
  if (!el) return;
  const { active, start, end } = engine.loopState;
  if (end <= start) { el.textContent = '— SET IN + OUT —'; return; }
  el.textContent = `${fmtSec(start)} → ${fmtSec(end)}${active ? ' ↻' : ''}`;
}

function updateCuePads(player) {
  const cues = engine.getHotCues();
  cues.forEach((time, i) => {
    const pad  = player.querySelector(`#dj-cue-${i}`);
    if (!pad) return;
    const timeEl = pad.querySelector('.cue-time');
    if (time !== null) {
      pad.classList.add('set');
      if (timeEl) timeEl.textContent = fmtSec(time);
    } else {
      pad.classList.remove('set');
      if (timeEl) timeEl.textContent = '—';
    }
  });
}
