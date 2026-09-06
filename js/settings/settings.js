/**
 * settings.js — per-profile preferences, including WHICH MODULES a child
 * plays. Module choice is a setting rather than a global because two children
 * on one device are usually at completely different places, and because a
 * parent needs to be able to say "tonight is just the spelling list".
 */

import { readJSON, writeJSON } from '../store.js';
import { getActiveUserId } from '../users/users.js';

var KEY = 'quiz/settings.v1';

export var DEFAULTS = {
  modules: null,            // null = every module suited to the band; else an id list
  mission: null,            // active mission id
  audio: true,
  music: true,
  reducedMotion: false,
  bigText: false,
  sessionItems: null,       // null = the band's default
  theme: 'race',
  fastLane: false,          // speed bonus — off by default, G3+ only
  teachAssist: true
};

export var SETTING_LABELS = {
  audio: 'Read questions aloud',
  music: 'Music',
  reducedMotion: 'Less movement',
  bigText: 'Bigger text',
  fastLane: 'Fast lane (bonus for speed)',
  teachAssist: 'Let teammates offer help'
};

export var SETTING_NOTES = {
  fastLane: 'Off by default. Speed rewards reading fluency more than knowing the answer, and it works against the youngest players.',
  reducedMotion: 'Turns off the racing animation and celebrations.',
  teachAssist: 'A teammate can show you the teach card, but never the answer.'
};

function all() { return readJSON(KEY, {}); }

export function loadSettings(userId) {
  var id = userId || getActiveUserId();
  var stored = all()[id] || {};
  var out = {};
  for (var k in DEFAULTS) out[k] = stored[k] === undefined ? DEFAULTS[k] : stored[k];
  return out;
}

export function saveSettings(settings, userId) {
  var id = userId || getActiveUserId();
  if (!id) return;
  var everything = all();
  everything[id] = settings;
  writeJSON(KEY, everything);
}

export function setSetting(key, value, userId) {
  var s = loadSettings(userId);
  s[key] = value;
  saveSettings(s, userId);
  return s;
}

/** Is this module switched on for this child? null means "all that suit them". */
export function moduleEnabled(settings, moduleId) {
  if (!settings.modules) return true;
  return settings.modules.indexOf(moduleId) !== -1;
}

export function toggleModule(moduleId, allIds, userId) {
  var s = loadSettings(userId);
  var list = s.modules ? s.modules.slice() : allIds.slice();
  var at = list.indexOf(moduleId);
  if (at === -1) list.push(moduleId); else list.splice(at, 1);
  s.modules = list;
  saveSettings(s, userId);
  return s;
}
