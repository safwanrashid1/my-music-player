/**
 * Wavform Audio Engine
 * 
 * Architecture:
 *   AudioContext source → GainNode (pre-gain)
 *     → BiquadFilterNode x10 (EQ chain)
 *     → DynamicsCompressorNode (limiter, safety only)
 *     → GainNode (master volume)
 *     → AudioContext.destination (DAC output)
 */

const DEFAULT_BANDS = [
  { freq: 32,    type: 'lowshelf',  gain: 0, q: 0.7 },
  { freq: 64,    type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 125,   type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 250,   type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 500,   type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 1000,  type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 2000,  type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 4000,  type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 8000,  type: 'peaking',   gain: 0, q: 1.0 },
  { freq: 16000, type: 'highshelf', gain: 0, q: 0.7 },
];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.source = null;        // MediaElementSourceNode
    this.audioEl = null;       // <audio> element
    this.preGain = null;
    this.eqFilters = [];
    this.limiter = null;
    this.masterGain = null;
    this.bands = DEFAULT_BANDS.map(b => ({ ...b }));
    this.outputDeviceId = 'default';
    this.listeners = {};
    this._trackId = null;
    this._currentTime = 0;
    this._duration = 0;
    this._isPlaying = false;
    this._volume = 0.85;
    this._animFrame = null;
    this._eqEnabled = true;
    this._normalizeEnabled = true;
    this._trackLufs = null;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async init() {
    if (this.ctx) return;

    this.ctx = new AudioContext({ latencyHint: 'playback' });

    // Persistent <audio> element — enables range requests + browser buffering
    this.audioEl = new Audio();
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.preload = 'metadata';

    this._bindAudioEvents();
    this._buildChain();

    // Resume context on first user gesture (browsers require it)
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  _buildChain() {
    const ctx = this.ctx;

    this.source = ctx.createMediaElementSource(this.audioEl);

    // Pre-gain (unity by default)
    this.preGain = ctx.createGain();
    this.preGain.gain.value = 1.0;

    // 10-band EQ
    this.eqFilters = this.bands.map(b => {
      const f = ctx.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.freq;
      f.gain.value = b.gain;
      f.Q.value = b.q;
      return f;
    });

    // Safety limiter (not a creative compressor — threshold at -0.5dB)
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -0.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;

    // Master gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this._volume;

    // Wire: source → preGain → [eq chain] → limiter → masterGain → destination
    let node = this.source;
    node.connect(this.preGain);
    node = this.preGain;
    for (const filter of this.eqFilters) {
      node.connect(filter);
      node = filter;
    }
    node.connect(this.limiter);
    this.limiter.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
  }

  _bindAudioEvents() {
    const el = this.audioEl;
    el.addEventListener('timeupdate', () => {
      this._currentTime = el.currentTime;
      this._emit('timeupdate', { currentTime: el.currentTime, duration: el.duration || 0 });
    });
    el.addEventListener('loadedmetadata', () => {
      this._duration = el.duration;
      this._emit('loadedmetadata', { duration: el.duration });
    });
    el.addEventListener('ended', () => {
      this._isPlaying = false;
      this._emit('ended');
    });
    el.addEventListener('error', (e) => {
      this._emit('error', { message: el.error?.message || 'Playback error' });
    });
    el.addEventListener('waiting', () => this._emit('buffering', true));
    el.addEventListener('canplay', () => this._emit('buffering', false));
    el.addEventListener('play',  () => { this._isPlaying = true;  this._emit('playstate', true);  });
    el.addEventListener('pause', () => { this._isPlaying = false; this._emit('playstate', false); });
  }

  // ─── Playback ─────────────────────────────────────────────────────────────

  async loadTrack(trackId, streamUrl, { lufsIntegrated = null } = {}) {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this._trackId = trackId;
    this.audioEl.src = streamUrl;
    this.audioEl.load();
    this.setTrackLoudness(lufsIntegrated);
    this._emit('trackloaded', { trackId });
  }

  async play() {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    await this.audioEl.play();
  }

  pause() {
    this.audioEl.pause();
  }

  toggle() {
    this._isPlaying ? this.pause() : this.play();
  }

  seek(seconds) {
    if (this.audioEl) this.audioEl.currentTime = seconds;
  }

  seekPercent(pct) {
    if (this.audioEl && this.audioEl.duration) {
      this.audioEl.currentTime = (pct / 100) * this.audioEl.duration;
    }
  }

  // ─── Volume & Output ──────────────────────────────────────────────────────

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.01);
  }

  async setOutputDevice(deviceId) {
    this.outputDeviceId = deviceId;
    if (this.audioEl?.setSinkId) {
      try {
        await this.audioEl.setSinkId(deviceId);
        this._emit('devicechanged', { deviceId });
      } catch (e) {
        console.warn('setSinkId failed:', e.message);
      }
    }
  }

  async getOutputDevices() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audiooutput');
    } catch {
      return [];
    }
  }

  // ─── EQ ───────────────────────────────────────────────────────────────────

  // Bypasses the filter chain by ramping every band to 0dB gain — a parametric
  // EQ at 0dB is unity magnitude response, so this is a true flat bypass,
  // not just a UI state (the previous toggle never touched the audio graph).
  setEqEnabled(enabled) {
    this._eqEnabled = enabled;
    const t = this.ctx?.currentTime || 0;
    this.eqFilters.forEach((f, i) => {
      f.gain.setTargetAtTime(enabled ? this.bands[i].gain : 0, t, 0.02);
    });
  }

  setEqBand(index, gain) {
    this.bands[index].gain = gain;
    if (this.eqFilters[index] && this._eqEnabled) {
      this.eqFilters[index].gain.setTargetAtTime(gain, this.ctx?.currentTime || 0, 0.02);
    }
  }

  setEqBandQ(index, q) {
    this.bands[index].q = q;
    if (this.eqFilters[index]) {
      this.eqFilters[index].Q.setTargetAtTime(q, this.ctx?.currentTime || 0, 0.02);
    }
  }

  setEqBandFreq(index, freq) {
    this.bands[index].freq = freq;
    if (this.eqFilters[index]) {
      this.eqFilters[index].frequency.setTargetAtTime(freq, this.ctx?.currentTime || 0, 0.02);
    }
  }

  applyEqPreset(bands) {
    bands.forEach((b, i) => {
      if (i >= this.eqFilters.length) return;
      this.bands[i] = { ...b };
      const f = this.eqFilters[i];
      if (!f) return;
      const t = this.ctx?.currentTime || 0;
      f.gain.setTargetAtTime(this._eqEnabled ? b.gain : 0, t, 0.02);
      f.frequency.setTargetAtTime(b.freq, t, 0.02);
      f.Q.setTargetAtTime(b.q, t, 0.02);
    });
    this._emit('eqchanged', { bands: this.bands });
  }

  resetEq() {
    this.applyEqPreset(DEFAULT_BANDS.map(b => ({ ...b })));
  }

  // ─── Loudness Normalization ────────────────────────────────────────────────
  // ReplayGain-style: trims pre-gain so tracks land near a common reference
  // loudness instead of varying with however they happened to be mastered.
  // Lives on preGain (pre-EQ/pre-limiter) so it's a pure level match, not a
  // tone change — disabling it returns playback to the file's native level.

  static TARGET_LUFS = -14;
  static MAX_NORMALIZATION_DB = 12;

  setNormalization(enabled) {
    this._normalizeEnabled = enabled;
    this._applyNormalizationGain();
  }

  setTrackLoudness(lufsIntegrated) {
    this._trackLufs = typeof lufsIntegrated === 'number' ? lufsIntegrated : null;
    this._applyNormalizationGain();
  }

  _applyNormalizationGain() {
    if (!this.preGain) return;
    let gainDb = 0;
    if (this._normalizeEnabled && this._trackLufs != null) {
      const max = AudioEngine.MAX_NORMALIZATION_DB;
      gainDb = Math.max(-max, Math.min(max, AudioEngine.TARGET_LUFS - this._trackLufs));
    }
    const linear = Math.pow(10, gainDb / 20);
    this.preGain.gain.setTargetAtTime(linear, this.ctx?.currentTime || 0, 0.05);
  }

  get eqEnabled() { return this._eqEnabled; }
  get normalizeEnabled() { return this._normalizeEnabled; }

  getCurrentBands() {
    return this.bands.map(b => ({ ...b }));
  }

  // ─── Frequency Response (for EQ curve display) ────────────────────────────

  getFrequencyResponse(numPoints = 512) {
    if (!this.eqFilters.length) return null;
    const freqs = new Float32Array(numPoints);
    const logMin = Math.log10(20), logMax = Math.log10(20000);
    for (let i = 0; i < numPoints; i++) {
      freqs[i] = Math.pow(10, logMin + (i / (numPoints - 1)) * (logMax - logMin));
    }

    const magResponse = new Float32Array(numPoints).fill(1);
    const tmpMag = new Float32Array(numPoints);
    const tmpPhase = new Float32Array(numPoints);

    for (const f of this.eqFilters) {
      f.getFrequencyResponse(freqs, tmpMag, tmpPhase);
      for (let i = 0; i < numPoints; i++) magResponse[i] *= tmpMag[i];
    }

    // Convert magnitude to dB
    const dbResponse = new Float32Array(numPoints);
    for (let i = 0; i < numPoints; i++) {
      dbResponse[i] = 20 * Math.log10(Math.max(1e-6, magResponse[i]));
    }

    return { freqs, db: dbResponse };
  }

  // ─── State ────────────────────────────────────────────────────────────────

  get currentTime() { return this.audioEl?.currentTime || 0; }
  get duration()    { return this.audioEl?.duration || 0; }
  get isPlaying()   { return this._isPlaying; }
  get volume()      { return this._volume; }
  get trackId()     { return this._trackId; }

  // ─── Events ───────────────────────────────────────────────────────────────

  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    }
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(fn => fn(data));
  }
}

// Singleton
export const engine = new AudioEngine();
export { DEFAULT_BANDS };
