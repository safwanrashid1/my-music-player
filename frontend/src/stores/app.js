/**
 * Minimal reactive store — framework-free.
 * Usage:
 *   import { store } from './stores/app.js';
 *   store.subscribe('page', (p) => renderPage(p));
 *   store.set('page', 'feed');
 */

function createStore(initial = {}) {
  let state = { ...initial };
  const listeners = {};

  return {
    get(key) { return state[key]; },
    getAll() { return { ...state }; },

    set(key, value) {
      state[key] = value;
      (listeners[key] || []).forEach(fn => fn(value));
      (listeners['*'] || []).forEach(fn => fn({ key, value }));
    },

    update(key, fn) {
      this.set(key, fn(state[key]));
    },

    subscribe(key, fn) {
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(fn);
      fn(state[key]); // emit current value immediately
      return () => {
        listeners[key] = listeners[key].filter(f => f !== fn);
      };
    },
  };
}

// Playback settings are personal-device preferences, not server state, so
// they round-trip through localStorage instead of resetting on every reload.
const SETTINGS_KEY = 'wf_settings';
const PERSISTED_KEYS = ['volume', 'eqEnabled', 'eqBands', 'activePreset', 'normalizeEnabled', 'activeDeviceId'];

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

const settings = loadSettings();

export const store = createStore({
  // Player
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: settings.volume ?? 0.85,
  isBuffering: false,

  // Queue
  queue: [],
  queueIndex: -1,

  // EQ
  eqBands: settings.eqBands ?? null,
  eqPresets: [],
  activePreset: settings.activePreset ?? 'flat',
  eqEnabled: settings.eqEnabled ?? true,
  showEq: false,

  // Loudness
  normalizeEnabled: settings.normalizeEnabled ?? true,

  // DAC
  outputDevices: [],
  activeDeviceId: settings.activeDeviceId ?? 'default',

  // UI
  page: 'feed',        // feed | upload | track
  sidebarOpen: false,  // mobile off-canvas sidebar
  pageData: {},
  tracks: [],
  isLoading: false,
  error: null,
  toast: null,
  uploadProgress: 0,
  isUploading: false,
});

PERSISTED_KEYS.forEach(key => {
  store.subscribe(key, (value) => {
    const current = loadSettings();
    current[key] = value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(current)); } catch {}
  });
});
