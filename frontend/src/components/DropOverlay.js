import { store } from '../stores/app.js';
import { addFiles } from '../pages/Upload.js';

export function renderDropOverlay(container) {
  const overlay = document.createElement('div');
  overlay.id = 'drop-overlay';
  overlay.innerHTML = `
    <style>
      #drop-overlay {
        position: fixed; inset: 0; z-index: 200;
        display: none; align-items: center; justify-content: center;
        background: rgba(8,11,18,0.88);
        pointer-events: none;
      }
      #drop-overlay.active { display: flex; }
      #drop-overlay .frame {
        position: absolute; inset: 16px;
        border: 2px dashed var(--accent);
        border-radius: var(--r2);
      }
      .drop-overlay-msg { font-size: 18px; font-weight: 500; color: var(--accent); text-align: center; }
      .drop-overlay-msg .icon { font-size: 44px; display: block; margin-bottom: 10px; }
    </style>
    <div class="frame"></div>
    <div class="drop-overlay-msg"><span class="icon">♪</span>Drop to upload</div>
  `;
  container.appendChild(overlay);

  let dragDepth = 0;
  const hasFiles = (e) => !!e.dataTransfer && Array.prototype.includes.call(e.dataTransfer.types || [], 'Files');

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    overlay.classList.add('active');
  });

  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });

  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.classList.remove('active');
  });

  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.remove('active');
    if (e.dataTransfer.files.length && addFiles(e.dataTransfer.files)) {
      store.set('page', 'upload');
    }
  });
}
