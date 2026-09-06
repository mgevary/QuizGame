/**
 * settings.js — per-profile preferences, including WHICH MODULES a child
 * plays. Module choice is a setting rather than a global because two children
 * on one device are usually at completely different places, and because a
 * parent needs to be able to say "tonight is just the spelling list".
 */

import { readJSON, writeJSON } from '../store.js';
import { getActiveUserId } from '../users/users.js';
import { BAND_INFO } from '../content/bands.js';

var KEY = 'quiz/settings.v1';

export var DEFAULTS = {
  modules: null,            // null = the modules written for this band; else an explicit id list
  mission: null,            // active mission id
  audio: null,              // null = follow the band (see audioDefaultFor)
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
  audio: 'On for young children, who cannot read the question. Off for confident readers \u2014 the speaker button still reads it on request.',
  fastLane: 'Off by default. Speed rewards reading fluency more than knowing the answer, and it works against the youngest players.',
  reducedMotion: 'Turns off the racing animation and celebrations.',
  teachAssist: 'A teammate can show you the teach card, but never the answer.'
};

function all() { return readJSON(KEY, {}); }

/**
 * Should questions be read aloud without being asked?
 *
 * For a pre-reader, yes — the prompt carries its whole meaning in sound and
 * there is nothing else to go on. For a fluent reader, NO: a device that
 * starts talking on its own is startling, it is useless to them, and in a
 * room with two children playing it talks over the one whose turn it is.
 * Either way the speaker button is always there to ask for it.
 */
export function audioDefaultFor(band) {
  var mode = (BAND_INFO[band] || BAND_INFO.K).audio;
  return mode === 'required' || mode === 'default';
}

export function loadSettings(userId, band) {
  var id = userId || getActiveUserId();
  var stored = all()[id] || {};
  var out = {};
  for (var k in DEFAULTS) out[k] = stored[k] === undefined ? DEFAULTS[k] : stored[k];
  // A child who has never been given an explicit preference follows their band.
  if (out.audio === null || out.audio === undefined) out.audio = audioDefaultFor(band || 'K');
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

/**
 * Is this module switched on? With no explicit choice the answer is "yes if
 * it was written for this child's band" — `defaults` is that list, supplied
 * by the caller so this module stays free of content imports.
 */
export function moduleEnabled(settings, moduleId, defaults) {
  if (!settings.modules) return !defaults || defaults.indexOf(moduleId) !== -1;
  return settings.modules.indexOf(moduleId) !== -1;
}

export function toggleModule(moduleId, defaults, userId) {
  var s = loadSettings(userId);
  var list = s.modules ? s.modules.slice() : (defaults || []).slice();
  var at = list.indexOf(moduleId);
  if (at === -1) list.push(moduleId); else list.splice(at, 1);
  s.modules = list;
  saveSettings(s, userId);
  return s;
}
