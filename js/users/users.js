/**
 * users.js — profiles. Thin, because a profile IS its events: a name and band
 * live in the fold, not in a separate store. This module only holds the
 * roster and who is signed in on this device.
 *
 * PIN note: this is a family game, not a bank. The hash keeps a PIN out of
 * plaintext storage; it is not meant to resist an adversary with the device.
 */

import { readJSON, writeJSON, readRaw, writeRaw, removeKey } from '../store.js';
import { append, state } from '../sync/log.js';
import { bandForAge } from '../content/bands.js';

var ACTIVE_KEY = 'quiz/activeUser.v1';
var PIN_KEY = 'quiz/pins.v1';

export function hashPin(pin) {
  var h = 5381;
  for (var i = 0; i < pin.length; i++) h = ((h << 5) + h) ^ pin.charCodeAt(i);
  return String(h >>> 0);
}

export function listUsers() {
  var users = state().users;
  var out = [];
  for (var id in users) if (users[id].name) out.push({ id: id, name: users[id].name, band: users[id].band, avatar: users[id].avatar });
  out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return out;
}

export function createUser(name, age, avatar, pin) {
  var id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  append('prof', id, { op: 'create', name: String(name || 'Player').slice(0, 16), band: bandForAge(age), avatar: avatar });
  if (pin) setPin(id, pin);
  return id;
}

export function updateUser(id, changes) { append('prof', id, changes); }

export function deleteUser(id) {
  append('prof', id, { op: 'delete' });
  var pins = readJSON(PIN_KEY, {});
  delete pins[id];
  writeJSON(PIN_KEY, pins);
  if (getActiveUserId() === id) setActiveUserId(null);
}

export function setPin(id, pin) {
  var pins = readJSON(PIN_KEY, {});
  if (pin) pins[id] = hashPin(pin); else delete pins[id];
  writeJSON(PIN_KEY, pins);
}

export function hasPin(id) { return !!readJSON(PIN_KEY, {})[id]; }
export function verifyPin(id, pin) {
  var pins = readJSON(PIN_KEY, {});
  return !pins[id] || pins[id] === hashPin(pin);
}

export function getActiveUserId() { return readRaw(ACTIVE_KEY) || null; }
export function setActiveUserId(id) {
  if (id === null) removeKey(ACTIVE_KEY); else writeRaw(ACTIVE_KEY, id);
}

export function getActiveUser() {
  var id = getActiveUserId();
  if (!id) return null;
  var u = state().users[id];
  return u && u.name ? { id: id, name: u.name, band: u.band, avatar: u.avatar } : null;
}

/**
 * The parent gate. A multiplication problem is enough to stop a six-year-old
 * wiping their sibling's progress, and is the same pattern the app stores use.
 */
export function parentGate() {
  var a = 6 + Math.floor(Math.random() * 7), b = 6 + Math.floor(Math.random() * 7);
  var answer = window.prompt('Grown-up check: what is ' + a + ' x ' + b + '?');
  return answer !== null && parseInt(answer, 10) === a * b;
}
