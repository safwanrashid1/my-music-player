/**
 * Wavform Audio Engine — with DJ console extensions
 *
 * Full signal chain:
 *   source → preGain → [10-band EQ] → hpFilter → lpFilter
 *     ├─ dry → limiter → masterGain → destination (DAC)
 *     ├─ reverbSend → convolver → reverbWet → limiter
 *     └─ delaySend → delayNode ↻ delayFeedback → delayWet → limiter
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

// Which EQ band indices each "kill" zone controls
const KILL_ZONES = { bass: [0,1,2], mid: [3,4,5], high: [6,7,8,9] };

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.audioEl = null;
    this.preGain = null;
    this.eqFilters = [];
    this.hpFilter = null;
    this.lpFilter = null;
    this.reverbSend = null;
    this.convolver = null;
    this.reverbWet = null;
    this.delaySend = null;
    this.delayNode = null;
    this.delayFeedback = null;
    this.delayWet = null;
    this.limiter = null;
    this.masterGain = null;

    this.bands = DEFAULT_BANDS.map(b => ({ ...b }));
    this.outputDeviceId = 'default';
    this.listeners = {};

    this._trackId = null;
    this._isPlaying = false;
    this._volume = 0.85;
    this._eqEnabled = true;
    this._normalizeEnabled = true;
    this._trackLufs = null;
    this._kills = {};          // which bands are currently killed
    this._killStash = {};      // saved gains before kill
    this._hotCues = [null, null, null, null];
    this._loopActive = false;
    this._loopStart = 0;
    this._loopEnd = 0;
    this._hpFreq = 20;
    this._lpFreq = 20000;
    this._reverbLevel = 0;
    this._delayLevel = 0;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async init() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    this.audioEl = new Audio();
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.preload = 'metadata';
    this._bindAudioEvents();
    this._buildChain();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  _buildChain() {
    const ctx = this.ctx;

    this.source = ctx.createMediaElementSource(this.audioEl);

    this.preGain = ctx.createGain();
    this.preGain.gain.value = 1.0;

    // 10-band parametric EQ
    this.eqFilters = this.bands.map(b => {
      const f = ctx.createBiquadFilter();
      f.type = b.type; f.frequency.value = b.freq;
      f.gain.value = b.gain; f.Q.value = b.q;
      return f;
    });

    // ─── DJ filters (after EQ) ───────────────────────────────────────────────
    this.hpFilter = ctx.createBiquadFilter();
    this.hpFilter.type = 'highpass';
    this.hpFilter.frequency.value = 20;   // effectively off
    this.hpFilter.Q.value = 0.7;

    this.lpFilter = ctx.createBiquadFilter();
    this.lpFilter.type = 'lowpass';
    this.lpFilter.frequency.value = 20000; // effectively off
    this.lpFilter.Q.value = 0.7;

    // ─── Reverb (synthetic impulse response — no sample file needed) ──────────
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0;
    this.convolver  = ctx.createConvolver();
    this.convolver.buffer = this._makeReverbIR(1.8, 3.0);
    this.reverbWet  = ctx.createGain(); this.reverbWet.gain.value = 0.6;

    // ─── Delay with feedback ──────────────────────────────────────────────────
    this.delaySend    = ctx.createGain(); this.delaySend.gain.value = 0;
    this.delayNode    = ctx.createDelay(2.0);
    this.delayNode.delayTime.value = 0.375; // ≈ 1/8th @ 120 BPM
    this.delayFeedback = ctx.createGain(); this.delayFeedback.gain.value = 0.4;
    this.delayWet     = ctx.createGain(); this.delayWet.gain.value = 0.7;

    // Safety limiter
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -0.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this._volume;

    // Wire main (dry) path
    let node = this.source;
    node.connect(this.preGain); node = this.preGain;
    for (const f of this.eqFilters) { node.connect(f); node = f; }
    node.connect(this.hpFilter);
    this.hpFilter.connect(this.lpFilter);
    this.lpFilter.connect(this.limiter);          // dry → limiter

    // Reverb send branch
    this.lpFilter.connect(this.reverbSend);
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.reverbWet);
    this.reverbWet.connect(this.limiter);

    // Delay send branch (with feedback loop)
    this.lpFilter.connect(this.delaySend);
    this.delaySend.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);   // feedback
    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(this.limiter);

    this.limiter.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
  }

  // Generates a stereo reverb impulse response without loading any sample file.
  _makeReverbIR(durationSec = 1.8, decay = 3.0) {
    const sr  = this.ctx.sampleRate;
    const len = Math.floor(sr * durationSec);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _bindAudioEvents() {
    const el = this.audioEl;
    el.addEventListener('timeupdate', () => {
      this._checkLoop();
      this._emit('timeupdate', { currentTime: el.currentTime, duration: el.duration || 0 });
    });
    el.addEventListener('loadedmetadata', () => this._emit('loadedmetadata', { duration: el.duration }));
    el.addEventListener('ended',  () => { this._isPlaying = false; this._emit('ended'); });
    el.addEventListener('error',  () => this._emit('error', { message: el.error?.message || 'Playback error' }));
    el.addEventListener('waiting',() => this._emit('buffering', true));
    el.addEventListener('canplay',() => this._emit('buffering', false));
    el.addEventListener('play',   () => { this._isPlaying = true;  this._emit('playstate', true);  });
    el.addEventListener('pause',  () => { this._isPlaying = false; this._emit('playstate', false); });
  }

  // ─── Playback ─────────────────────────────────────────────────────────────

  async loadTrack(trackId, streamUrl, { lufsIntegrated = null } = {}) {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.stopLoop();
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

  pause() { this.audioEl.pause(); }
  toggle() { this._isPlaying ? this.pause() : this.play(); }

  seek(seconds) { if (this.audioEl) this.audioEl.currentTime = seconds; }
  seekPercent(pct) {
    if (this.audioEl?.duration) this.audioEl.currentTime = (pct / 100) * this.audioEl.duration;
  }

  // ─── Volume & Output ──────────────────────────────────────────────────────

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.01);
  }

  async setOutputDevice(deviceId) {
    this.outputDeviceId = deviceId;
    if (this.audioEl?.setSinkId) {
      try { await this.audioEl.setSinkId(deviceId); this._emit('devicechanged', { deviceId }); }
      catch (e) { console.warn('setSinkId failed:', e.message); }
    }
  }

  async getOutputDevices() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'audiooutput');
    } catch { return []; }
  }

  // ─── Parametric EQ ────────────────────────────────────────────────────────

  setEqEnabled(enabled) {
    this._eqEnabled = enabled;
    const t = this.ctx?.currentTime || 0;
    this.eqFilters.forEach((f, i) => {
      f.gain.setTargetAtTime(enabled ? this.bands[i].gain : 0, t, 0.02);
    });
  }

  setEqBand(index, gain) {
    this.bands[index].gain = gain;
    if (this.eqFilters[index] && this._eqEnabled && !this._isKillIndex(index)) {
      this.eqFilters[index].gain.setTargetAtTime(gain, this.ctx?.currentTime || 0, 0.02);
    }
  }

  _isKillIndex(index) {
    return Object.entries(KILL_ZONES).some(([k, v]) => this._kills[k] && v.includes(index));
  }

  setEqBandQ(index, q) {
    this.bands[index].q = q;
    if (this.eqFilters[index]) this.eqFilters[index].Q.setTargetAtTime(q, this.ctx?.currentTime || 0, 0.02);
  }

  setEqBandFreq(index, freq) {
    this.bands[index].freq = freq;
    if (this.eqFilters[index]) this.eqFilters[index].frequency.setTargetAtTime(freq, this.ctx?.currentTime || 0, 0.02);
  }

  applyEqPreset(bands) {
    bands.forEach((b, i) => {
      if (i >= this.eqFilters.length) return;
      this.bands[i] = { ...b };
      const f = this.eqFilters[i]; if (!f) return;
      const t = this.ctx?.currentTime || 0;
      const targetGain = (this._eqEnabled && !this._isKillIndex(i)) ? b.gain : (this._isKillIndex(i) ? -40 : 0);
      f.gain.setTargetAtTime(targetGain, t, 0.02);
      f.frequency.setTargetAtTime(b.freq, t, 0.02);
      f.Q.setTargetAtTime(b.q, t, 0.02);
    });
    this._emit('eqchanged', { bands: this.bands });
  }

  resetEq() { this.applyEqPreset(DEFAULT_BANDS.map(b => ({ ...b }))); }
  getCurrentBands() { return this.bands.map(b => ({ ...b })); }

  getFrequencyResponse(numPoints = 512) {
    if (!this.eqFilters.length) return null;
    const freqs = new Float32Array(numPoints);
    const logMin = Math.log10(20), logMax = Math.log10(20000);
    for (let i = 0; i < numPoints; i++)
      freqs[i] = Math.pow(10, logMin + (i / (numPoints - 1)) * (logMax - logMin));
    const mag = new Float32Array(numPoints).fill(1);
    const tmpM = new Float32Array(numPoints), tmpP = new Float32Array(numPoints);
    for (const f of this.eqFilters) {
      f.getFrequencyResponse(freqs, tmpM, tmpP);
      for (let i = 0; i < numPoints; i++) mag[i] *= tmpM[i];
    }
    const db = new Float32Array(numPoints);
    for (let i = 0; i < numPoints; i++) db[i] = 20 * Math.log10(Math.max(1e-6, mag[i]));
    return { freqs, db };
  }

  // ─── Loudness Normalization ────────────────────────────────────────────────

  static TARGET_LUFS = -14;
  static MAX_NORMALIZATION_DB = 12;

  setNormalization(enabled) { this._normalizeEnabled = enabled; this._applyNormalizationGain(); }

  setTrackLoudness(lufs) {
    this._trackLufs = typeof lufs === 'number' ? lufs : null;
    this._applyNormalizationGain();
  }

  _applyNormalizationGain() {
    if (!this.preGain) return;
    let db = 0;
    if (this._normalizeEnabled && this._trackLufs != null) {
      const max = AudioEngine.MAX_NORMALIZATION_DB;
      db = Math.max(-max, Math.min(max, AudioEngine.TARGET_LUFS - this._trackLufs));
    }
    this.preGain.gain.setTargetAtTime(Math.pow(10, db / 20), this.ctx?.currentTime || 0, 0.05);
  }

  // ─── DJ Console ───────────────────────────────────────────────────────────

  // HP filter — sweeps bass out as frequency rises (classic DJ "HP" knob).
  // Range: 20 Hz (off) → 2000 Hz (full bass cut)
  setHPFreq(hz) {
    this._hpFreq = hz;
    if (this.hpFilter)
      this.hpFilter.frequency.setTargetAtTime(Math.max(20, hz), this.ctx.currentTime, 0.02);
  }

  // LP filter — sweeps highs out as frequency falls (classic DJ "LP" knob).
  // Range: 200 Hz (full high cut) → 20 000 Hz (off)
  setLPFreq(hz) {
    this._lpFreq = hz;
    if (this.lpFilter)
      this.lpFilter.frequency.setTargetAtTime(Math.min(20000, hz), this.ctx.currentTime, 0.02);
  }

  // Reverb wet level (0 = dry, 1 = full reverb)
  setReverbLevel(level) {
    this._reverbLevel = level;
    if (this.reverbSend) this.reverbSend.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
  }

  // Delay wet level (0 = off, 1 = full)
  setDelayLevel(level) {
    this._delayLevel = level;
    if (this.delaySend) this.delaySend.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
  }

  setDelayTime(sec) {
    if (this.delayNode) this.delayNode.delayTime.setTargetAtTime(sec, this.ctx.currentTime, 0.02);
  }

  setDelayFeedback(fb) {
    if (this.delayFeedback) this.delayFeedback.gain.setTargetAtTime(fb, this.ctx.currentTime, 0.02);
  }

  // EQ Kill — slams a band to silence instantly (bass/mid/high zones)
  killBand(zone, on) {
    const indices = KILL_ZONES[zone]; if (!indices) return;
    const t = this.ctx?.currentTime || 0;
    if (on) {
      this._kills[zone] = true;
      this._killStash[zone] = indices.map(i => this.bands[i].gain);
      indices.forEach(i => { if (this.eqFilters[i]) this.eqFilters[i].gain.setTargetAtTime(-40, t, 0.01); });
    } else {
      this._kills[zone] = false;
      const saved = this._killStash[zone] || indices.map(() => 0);
      indices.forEach((i, j) => { if (this.eqFilters[i]) this.eqFilters[i].gain.setTargetAtTime(saved[j], t, 0.02); });
    }
    this._emit('killchanged', { zone, on });
  }

  isKilled(zone) { return !!this._kills[zone]; }

  // Stem isolation presets — use EQ + filters to approximate frequency stems.
  // Not true ML-based separation, but the classic DJ EQ technique for mixing.
  applyStemPreset(preset) {
    const t = this.ctx?.currentTime || 0;
    // Always clear kills first
    Object.keys(KILL_ZONES).forEach(z => { if (this._kills[z]) this.killBand(z, false); });
    switch (preset) {
      case 'bass':  // Hear mostly bass/kick
        this.setHPFreq(20); this.setLPFreq(300);
        this.killBand('mid', true); this.killBand('high', true);
        break;
      case 'vocal': // Midrange focus
        this.setHPFreq(250); this.setLPFreq(5000);
        break;
      case 'tops':  // Highs only (hats, air, cymbals)
        this.setHPFreq(2500); this.setLPFreq(20000);
        this.killBand('bass', true); this.killBand('mid', true);
        break;
      case 'full':  // Reset everything
        this.setHPFreq(20); this.setLPFreq(20000);
        this.setReverbLevel(0); this.setDelayLevel(0);
        this.resetEq();
        break;
    }
    this._emit('stemchanged', { preset });
  }

  // ─── Loop ──────────────────────────────────────────────────────────────────

  setLoopIn()  { this._loopStart = this.audioEl?.currentTime || 0; this._emit('loopchanged', this._loopState()); }
  setLoopOut() { this._loopEnd   = this.audioEl?.currentTime || 0; this._emit('loopchanged', this._loopState()); }

  toggleLoop() {
    if (this._loopEnd <= this._loopStart) return; // need valid range
    this._loopActive = !this._loopActive;
    if (this._loopActive && this.audioEl) this.audioEl.currentTime = this._loopStart;
    this._emit('loopchanged', this._loopState());
  }

  stopLoop() { this._loopActive = false; this._emit('loopchanged', this._loopState()); }

  _loopState() { return { active: this._loopActive, start: this._loopStart, end: this._loopEnd }; }

  _checkLoop() {
    if (!this._loopActive || !this.audioEl) return;
    if (this._loopEnd > this._loopStart && this.audioEl.currentTime >= this._loopEnd) {
      this.audioEl.currentTime = this._loopStart;
    }
  }

  get loopState() { return this._loopState(); }

  // ─── Hot Cues ─────────────────────────────────────────────────────────────

  setHotCue(index) {
    this._hotCues[index] = this.currentTime;
    this._emit('hotcuechanged', { index, time: this._hotCues[index] });
  }

  jumpToHotCue(index) {
    if (this._hotCues[index] === null) { this.setHotCue(index); return; }
    this.seek(this._hotCues[index]);
    if (!this._isPlaying) this.play();
  }

  clearHotCue(index) {
    this._hotCues[index] = null;
    this._emit('hotcuechanged', { index, time: null });
  }

  getHotCues() { return [...this._hotCues]; }

  // ─── State ────────────────────────────────────────────────────────────────

  get currentTime()       { return this.audioEl?.currentTime || 0; }
  get duration()          { return this.audioEl?.duration || 0; }
  get isPlaying()         { return this._isPlaying; }
  get volume()            { return this._volume; }
  get trackId()           { return this._trackId; }
  get eqEnabled()         { return this._eqEnabled; }
  get normalizeEnabled()  { return this._normalizeEnabled; }
  get hpFreq()            { return this._hpFreq; }
  get lpFreq()            { return this._lpFreq; }
  get reverbLevel()       { return this._reverbLevel; }
  get delayLevel()        { return this._delayLevel; }

  // ─── Events ───────────────────────────────────────────────────────────────

  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (this.listeners[event]) this.listeners[event] = this.listeners[event].filter(f => f !== fn);
  }

  _emit(event, data) { (this.listeners[event] || []).forEach(fn => fn(data)); }
}

export const engine = new AudioEngine();
export { DEFAULT_BANDS };
