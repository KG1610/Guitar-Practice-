const FAVS_KEY = 'practice-desk-favs-v1';

export function readFavs() {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((id) => typeof id === 'string' && id && !id.startsWith('composer-preview-'));
  } catch {
    return [];
  }
}

export function writeFavs(ids) {
  try {
    localStorage.setItem(FAVS_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

export function isFav(id) {
  return readFavs().includes(id);
}

export function toggleFav(id) {
  if (!id || String(id).startsWith('composer-preview-')) return readFavs();
  const ids = readFavs();
  const i = ids.indexOf(id);
  if (i >= 0) ids.splice(i, 1);
  else ids.unshift(id);
  writeFavs(ids);
  return ids;
}

export function removeFav(id) {
  writeFavs(readFavs().filter((x) => x !== id));
}
