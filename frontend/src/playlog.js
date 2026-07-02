// Tracks every play event in localStorage — no server, no login needed.
// Used by Recents and Statistics pages.
const KEY = 'wf_playlog';
const MAX_ENTRIES = 500;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

function save(entries) {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch {}
}

export function logPlay(track) {
  if (!track || !track.id) return;
  const entries = load();
  entries.unshift({
    id:         track.id,
    title:      track.title || 'Untitled',
    artist:     track.artist || null,
    genre:      track.genre  || null,
    duration:   track.duration_seconds || 0,
    original_format: track.original_format || null,
    sample_rate: track.sample_rate || null,
    ts:         Date.now(),
  });
  save(entries.slice(0, MAX_ENTRIES));
}

export function getRecentTracks(limit = 50) {
  return load().slice(0, limit);
}

export function getStats() {
  const entries = load();
  if (entries.length === 0) return null;

  const totalListenedSec = entries.reduce((s, e) => s + (e.duration || 0), 0);

  // Artist counts
  const artistCount = {};
  entries.forEach(e => { if (e.artist) artistCount[e.artist] = (artistCount[e.artist] || 0) + 1; });

  // Genre counts
  const genreCount = {};
  entries.forEach(e => { if (e.genre) genreCount[e.genre] = (genreCount[e.genre] || 0) + 1; });

  // Track counts
  const trackCount = {};
  entries.forEach(e => { trackCount[e.id] = { title: e.title, artist: e.artist, count: (trackCount[e.id]?.count || 0) + 1 }; });

  const topArtist = Object.entries(artistCount).sort((a, b) => b[1] - a[1])[0];
  const topGenre  = Object.entries(genreCount).sort((a, b) => b[1] - a[1])[0];
  const topTrack  = Object.entries(trackCount).sort((a, b) => b[1].count - a[1].count)[0];

  return {
    totalPlays:      entries.length,
    totalListenedSec,
    uniqueTracks:    Object.keys(trackCount).length,
    topArtist:       topArtist ? { name: topArtist[0], plays: topArtist[1] } : null,
    topGenre:        topGenre  ? { name: topGenre[0],  plays: topGenre[1]  } : null,
    topTrack:        topTrack  ? { id: topTrack[0], ...topTrack[1] }         : null,
    artistBreakdown: Object.entries(artistCount).sort((a, b) => b[1] - a[1]).slice(0, 8),
    genreBreakdown:  Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}

export function clearLog() {
  try { localStorage.removeItem(KEY); } catch {}
}
