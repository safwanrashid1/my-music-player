import { store } from '../stores/app.js';
import { engine } from '../audio/engine.js';

export function renderSidebar(container) {
  const aside = document.createElement('aside');
  aside.id = 'sidebar';
  aside.innerHTML = `
    <style>
      #sidebar {
        grid-area: sidebar;
        display: flex; flex-direction: column;
        padding: 6px 0;
        overflow-y: auto;
        background: var(--chrome);
        box-shadow:
          inset -1px 0 0 var(--chrome-lo),
          inset 1px 0 0 var(--chrome-hi);
      }
      .sidebar-section { padding: 0 6px; margin-bottom: 10px; }
      .sidebar-label {
        font-size: 11px; font-family: var(--pixel);
        color: var(--text3); letter-spacing: 2px;
        text-transform: uppercase; padding: 4px 8px 2px;
      }
      .sidebar-item {
        display: flex; align-items: center; gap: 8px;
        padding: 4px 10px;
        color: var(--text);
        font-family: var(--pixel); font-size: 15px;
        cursor: pointer;
        letter-spacing: 0.5px;
      }
      .sidebar-item:hover {
        background: var(--playlist-hover);
        color: var(--playlist-text);
      }
      .sidebar-item.active {
        background: var(--playlist-active);
        color: #FFFFFF;
      }
      .sidebar-item .icon { width: 18px; text-align: center; font-size: 14px; }
      .sidebar-divider {
        height: 0;
        border-top: 1px solid var(--chrome-lo);
        border-bottom: 1px solid var(--chrome-hi);
        margin: 6px 8px;
      }
      #sidebar-eq-toggle {
        margin: 2px 6px; padding: 4px 10px;
        display: flex; align-items: center; justify-content: space-between;
        cursor: pointer;
        background: var(--chrome);
        box-shadow: inset 1px 1px 0 var(--chrome-hi), inset -1px -1px 0 var(--chrome-lo), 0 0 0 1px var(--chrome-edge);
      }
      #sidebar-eq-toggle:hover { background: var(--chrome-hi); }
      #sidebar-eq-toggle .eq-label {
        font-size: 14px; font-family: var(--pixel);
        letter-spacing: 2px; text-transform: uppercase;
      }
      .eq-on-dot  { width: 6px; height: 6px; background: var(--lcd-green); box-shadow: 0 0 4px var(--lcd-green); }
      .eq-off-dot { width: 6px; height: 6px; background: var(--chrome-lo); }
      #dac-select { font-size: 12px; font-family: var(--pixel); padding: 3px 6px; height: auto; }
      #dac-status { font-size: 11px; font-family: var(--pixel); color: var(--lcd-dim); margin-top: 3px; padding: 0 2px; letter-spacing: 0.5px; }
    </style>
    <div class="sidebar-section">
      <div class="sidebar-label">Discover</div>
      <div class="sidebar-item" data-page="recents"><span class="icon">◷</span> Recents</div>
      <div class="sidebar-item" data-page="songs"><span class="icon">♪</span> Songs</div>
      <div class="sidebar-item" data-page="albums"><span class="icon">◈</span> Albums</div>
      <div class="sidebar-item" data-page="statistics"><span class="icon">◉</span> Statistics</div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-label">Library</div>
      <div class="sidebar-item" data-page="upload" id="sb-upload"><span class="icon">↑</span> Upload</div>
      <div class="sidebar-item" data-page="playlists"><span class="icon">♫</span> Playlists</div>
    </div>
    <div class="sidebar-divider"></div>
    <div id="sidebar-eq-toggle">
      <span class="eq-label">EQ</span>
      <span class="eq-on-dot" id="eq-dot"></span>
    </div>
    <div class="sidebar-divider"></div>
    <div class="sidebar-section">
      <div class="sidebar-label">Output</div>
      <div style="padding:0 4px">
        <select id="dac-select"><option value="default">System default</option></select>
        <div id="dac-status">Detecting devices…</div>
      </div>
    </div>
  `;
  container.appendChild(aside);

  // Page nav
  aside.querySelectorAll('[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      store.set('page', item.dataset.page);
      store.set('sidebarOpen', false);
    });
  });

  // Sync active state
  store.subscribe('page', (page) => {
    aside.querySelectorAll('[data-page]').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });
  });

  // Mobile off-canvas open/close
  const backdrop = document.createElement('div');
  backdrop.id = 'sidebar-backdrop';
  backdrop.addEventListener('click', () => store.set('sidebarOpen', false));
  container.appendChild(backdrop);
  store.subscribe('sidebarOpen', (open) => {
    aside.classList.toggle('open', !!open);
    backdrop.classList.toggle('open', !!open);
  });

  // EQ toggle
  const eqToggle = aside.querySelector('#sidebar-eq-toggle');
  const eqDot = aside.querySelector('#eq-dot');
  eqToggle.addEventListener('click', () => {
    const enabled = !store.get('eqEnabled');
    store.set('eqEnabled', enabled);
    store.set('showEq', enabled);
  });
  store.subscribe('eqEnabled', (enabled) => {
    eqDot.className = enabled ? 'eq-on-dot' : 'eq-off-dot';
    eqToggle.title = enabled ? 'EQ is ON — click to toggle panel' : 'EQ is OFF — click to enable';
    engine.setEqEnabled(!!enabled);
  });

  // DAC device selector
  const dacSelect = aside.querySelector('#dac-select');
  const dacStatus = aside.querySelector('#dac-status');

  async function loadDevices() {
    try {
      const devices = await engine.getOutputDevices();
      if (devices.length > 0) {
        dacSelect.innerHTML = devices.map(d =>
          `<option value="${d.deviceId}">${d.label || `Output ${d.deviceId.slice(0,8)}`}</option>`
        ).join('');
        const saved = store.get('activeDeviceId');
        if (saved && devices.some(d => d.deviceId === saved)) {
          dacSelect.value = saved;
          await engine.setOutputDevice(saved);
        }
        dacStatus.textContent = `${devices.length} device${devices.length > 1 ? 's' : ''} found`;
        dacStatus.style.color = 'var(--accent)';
      } else {
        dacStatus.textContent = 'No external devices';
        dacStatus.style.color = 'var(--text3)';
      }
    } catch {
      dacStatus.textContent = 'Device access unavailable';
    }
  }

  dacSelect.addEventListener('change', async () => {
    try {
      await engine.setOutputDevice(dacSelect.value);
      store.set('activeDeviceId', dacSelect.value);
    } catch (e) {
      console.warn('Device switch failed:', e.message);
    }
  });

  // Load devices after a short delay (needs user interaction context)
  setTimeout(loadDevices, 1200);
}
