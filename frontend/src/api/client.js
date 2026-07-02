import { getOwnerToken } from '../ownership.js';

const BASE = '/api';

async function request(method, path, body, { isFormData = false, ownerToken = null } = {}) {
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (ownerToken) headers['X-Owner-Token'] = ownerToken;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Tracks
  getFeed:    (params = {}) => request('GET', `/tracks?${new URLSearchParams(params)}`),
  getTrack:   (id)          => request('GET', `/tracks/${id}`),
  getStatus:  (id)          => request('GET', `/tracks/${id}/status`),
  getWaveform:(id)          => request('GET', `/tracks/${id}/waveform`),
  deleteTrack:(id)          => request('DELETE', `/tracks/${id}`),
  likeTrack:  (id)          => request('POST',   `/tracks/${id}/like`),
  unlikeTrack:(id)          => request('DELETE', `/tracks/${id}/like`),
  getComments:(id)          => request('GET',  `/tracks/${id}/comments`),
  postComment:(id, body)    => request('POST', `/tracks/${id}/comments`, body),

  uploadTrack(file, title, onProgress, album) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('audio', file);
      if (title) fd.append('title', title);
      if (album) fd.append('album', album);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/tracks/upload');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 413) {
          reject(new Error('File too large — server rejected it. Check MAX_FILE_SIZE_MB in backend/.env'));
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.error || `HTTP ${xhr.status}`));
        } catch { reject(new Error('Invalid server response')); }
      };
      xhr.onerror = () => reject(new Error('Network error — check the backend is running'));
      xhr.send(fd);
    });
  },

  // EQ
  getEqDefaults: ()          => request('GET', '/eq/defaults'),
  getEqPresets:  ()          => request('GET', '/eq/presets'),
  saveEqPreset:  (body)      => request('POST', '/eq/presets', body),
  deleteEqPreset:(id)        => request('DELETE', `/eq/presets/${id}`),

  // Collections (albums & playlists) — owner token is attached automatically
  // from local storage, so callers never have to think about it.
  createCollection: (body)          => request('POST', '/collections', body),
  getCollections:   (params = {})   => request('GET', `/collections?${new URLSearchParams(params)}`),
  getCollection:    (id)            => request('GET', `/collections/${id}`),
  updateCollection: (id, body)      => request('PATCH', `/collections/${id}`, body, { ownerToken: getOwnerToken(id) }),
  deleteCollection: (id)            => request('DELETE', `/collections/${id}`, null, { ownerToken: getOwnerToken(id) }),
  addTrackToCollection:      (id, trackId) => request('POST', `/collections/${id}/tracks`, { track_id: trackId }, { ownerToken: getOwnerToken(id) }),
  removeTrackFromCollection: (id, trackId) => request('DELETE', `/collections/${id}/tracks/${trackId}`, null, { ownerToken: getOwnerToken(id) }),
  reorderCollectionTracks:   (id, trackIds) => request('PUT', `/collections/${id}/tracks/order`, { track_ids: trackIds }, { ownerToken: getOwnerToken(id) }),

  // Stream URL helpers (no fetch — used in <audio> src or AudioContext)
  streamUrl:  (id, quality = 'lossless') => `/api/tracks/${id}/stream${quality === 'fallback' ? '?quality=fallback' : ''}`,
};
