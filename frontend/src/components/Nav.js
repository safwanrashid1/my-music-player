import { store } from '../stores/app.js';

export function renderNav(container) {
  const nav = document.createElement('nav');
  nav.id = 'topnav';
  nav.innerHTML = `
    <style>
      #topnav {
        grid-area: nav;
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 8px;
        background: var(--chrome);
        box-shadow:
          inset 1px 1px 0 var(--chrome-hi),
          inset 0 -1px 0 var(--chrome-lo),
          0 0 0 1px var(--chrome-edge);
        z-index: 50;
      }
      .nav-logo {
        font-family: var(--pixel);
        font-size: 20px;
        letter-spacing: 2px;
        color: var(--text);
        cursor: pointer;
        padding: 0 8px;
        text-transform: uppercase;
        flex-shrink: 0;
      }
      .nav-logo span { color: var(--accent); }
      .nav-search {
        flex: 1; max-width: 320px; margin: 0 12px; position: relative;
      }
      .nav-search input {
        font-size: 13px;
        padding: 4px 8px 4px 28px;
        height: 28px;
      }
      .nav-search .search-icon {
        position: absolute; left: 8px; top: 50%;
        transform: translateY(-50%);
        color: var(--lcd-dim); font-size: 14px; pointer-events: none;
        font-family: var(--pixel);
      }
      .nav-right { display: flex; align-items: center; gap: 6px; }
      .nav-upload-btn { font-size: 13px; letter-spacing: 1px; }
      .nav-menu-btn {
        display: none; font-size: 16px; padding: 3px 8px;
        background: var(--chrome);
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
      }
    </style>
    <button class="nav-menu-btn" id="nav-menu-btn" title="Menu">☰</button>
    <div class="nav-logo" id="nav-logo">wav<span>form</span></div>
    <div class="nav-search">
      <span class="search-icon">⌕</span>
      <input type="text" id="nav-search-input" placeholder="Search tracks, artists…" />
    </div>
    <div class="nav-right" id="nav-right"></div>
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

  nav.querySelector('#nav-menu-btn').addEventListener('click', () => {
    store.set('sidebarOpen', !store.get('sidebarOpen'));
  });

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
