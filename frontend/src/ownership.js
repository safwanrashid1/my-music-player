// Maps collection id -> owner token, scoped to this browser. There's no
// login, so this token (returned once at creation, like a Pastebin delete
// key) is the only thing that lets this browser edit/delete a collection.
const STORAGE_KEY = 'wf_owned_collections';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveOwnerToken(collectionId, token) {
  if (!token) return;
  const map = load();
  map[collectionId] = token;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

export function getOwnerToken(collectionId) {
  return load()[collectionId] || null;
}

export function isOwner(collectionId) {
  return !!getOwnerToken(collectionId);
}

export function forgetOwnerToken(collectionId) {
  const map = load();
  delete map[collectionId];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}
