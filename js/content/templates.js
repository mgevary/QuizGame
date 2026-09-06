/**
 * templates.js — whitelisted procedural item generators. PURE.
 *
 * Content may never carry code, so procedural items name a generator from
 * this list and pass an enum-only `constraint`. Anything unknown is rejected
 * at validation. Every generator draws from a seeded RNG, so the same seed
 * yields the same problem on every device — that is how a shared duel item
 * can go on the wire as an id + seed rather than as content.
 *
 * Each generator returns a fully-formed item body for a v1 type (mcq,
 * assemble, count, listen) so the item renderers need no special case.
 */

import { rngInt, rngShuffle, rngPick } from './rng.js';

export var CONSTRAINTS = ['carry', 'no-carry', 'borrow', 'no-borrow', 'exact-ten', 'within-10', 'within-20', 'within-100'];

function range(p, key, lo, hi) {
  var r = p && p[key];
  if (Array.isArray(r) && r.length === 2) return [r[0], r[1]];
  return [lo, hi];
}

function within(constraint) {
  if (constraint === 'within-10') return 10;
  if (constraint === 'within-20') return 20;
  if (constraint === 'within-100') return 100;
  return Infinity;
}

/** Distinct wrong answers near the right one, never negative, never equal. */
function numericDistractors(rng, answer, n, spread) {
  var out = [];
  var tries = 0;
  while (out.length < n && tries++ < 60) {
    var d = answer + (rng() < 0.5 ? -1 : 1) * rngInt(rng, 1, spread);
    if (d < 0 || d === answer || out.indexOf(d) !== -1) continue;
    out.push(d);
  }
  var k = 1;
  while (out.length < n) { var v = answer + k++ * 10; if (out.indexOf(v) === -1) out.push(v); }
  return out;
}

/**
 * Every numeric generator funnels through here, which dedupes distractors
 * against the answer and each other and tops up from near-misses. Doing it
 * once here means no individual generator can ship a duplicate option.
 */
function mcqFrom(rng, promptText, answer, distractors, misconception) {
  var want = distractors.length;
  var seen = {}; seen[String(answer)] = true;
  var clean = [];
  var all = distractors.concat(numericDistractors(rng, Number(answer), want + 6, 6));
  for (var k = 0; k < all.length && clean.length < want; k++) {
    var key = String(all[k]);
    if (seen[key] || Number(all[k]) < 0) continue;
    seen[key] = true; clean.push(all[k]);
  }
  var opts = [{ v: String(answer), correct: true }];
  for (var i = 0; i < clean.length; i++) opts.push({ v: String(clean[i]), misconception: misconception || 'near-miss' });
  return { type: 'mcq', prompt: { text: promptText, tts: true }, options: rngShuffle(rng, opts), shuffle: false };
}

var GENS = {};

GENS.add = function (rng, p) {
  var a = range(p, 'a', 1, 9), b = range(p, 'b', 1, 9);
  var lim = within(p.constraint);
  var x, y, tries = 0;
  do {
    x = rngInt(rng, a[0], a[1]); y = rngInt(rng, b[0], b[1]);
    var carry = (x % 10) + (y % 10) >= 10;
    var ok = x + y <= lim;
    if (p.constraint === 'carry') ok = ok && carry;
    if (p.constraint === 'no-carry') ok = ok && !carry;
    if (p.constraint === 'exact-ten') ok = ok && (x + y === 10);
  } while (!ok && tries++ < 200);
  var ans = x + y;
  return mcqFrom(rng, x + ' + ' + y + ' = ?', ans, numericDistractors(rng, ans, (p.choices || 4) - 1, 3), 'arith-slip');
};

GENS.sub = function (rng, p) {
  var a = range(p, 'a', 1, 20), b = range(p, 'b', 1, 9);
  var x, y, tries = 0;
  do {
    x = rngInt(rng, a[0], a[1]); y = rngInt(rng, b[0], b[1]);
    var borrow = (x % 10) < (y % 10);
    var ok = x >= y;                                   // never negative
    if (p.constraint === 'borrow') ok = ok && borrow;
    if (p.constraint === 'no-borrow') ok = ok && !borrow;
  } while (!ok && tries++ < 200);
  if (x < y) { var t = x; x = y; y = t; }
  var ans = x - y;
  return mcqFrom(rng, x + ' − ' + y + ' = ?', ans, numericDistractors(rng, ans, (p.choices || 4) - 1, 3), 'arith-slip');
};

GENS.mul = function (rng, p) {
  var a = range(p, 'a', 2, 9), b = range(p, 'b', 2, 9);
  var x = rngInt(rng, a[0], a[1]), y = rngInt(rng, b[0], b[1]);
  var ans = x * y;
  // The classic distractors for a times-table fact are the neighbours in the
  // same table, which is exactly the confusion a child actually has.
  var want = (p.choices || 4) - 1;
  var ds = [];
  var cands = [x * (y + 1), x * (y - 1), (x + 1) * y, (x - 1) * y];
  for (var i = 0; i < cands.length; i++) {
    if (cands[i] > 0 && cands[i] !== ans && ds.indexOf(cands[i]) === -1) ds.push(cands[i]);
  }
  var extra = numericDistractors(rng, ans, want + 4, 6);
  for (var j = 0; j < extra.length && ds.length < want; j++) if (ds.indexOf(extra[j]) === -1) ds.push(extra[j]);
  return mcqFrom(rng, x + ' × ' + y + ' = ?', ans, ds.slice(0, want), 'adjacent-fact');
};

GENS.div = function (rng, p) {
  var a = range(p, 'a', 2, 9), b = range(p, 'b', 2, 9);
  var q = rngInt(rng, a[0], a[1]), d = rngInt(rng, b[0], b[1]);
  var x = q * d;                                       // always exact
  return mcqFrom(rng, x + ' ÷ ' + d + ' = ?', q, numericDistractors(rng, q, (p.choices || 4) - 1, 2), 'arith-slip');
};

GENS.compare = function (rng, p) {
  var a = range(p, 'a', 0, 20);
  var x = rngInt(rng, a[0], a[1]), y = rngInt(rng, a[0], a[1]);
  while (y === x) y = rngInt(rng, a[0], a[1]);
  var big = Math.max(x, y);
  return { type: 'mcq', prompt: { text: 'Which is more?', tts: true },
    options: rngShuffle(rng, [{ v: String(big), correct: true }, { v: String(Math.min(x, y)), misconception: 'less-is-more' }]), shuffle: false };
};

GENS.count = function (rng, p) {
  var a = range(p, 'a', 1, 5);
  var n = rngInt(rng, a[0], a[1]);
  var items = ['🍎', '⭐', '🐟', '🚗', '🎈', '🐞'];
  var body = { type: 'count', prompt: { text: 'How many?', tts: true }, n: n, item: rngPick(rng, items) };
  if (p.choices) body.choices = rngShuffle(rng, [n].concat(numericDistractors(rng, n, p.choices - 1, 2)));
  return body;
};

GENS.sequence = function (rng, p) {
  var a = range(p, 'a', 1, 20);
  var step = p.step || rngPick(rng, [1, 2, 5, 10]);
  var start = rngInt(rng, a[0], a[1]);
  var seq = [start, start + step, start + 2 * step];
  var ans = start + 3 * step;
  return mcqFrom(rng, seq.join(', ') + ', ?', ans, [ans - step + 1, ans + 1, ans + step], 'pattern-slip');
};

GENS['missing-number'] = function (rng, p) {
  var a = range(p, 'a', 1, 9), b = range(p, 'b', 1, 9);
  var x = rngInt(rng, a[0], a[1]), y = rngInt(rng, b[0], b[1]);
  return mcqFrom(rng, x + ' + ? = ' + (x + y), y, numericDistractors(rng, y, (p.choices || 4) - 1, 3), 'inverse-slip');
};

GENS['letter-recognize'] = function (rng, p) {
  var letters = (p.letters && p.letters.length ? p.letters : 'abcdefghijklmnopqrstuvwxyz'.split(''));
  var upper = p.case !== 'lower';
  var target = rngPick(rng, letters);
  var pool = letters.filter(function (l) { return l !== target; });
  var ds = rngShuffle(rng, pool).slice(0, (p.choices || 3) - 1);
  var f = function (l) { return upper ? l.toUpperCase() : l; };
  return { type: 'listen', prompt: { text: 'Find the letter ' + f(target), tts: f(target) },
    options: rngShuffle(rng, [{ v: f(target), correct: true }].concat(ds.map(function (l) { return { v: f(l), misconception: 'letter-confusion' }; }))), shuffle: false };
};

GENS['spell-from-list'] = function (rng, p) {
  var words = p.words || [];
  if (!words.length) return null;
  var w = rngPick(rng, words);
  var tiles = w.split('');
  var extras = 'aeioutsrnl'.split('').filter(function (c) { return tiles.indexOf(c) === -1; });
  tiles = tiles.concat(rngShuffle(rng, extras).slice(0, 2));
  return { type: 'assemble', prompt: { text: 'Build the word: ' + w, tts: w }, tiles: rngShuffle(rng, tiles), answer: w };
};

export var GENERATORS = Object.keys(GENS);

export function isGenerator(name) { return GENS.hasOwnProperty(name); }

/**
 * Instantiate a template item. Returns a concrete item body merged with the
 * template's id/skill/difficulty/band/remediation, or null if the generator
 * is unknown (the validator will already have rejected it).
 */
export function generate(templateItem, rng) {
  var g = GENS[templateItem.gen];
  if (!g) return null;
  var body = g(rng, templateItem.params || {});
  if (!body) return null;
  body.id = templateItem.id;
  body.skill = templateItem.skill;
  body.difficulty = templateItem.difficulty;
  body.band = templateItem.band;
  body.generatedFrom = templateItem.id;
  if (templateItem.remediation) body.remediation = templateItem.remediation;
  return body;
}
