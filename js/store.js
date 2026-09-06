// store.js — tiny synchronous localStorage wrapper standing in for the native
// app's AsyncStorage. Every read is defensive: a wiped, full, or blocked
// storage must never take the game down, so failures fall back to defaults.

export function readJSON(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return fallback;
    var parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function readRaw(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

export function writeRaw(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}

export function removeKey(key) {
  try { localStorage.removeItem(key); } catch (e) { /* best effort */ }
}
