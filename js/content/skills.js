/**
 * skills.js — skill-id parsing, validation and hierarchy. PURE.
 *
 * A skill id is `<strand>.<topic>.<skill>[.<param>...]`, lowercase, dot
 * separated. The id is the unit of scheduling: two modules using the same
 * leaf id share one review clock, and a skill mastered in one is not
 * re-drilled by the other. That is the whole reason for having a scheme.
 *
 * Prefix matching is semantic. `num.add` is an ancestor of `num.add.within10`,
 * and the ability model stores an estimate at every ancestor, so a brand new
 * leaf inherits a prior from its parent instead of cold-starting. See
 * docs/CONTENT-FORMAT.md §5.
 */

var SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
var MAX_SEGMENTS = 6;
var MAX_LENGTH = 64;

/**
 * Registered strands and topics. Mirrors docs/skill-registry.json — that file
 * is the human-readable canonical copy; this is the one the browser can
 * import without a JSON loader. scripts/validate-modules.mjs checks the two
 * agree.
 */
export var STRANDS = {
  lit: ['phon', 'alpha', 'phonics', 'sight', 'vocab', 'read', 'spell', 'gram', 'write'],
  num: ['count', 'numeral', 'compare', 'subitize', 'add', 'sub', 'mul', 'div', 'place',
        'frac', 'dec', 'pct', 'meas', 'time', 'money', 'geo', 'data', 'alg'],
  sci: ['life', 'earth', 'phys', 'space', 'body', 'method'],
  wld: ['geo', 'hist', 'civ', 'culture', 'lang'],
  log: ['pattern', 'seq', 'class', 'spatial', 'puzzle', 'code'],
  art: ['draw', 'color', 'music', 'craft'],
  sel: ['emotion', 'friend', 'safety', 'self'],
  life: ['body', 'food', 'money', 'time', 'road'],
  x: null   // custom: any topic, but the module must declare a parent
};

export var STRAND_LABELS = {
  lit: 'Literacy', num: 'Numeracy', sci: 'Science', wld: 'World', log: 'Logic',
  art: 'Arts', sel: 'Feelings', life: 'Everyday', x: 'Custom'
};

/** @returns {string|null} an error message, or null if the id is valid. */
export function validateSkillId(id) {
  if (typeof id !== 'string') return 'skill id must be a string';
  if (id.length > MAX_LENGTH) return 'skill id longer than ' + MAX_LENGTH + ' chars: ' + id;
  var parts = id.split('.');
  if (parts.length < 2) return 'skill id needs at least <strand>.<topic>: ' + id;
  if (parts.length > MAX_SEGMENTS) return 'skill id has more than ' + MAX_SEGMENTS + ' segments: ' + id;
  for (var i = 0; i < parts.length; i++) {
    if (!SEGMENT.test(parts[i])) return 'bad segment "' + parts[i] + '" in ' + id;
  }
  var strand = parts[0];
  if (!(strand in STRANDS)) return 'unknown strand "' + strand + '" in ' + id;
  var topics = STRANDS[strand];
  if (topics && topics.indexOf(parts[1]) === -1) {
    return 'unknown topic "' + parts[1] + '" for strand ' + strand + ' in ' + id;
  }
  return null;
}

export function isValidSkillId(id) { return validateSkillId(id) === null; }

export function strandOf(id) { return String(id).split('.')[0]; }

export function isCustom(id) { return strandOf(id) === 'x'; }

/**
 * Every ancestor prefix, nearest first, excluding the id itself.
 *   ancestors('num.add.within10') → ['num.add', 'num']
 */
export function ancestors(id) {
  var parts = String(id).split('.');
  var out = [];
  for (var n = parts.length - 1; n >= 1; n--) out.push(parts.slice(0, n).join('.'));
  return out;
}

/** The id plus its ancestors, leaf first. Used for hierarchical θ updates. */
export function lineage(id) {
  return [id].concat(ancestors(id));
}

export function parentOf(id) {
  var a = ancestors(id);
  return a.length ? a[0] : null;
}

/** True if `prefix` is `id` or an ancestor of it. */
export function isAncestorOrSelf(prefix, id) {
  if (prefix === id) return true;
  return id.indexOf(prefix + '.') === 0;
}

/**
 * Two skills "share a parent" for interleaving purposes when everything but
 * their last segment matches: `num.add.within10` / `num.add.within20` are a
 * family, as are `lit.alpha.sound.upper.b` / `...upper.d` — which is exactly
 * the pair a child confuses and the picker should keep apart. Two-segment ids
 * are their own family. The picker relaxes this constraint before it will
 * ever starve, so being strict here costs nothing.
 */
export function familyKey(id) {
  var parts = String(id).split('.');
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(0, -1).join('.');
}

/**
 * Resolve a custom skill's registered parent using a module's `parents` map.
 * The map keys are prefixes: {"x.spelling": "lit.spell"} covers
 * x.spelling.wk12.because. Longest matching prefix wins.
 */
export function resolveParent(id, parentsMap) {
  if (!isCustom(id) || !parentsMap) return null;
  var best = null;
  var keys = Object.keys(parentsMap);
  for (var i = 0; i < keys.length; i++) {
    if (isAncestorOrSelf(keys[i], id) && (best === null || keys[i].length > best.length)) best = keys[i];
  }
  return best === null ? null : parentsMap[best];
}

/**
 * Glob match for mission skill lists: 'lit.phonics.*' matches any skill under
 * lit.phonics (and lit.phonics itself). A bare id matches only itself and its
 * descendants. This is the only wildcard form; anything cleverer is a trap.
 */
export function matchesGlob(glob, id) {
  if (glob.slice(-2) === '.*') return isAncestorOrSelf(glob.slice(0, -2), id);
  return isAncestorOrSelf(glob, id);
}

export function matchesAnyGlob(globs, id) {
  for (var i = 0; i < globs.length; i++) if (matchesGlob(globs[i], id)) return true;
  return false;
}

/** A short stable hash of a skill id for the wire — never the id itself. */
export function skillHash(id) {
  var h = 5381;
  for (var i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i);
  return (h >>> 0).toString(36);
}
