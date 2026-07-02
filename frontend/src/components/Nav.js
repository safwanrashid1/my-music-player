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
      /* ── Title bar row — like the Winamp "WINAMP" chrome strip ── */
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
      /* Fake window control dots (like classic player's shade/min/close) */
      .nav-winctrls { display: flex; gap: 3px; }
      .winctrl {
        width: 9px; height: 9px;
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
        background: var(--chrome);
        cursor: pointer; font-size: 7px; display: flex; align-items: center; justify-content: center;
        color: var(--text3); font-family: var(--pixel); line-height: 1;
      }
      .winctrl:active { box-shadow: inset 1px 1px 0 var(--chrome-lo), inset -1px -1px 0 var(--chrome-hi), 0 0 0 1px var(--chrome-edge); }
      .nav-menu-btn {
        display: none; font-size: 14px; padding: 2px 6px;
        background: var(--chrome);
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
        color: var(--text);
      }

      /* ── Menu bar row — FILE · PLAY · OPTIONS · VIEW · HELP ── */
      .nav-menubar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 2px 6px; flex-shrink: 0; height: 16px;
        border-top: 1px solid var(--chrome-lo);
      }
      .nav-menubar-left { display: flex; gap: 2px; }
      .nav-menuitem {
        font-family: var(--pixel); font-size: 11px; letter-spacing: 0.5px;
        color: var(--text); padding: 0 5px; cursor: pointer;
        text-transform: uppercase;
      }
      .nav-menuitem:hover { background: var(--playlist-active); color: #fff; }

      /* ── Search row ── */
      .nav-toolbar {
        display: flex; align-items: center; gap: 6px;
        padding: 2px 6px; border-top: 1px solid var(--chrome-lo);
        flex-shrink: 0; height: 24px; overflow: hidden;
      }
      .nav-search { flex: 1; position: relative; }
      .nav-search input { font-size: 12px; padding: 2px 6px 2px 20px; height: 20px; }
      .nav-search .search-icon {
        position: absolute; left: 5px; top: 50%; transform: translateY(-50%);
        color: var(--lcd-dim); font-size: 12px; pointer-events: none; font-family: var(--pixel);
      }
      .nav-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
      .nav-upload-btn { font-size: 11px; letter-spacing: 0.5px; padding: 1px 6px; }
    </style>

    <!-- Title bar -->
    <div class="nav-titlebar">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="nav-menu-btn" id="nav-menu-btn">☰</button>
        <div class="nav-logo" id="nav-logo">WAV<span>FORM</span></div>
      </div>
      <div class="nav-winctrls">
        <div class="winctrl" title="Shade">▲</div>
        <div class="winctrl" title="Minimize">▼</div>
        <div class="winctrl" title="Close">✕</div>
      </div>
    </div>

    <!-- Menu bar -->
    <div class="nav-menubar">
      <div class="nav-menubar-left">
        <span class="nav-menuitem" id="nm-file">File</span>
        <span class="nav-menuitem" id="nm-play">Play</span>
        <span class="nav-menuitem" id="nm-options">Options</span>
        <span class="nav-menuitem" id="nm-view">View</span>
        <span class="nav-menuitem" id="nm-help">Help</span>
      </div>
    </div>

    <!-- Search / toolbar -->
    <div class="nav-toolbar">
      <div class="nav-search">
        <span class="search-icon">⌕</span>
        <input type="text" id="nav-search-input" placeholder="Search tracks, artists…" />
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
  nav.querySelector('#nm-play')?.addEventListener('click', () => store.set('page', 'feed'));
  nav.querySelector('#nm-view')?.addEventListener('click', () => store.set('page', 'albums'));

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
