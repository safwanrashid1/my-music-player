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
        padding: 0;
        overflow-y: auto;
        background: var(--chrome);
        box-shadow:
          inset -1px 0 0 var(--chrome-lo),
          inset 1px 0 0 var(--chrome-hi);
      }
      .sidebar-nav { padding: 2px 0; }
      .sidebar-out-label {
        font-size: 10px; font-family: var(--pixel);
        color: var(--text3); letter-spacing: 1.5px;
        text-transform: uppercase; padding: 4px 8px 2px;
      }
      .sidebar-item {
        display: flex; align-items: center; gap: 6px;
        padding: 3px 8px;
        color: var(--text);
        font-family: var(--pixel); font-size: 14px;
        cursor: pointer;
        letter-spacing: 0.5px; white-space: nowrap; overflow: hidden;
      }
      .sidebar-item:hover {
        background: var(--playlist-hover);
        color: var(--playlist-text);
      }
      .sidebar-item.active {
        background: var(--playlist-active);
        color: #FFFFFF;
      }
      .sidebar-item .icon { width: 16px; text-align: center; font-size: 13px; flex-shrink: 0; }
      .sidebar-divider {
        height: 0;
        border-top: 1px solid var(--chrome-lo);
        border-bottom: 1px solid var(--chrome-hi);
        margin: 4px 6px;
      }
      .sidebar-titlebar {
        background: linear-gradient(90deg, var(--playlist-active) 0%, var(--lcd) 100%);
        padding: 3px 8px;
        font-family: var(--pixel); font-size: 12px; letter-spacing: 3px;
        color: #fff; text-transform: uppercase; flex-shrink: 0;
        display: flex; align-items: center; justify-content: space-between;
      }
      .sidebar-output { padding: 6px 8px; }
      #dac-select { font-size: 12px; font-family: var(--pixel); padding: 3px 6px; height: auto; width: 100%; }
      #dac-status { font-size: 11px; font-family: var(--pixel); color: var(--lcd-dim); margin-top: 4px; padding: 0 2px; letter-spacing: 0.5px; }
    </style>
    <div class="sidebar-titlebar">
      <span>Library</span>
    </div>
    <div class="sidebar-nav">
      <div class="sidebar-item" data-page="recents"><span class="icon">◷</span> Recents</div>
      <div class="sidebar-item" data-page="songs"><span class="icon">♪</span> Songs</div>
      <div class="sidebar-item" data-page="albums"><span class="icon">◈</span> Albums</div>
      <div class="sidebar-item" data-page="playlists"><span class="icon">♫</span> Playlists</div>
      <div class="sidebar-item" data-page="statistics"><span class="icon">◉</span> Statistics</div>
    </div>
    <div class="sidebar-divider"></div>
    <div class="sidebar-nav">
      <div class="sidebar-item" data-page="upload"><span class="icon">↑</span> Upload</div>
    </div>
    <div class="sidebar-divider"></div>
    <div class="sidebar-output">
      <div class="sidebar-out-label">OUTPUT DEVICE</div>
      <select id="dac-select"><option value="default">System default</option></select>
      <div id="dac-status">Detecting…</div>
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
