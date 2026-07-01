import { store } from './stores/app.js';
import { engine } from './audio/engine.js';
import { togglePlay, nextTrack, prevTrack } from './components/Player.js';

const SEEK_STEP = 5;
const VOLUME_STEP = 0.05;

function isTypingTarget(el) {
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

let preMuteVolume = 0.85;

function toggleMute() {
  const current = store.get('volume');
  if (current > 0) {
    preMuteVolume = current;
    store.set('volume', 0);
  } else {
    store.set('volume', preMuteVolume || 0.85);
  }
}

export function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!Object.prototype.hasOwnProperty.call(HANDLERS, e.key)) return;
    e.preventDefault();
    HANDLERS[e.key]();
  });
}

const HANDLERS = {
  ' ': togglePlay,
  ArrowRight: () => { if (store.get('currentTrack')) engine.seek(Math.min(engine.duration, engine.currentTime + SEEK_STEP)); },
  ArrowLeft: () => { if (store.get('currentTrack')) engine.seek(Math.max(0, engine.currentTime - SEEK_STEP)); },
  ArrowUp: () => store.set('volume', Math.min(1, store.get('volume') + VOLUME_STEP)),
  ArrowDown: () => store.set('volume', Math.max(0, store.get('volume') - VOLUME_STEP)),
  m: toggleMute,
  M: toggleMute,
  n: nextTrack,
  N: nextTrack,
  p: prevTrack,
  P: prevTrack,
};
