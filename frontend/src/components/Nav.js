import { store } from '../stores/app.js';

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
        z-index: 50;
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
      .nav-logo span { color: var(--lcd-text); }
      .nav-winctrls { display: flex; gap: 3px; }
      .winctrl {
        width: 9px; height: 9px;
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
        background: var(--chrome); cursor: pointer; font-size: 7px;
        display: flex; align-items: center; justify-content: center;
        color: var(--text3); font-family: var(--pixel);
      }
      .winctrl:active { box-shadow: inset 1px 1px 0 var(--chrome-lo), inset -1px -1px 0 var(--chrome-hi), 0 0 0 1px var(--chrome-edge); }
      .nav-menu-btn {
        display: none; font-size: 14px; padding: 2px 6px; color: #fff;
        background: transparent; border: none;
      }

      /* ── Row 2: Menu bar + search (merged into one row) ── */
      .nav-menubar {
        display: flex; align-items: center; gap: 0;
        padding: 0 4px; flex-shrink: 0; height: 22px;
        border-top: 1px solid var(--chrome-lo);
      }
      .nav-menubar-left { display: flex; align-items: center; gap: 0; flex-shrink: 0; }
      .nav-menuitem {
        font-family: var(--pixel); font-size: 12px; letter-spacing: 0.5px;
        color: var(--text); padding: 2px 6px; cursor: pointer;
        text-transform: uppercase; height: 22px; display: flex; align-items: center;
        white-space: nowrap;
      }
      .nav-menuitem:hover { background: var(--playlist-active); color: #fff; }

      /* Vertical separator between menu items and search */
      .nav-sep {
        width: 0; height: 14px; margin: 0 6px;
        border-left: 1px solid var(--chrome-lo);
        border-right: 1px solid var(--chrome-hi);
        flex-shrink: 0;
      }

      /* Search — takes the remaining width in the menu bar row */
      .nav-search { flex: 1; position: relative; min-width: 0; }
      .nav-search input {
        font-size: 13px; padding: 2px 8px 2px 22px;
        height: 18px; width: 100%;
      }
      .nav-search .search-icon {
        position: absolute; left: 6px; top: 50%; transform: translateY(-50%);
        color: var(--lcd-dim); font-size: 13px; pointer-events: none; font-family: var(--pixel);
      }
      .nav-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: 6px; }
      .nav-upload-btn { font-size: 12px; padding: 2px 8px; }
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

    <!-- Row 2: Menu bar + search merged -->
    <div class="nav-menubar">
      <div class="nav-menubar-left">
        <span class="nav-menuitem" id="nm-file">File</span>
        <span class="nav-menuitem" id="nm-play">Play</span>
        <span class="nav-menuitem" id="nm-options">Options</span>
        <span class="nav-menuitem" id="nm-view">View</span>
        <span class="nav-menuitem" id="nm-help">Help</span>
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

  const searchInput = nav.querySelector('#nav-search-input');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = searchInput.value.trim();
      if (q.length > 1) {
        store.set('page', 'feed');
        store.set('feedQuery', q);
      } else if (q.length === 0) {
        store.set('feedQuery', '');
      }
    }, 320);
  });

  nav.querySelector('#nav-logo').addEventListener('click', () => {
    store.set('page', 'feed');
    store.set('feedQuery', '');
    searchInput.value = '';
  });

  nav.querySelector('#nav-menu-btn')?.addEventListener('click', () => {
    store.set('sidebarOpen', !store.get('sidebarOpen'));
  });

  nav.querySelector('#nm-file')?.addEventListener('click', () => store.set('page', 'upload'));
  nav.querySelector('#nm-play')?.addEventListener('click', () => store.set('page', 'songs'));
  nav.querySelector('#nm-view')?.addEventListener('click', () => store.set('page', 'statistics'));

  function renderRight() {
    const right = nav.querySelector('#nav-right');
    right.innerHTML = `
      <button class="btn btn-primary btn-sm nav-upload-btn" id="nav-upload">
        ↑ Upload
      </button>
    `;
    right.querySelector('#nav-upload').addEventListener('click', () => store.set('page', 'upload'));
  }

  renderRight();
}
