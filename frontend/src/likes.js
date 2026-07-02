// Tracks which tracks this browser has liked in localStorage.
// When the user first likes a track, a "Liked Songs" playlist is auto-created
// via the collections API and its id + owner token are stored here so it shows
// up in the Playlists section and can be renamed/deleted/reordered normally.
import { api } from './api/client.js';
import { saveOwnerToken, getOwnerToken } from './ownership.js';

const LIKED_KEY     = 'wf_liked_tracks';
const COLL_ID_KEY   = 'wf_liked_collection_id';
const LIKED_SONGS_NAME = 'Liked Songs';

export function getLikedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY)) || []); } catch { return new Set(); }
}

export function isLiked(trackId) { return getLikedIds().has(trackId); }

function setLiked(trackId, liked) {
  const ids = getLikedIds();
  liked ? ids.add(trackId) : ids.delete(trackId);
  try { localStorage.setItem(LIKED_KEY, JSON.stringify([...ids])); } catch {}
}

function getLikedCollectionId() { return localStorage.getItem(COLL_ID_KEY); }

function saveLikedCollectionId(id) {
  try { localStorage.setItem(COLL_ID_KEY, id); } catch {}
}

async function ensureLikedCollection() {
  let id = getLikedCollectionId();
  if (id) return id;
  // First like ever — create the "Liked Songs" playlist
  const coll = await api.createCollection({ type: 'playlist', name: LIKED_SONGS_NAME });
  saveOwnerToken(coll.id, coll.owner_token);
  saveLikedCollectionId(coll.id);
  return coll.id;
}

export async function likeTrack(trackId) {
  if (isLiked(trackId)) return; // already liked — no-op
  await api.likeTrack(trackId);
  setLiked(trackId, true);
  const collId = await ensureLikedCollection();
  await api.addTrackToCollection(collId, trackId).catch(() => {});
}

export async function unlikeTrack(trackId) {
  if (!isLiked(trackId)) return; // not liked — no-op
  await api.unlikeTrack(trackId);
  setLiked(trackId, false);
  const collId = getLikedCollectionId();
  if (collId) await api.removeTrackFromCollection(collId, trackId).catch(() => {});
}
