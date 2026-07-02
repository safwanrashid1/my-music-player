import './styles.css';
import { store } from './stores/app.js';
import { renderNav } from './components/Nav.js';
import { renderSidebar } from './components/Sidebar.js';
import { renderPlayer } from './components/Player.js';
import { renderDropOverlay } from './components/DropOverlay.js';
import { renderFeed } from './pages/Feed.js';
import { renderUpload } from './pages/Upload.js';
import { renderAlbums } from './pages/Albums.js';
import { renderPlaylists } from './pages/Playlists.js';
import { renderCollectionDetail } from './pages/CollectionDetail.js';
import { renderRecents } from './pages/Recents.js';
import { renderStatistics } from './pages/Statistics.js';
import { setupKeyboardShortcuts } from './keyboard.js';

const app = document.getElementById('app');

// ─── Layout Shell ──────────────────────────────────────────────────────────
renderNav(app);

const sidebar = document.createElement('aside');
app.appendChild(sidebar);
renderSidebar(sidebar);

const main = document.createElement('main');
main.id = 'main-content';
main.style.cssText = 'grid-area:main;overflow:hidden;height:100%;display:flex;flex-direction:column;background:var(--bg)';
app.appendChild(main);

renderPlayer(app);

// Toast
const toast = document.createElement('div');
toast.id = 'toast';
document.body.appendChild(toast);

// Drop-anywhere upload (portal)
renderDropOverlay(document.body);

// ─── Router ────────────────────────────────────────────────────────────────
function navigate(page) {
  main.innerHTML = '';
  switch (page) {
    case 'songs':
    case 'feed':
      renderFeed(main);
      break;
    case 'recents':
      renderRecents(main);
      break;
    case 'statistics':
      renderStatistics(main);
      break;
    case 'upload':
      renderUpload(main);
      break;
    case 'albums':
      renderAlbums(main);
      break;
    case 'playlists':
      renderPlaylists(main);
      break;
    case 'collection':
      renderCollectionDetail(main, store.get('pageData') || {});
      break;
    default:
      renderFeed(main);
  }
}

store.subscribe('page', navigate);

setupKeyboardShortcuts();

store.set('page', 'songs');
