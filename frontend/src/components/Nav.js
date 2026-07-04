import { store } from '../stores/app.js';

// Theme is stored alongside other settings in localStorage
const SETTINGS_KEY = 'wf_settings';
function getTheme() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY))?.theme || 'default'; } catch { return 'default'; }
}
function setTheme(t) {
  document.body.setAttribute('data-theme', t === 'dark' ? 'dark' : '');
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    s.theme = t;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

// Apply saved theme on module load
setTheme(getTheme());

export function renderNav(container) {
  const nav = document.createElement('nav');
  nav.id = 'topnav';
  nav.innerHTML = `
    <style>
      #topnav {
        grid-area: nav;
        display: flex; flex-direction: column;
        background: var(--chrome);
        box-shadow: 0 0 0 1px var(--chrome-edge);
        z-index: 100;
        position: relative;
      }

      /* ── Row 1: Title bar ── */
      .nav-titlebar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 2px 6px;
        background: linear-gradient(90deg, var(--playlist-active) 0%, #001030 100%);
        flex-shrink: 0; height: 20px;
      }
      .nav-logo {
        font-family: var(--pixel); font-size: 13px; letter-spacing: 3px;
        color: #FFFFFF; cursor: pointer; text-transform: uppercase; user-select: none;
      }
      .nav-logo span { color: #00DCDC; }
      .nav-winctrls { display: flex; gap: 3px; }
      .winctrl {
        width: 9px; height: 9px;
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
        background: var(--chrome); cursor: pointer; font-size: 7px;
        display: flex; align-items: center; justify-content: center;
        color: var(--text3); font-family: var(--pixel);
      }
      .winctrl:active { box-shadow: inset 1px 1px 0 var(--chrome-lo), inset -1px -1px 0 var(--chrome-hi), 0 0 0 1px var(--chrome-edge); }
      .nav-menu-btn { display: none; font-size: 14px; padding: 2px 6px; color: #fff; background: transparent; border: none; }

      /* ── Row 2: Menu bar + search ── */
      .nav-menubar {
        display: flex; align-items: center;
        padding: 0 4px; flex-shrink: 0; height: 22px;
        border-top: 1px solid var(--chrome-lo);
      }
      .nav-menubar-left { display: flex; align-items: center; flex-shrink: 0; }
      .nav-menuitem {
        font-family: var(--pixel); font-size: 12px; letter-spacing: 0.5px;
        color: var(--text); padding: 2px 7px; cursor: pointer;
        text-transform: uppercase; height: 22px; display: flex; align-items: center;
        white-space: nowrap; position: relative;
      }
      .nav-menuitem:hover, .nav-menuitem.open { background: var(--playlist-active); color: #fff; }

      .nav-sep {
        width: 0; height: 14px; margin: 0 6px;
        border-left: 1px solid var(--chrome-lo);
        border-right: 1px solid var(--chrome-hi);
        flex-shrink: 0;
      }
      .nav-search { flex: 1; position: relative; min-width: 0; }
      .nav-search input { font-size: 13px; padding: 2px 8px 2px 22px; height: 18px; width: 100%; }
      .nav-search .search-icon {
        position: absolute; left: 6px; top: 50%; transform: translateY(-50%);
        color: var(--lcd-dim); font-size: 13px; pointer-events: none; font-family: var(--pixel);
      }
      .nav-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: 6px; }
      .nav-upload-btn { font-size: 12px; padding: 2px 8px; }

      /* ── Dropdown menus ── */
      .nav-dropdown {
        position: absolute; top: 22px; left: 0;
        background: var(--chrome);
        box-shadow:
          inset 1px 1px 0 var(--chrome-hi),
          inset -1px -1px 0 var(--chrome-lo),
          2px 2px 0 rgba(0,0,0,0.4),
          0 0 0 1px var(--chrome-edge);
        min-width: 180px; z-index: 200;
        display: none; flex-direction: column;
        padding: 2px 0;
      }
      .nav-dropdown.open { display: flex; }
      .dd-item {
        font-family: var(--pixel); font-size: 13px; letter-spacing: 0.5px;
        color: var(--text); padding: 4px 16px; cursor: pointer;
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        white-space: nowrap;
      }
      .dd-item:hover { background: var(--playlist-active); color: #fff; }
      .dd-item.checked::after { content: '✓'; font-size: 11px; }
      .dd-sep { height: 0; border-top: 1px solid var(--chrome-lo); border-bottom: 1px solid var(--chrome-hi); margin: 3px 8px; }
      .dd-submenu-arrow { opacity: 0.5; font-size: 10px; }
    </style>

    <!-- Row 1: Title bar -->
    <div class="nav-titlebar">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="nav-menu-btn" id="nav-menu-btn">☰</button>
        <div class="nav-logo" id="nav-logo">WAV<span>FORM</span></div>
      </div>
      <div class="nav-winctrls">
        <div class="winctrl" title="Shade">▲</div>
        <div class="winctrl" title="Min">▼</div>
        <div class="winctrl" title="Close">✕</div>
      </div>
    </div>

    <!-- Row 2: Menu bar + search -->
    <div class="nav-menubar">
      <div class="nav-menubar-left">
        <div class="nav-menuitem" id="nm-file" tabindex="0">File
          <div class="nav-dropdown" id="dd-file">
            <div class="dd-item" data-action="upload">Open File…</div>
            <div class="dd-item" data-action="songs">Browse Library</div>
            <div class="dd-sep"></div>
            <div class="dd-item" data-action="playlists">Manage Playlists</div>
            <div class="dd-item" data-action="albums">Manage Albums</div>
          </div>
        </div>
        <div class="nav-menuitem" id="nm-options" tabindex="0">Options
          <div class="nav-dropdown" id="dd-options">
            <div class="dd-sep" style="margin-top:4px"></div>
            <div class="dd-item" style="opacity:0.5;font-size:11px;padding:2px 16px;cursor:default">THEME</div>
            <div class="dd-item" data-action="theme-default" id="opt-theme-default">Default</div>
            <div class="dd-item" data-action="theme-dark" id="opt-theme-dark">Dark Mode</div>
            <div class="dd-sep"></div>
            <div class="dd-item" style="opacity:0.5;font-size:11px;padding:2px 16px;cursor:default">GENRE FILTER</div>
            <div class="dd-item" data-genre="" id="genre-all">All Genres</div>
            <div class="dd-item" data-genre="electronic">Electronic</div>
            <div class="dd-item" data-genre="jazz">Jazz</div>
            <div class="dd-item" data-genre="classical">Classical</div>
            <div class="dd-item" data-genre="ambient">Ambient</div>
            <div class="dd-item" data-genre="rock">Rock</div>
          </div>
        </div>
        <div class="nav-menuitem" id="nm-view" tabindex="0">View
          <div class="nav-dropdown" id="dd-view">
            <div class="dd-item" data-action="songs">All Songs</div>
            <div class="dd-item" data-action="recents">Recently Played</div>
            <div class="dd-item" data-action="statistics">Statistics</div>
            <div class="dd-sep"></div>
            <div class="dd-item" data-action="expand-player" id="view-expand">Expand Player</div>
          </div>
        </div>
        <div class="nav-menuitem" id="nm-help" tabindex="0">Help
          <div class="nav-dropdown" id="dd-help">
            <div class="dd-item" data-action="shortcuts">Keyboard Shortcuts…</div>
            <div class="dd-item" data-action="about">About Wavform</div>
          </div>
        </div>
      </div>
      <div class="nav-sep"></div>
      <div class="nav-search">
        <span class="search-icon">⌕</span>
        <input type="text" id="nav-search-input" placeholder="Search…" />
      </div>
      <div class="nav-right" id="nav-right"></div>
    </div>
  `;
  container.appendChild(nav);

  // ─── Search ───────────────────────────────────────────────────────────────
  const searchInput = nav.querySelector('#nav-search-input');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = searchInput.value.trim();
      store.set('page', 'songs');
      store.set('feedQuery', q.length > 1 ? q : '');
    }, 320);
  });
  nav.querySelector('#nav-logo').addEventListener('click', () => {
    store.set('page', 'songs');
    store.set('feedQuery', '');
    searchInput.value = '';
  });
  nav.querySelector('#nav-menu-btn')?.addEventListener('click', () => {
    store.set('sidebarOpen', !store.get('sidebarOpen'));
  });

  // ─── Dropdown logic ───────────────────────────────────────────────────────
  let openMenu = null;

  function openDropdown(menuItemId) {
    const item = nav.querySelector(`#${menuItemId}`);
    const dd   = item?.querySelector('.nav-dropdown');
    if (!dd) return;
    if (openMenu && openMenu !== menuItemId) closeAll();
    openMenu = menuItemId;
    item.classList.add('open');
    dd.classList.add('open');
  }

  function closeAll() {
    nav.querySelectorAll('.nav-menuitem').forEach(el => el.classList.remove('open'));
    nav.querySelectorAll('.nav-dropdown').forEach(el => el.classList.remove('open'));
    openMenu = null;
  }

  ['nm-file','nm-options','nm-view','nm-help'].forEach(id => {
    const el = nav.querySelector(`#${id}`);
    el?.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu === id ? closeAll() : openDropdown(id);
    });
  });

  document.addEventListener('click', closeAll);
  nav.addEventListener('click', e => e.stopPropagation());

  // ─── Dropdown actions ─────────────────────────────────────────────────────
  nav.querySelectorAll('.dd-item[data-action]').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      closeAll();
      switch (action) {
        case 'upload':   store.set('page', 'upload');      break;
        case 'songs':    store.set('page', 'songs');       break;
        case 'recents':  store.set('page', 'recents');     break;
        case 'playlists':store.set('page', 'playlists');   break;
        case 'albums':   store.set('page', 'albums');      break;
        case 'statistics':store.set('page', 'statistics'); break;
        case 'expand-player':
          document.getElementById('app')?.classList.toggle('player-expanded');
          break;
        case 'theme-default':
          setTheme('default'); syncThemeChecks(nav);
          break;
        case 'theme-dark':
          setTheme('dark'); syncThemeChecks(nav);
          break;
        case 'shortcuts': showShortcutsModal(); break;
        case 'about':     showAboutModal();     break;
      }
    });
  });

  // Genre filter items
  nav.querySelectorAll('.dd-item[data-genre]').forEach(item => {
    item.addEventListener('click', () => {
      store.set('feedGenre', item.dataset.genre || '');
      store.set('page', 'songs');
      closeAll();
      syncGenreChecks(nav);
    });
  });

  syncThemeChecks(nav);

  // ─── Upload button ────────────────────────────────────────────────────────
  const right = nav.querySelector('#nav-right');
  right.innerHTML = `<button class="btn btn-primary btn-sm nav-upload-btn" id="nav-upload">↑ Upload</button>`;
  right.querySelector('#nav-upload').addEventListener('click', () => store.set('page', 'upload'));
}

function syncThemeChecks(nav) {
  const theme = getTheme();
  nav.querySelector('#opt-theme-default')?.classList.toggle('checked', theme === 'default');
  nav.querySelector('#opt-theme-dark')?.classList.toggle('checked', theme === 'dark');
}

function syncGenreChecks(nav) {
  const g = store.get('feedGenre') || '';
  nav.querySelectorAll('.dd-item[data-genre]').forEach(el => {
    el.classList.toggle('checked', (el.dataset.genre || '') === g);
  });
}

// ─── Help modals ──────────────────────────────────────────────────────────

function showShortcutsModal() {
  const existing = document.getElementById('shortcuts-modal');
  if (existing) { existing.remove(); return; }
  const m = document.createElement('div');
  m.id = 'shortcuts-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal" style="min-width:340px">
      <div class="modal-titlebar">Keyboard Shortcuts <span style="margin-left:auto;cursor:pointer" id="sc-close">✕</span></div>
      <div class="modal-body" style="font-family:var(--mono);font-size:13px;line-height:1.9">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:0 16px">
          <kbd>Space</kbd>  <span>Play / Pause</span>
          <kbd>←</kbd>      <span>Seek back 5s</span>
          <kbd>→</kbd>      <span>Seek forward 5s</span>
          <kbd>↑</kbd>      <span>Volume up</span>
          <kbd>↓</kbd>      <span>Volume down</span>
          <kbd>M</kbd>      <span>Mute / unmute</span>
          <kbd>N</kbd>      <span>Next track</span>
          <kbd>P</kbd>      <span>Previous track</span>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.querySelector('#sc-close').addEventListener('click', () => m.remove());
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

function showAboutModal() {
  const existing = document.getElementById('about-modal');
  if (existing) { existing.remove(); return; }
  const m = document.createElement('div');
  m.id = 'about-modal';
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal" style="min-width:280px;text-align:center">
      <div class="modal-titlebar">About Wavform <span style="margin-left:auto;cursor:pointer" id="ab-close">✕</span></div>
      <div class="modal-body" style="padding:16px 20px">
        <div style="font-family:var(--pixel);font-size:22px;color:var(--lcd-text);letter-spacing:4px;margin-bottom:8px">WAVFORM</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text2)">Open-source lossless audio platform</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text3);margin-top:4px">No login · No cloud · Your files, your hardware</div>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.querySelector('#ab-close').addEventListener('click', () => m.remove());
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}
