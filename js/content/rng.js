/**
 * rng.js — seeded pseudo-random numbers. Ported from Maze's generator.
 *
 * Everything random in a match flows from one seed so that every device builds
 * the identical content, template items generate the identical problem, and
 * gap jitter in the scheduler is reproducible in tests. Lehmer / minstd: tiny,
 * fast, and good enough for shuffling and picking — not for anything
 * cryptographic, which nothing here needs.
 *
 * PURE: no DOM, no storage, no network.
 */

var MODULUS = 2147483647;      // 2^31 - 1
var MULTIPLIER = 48271;        // minstd

/** @returns {function(): number} a function yielding floats in [0, 1) */
export function makeRng(seed) {
  var state = (Math.abs(Math.floor(seed)) % (MODULUS - 1)) + 1;   // never 0
  return function () {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
}

/** Integer in [min, max] inclusive. */
export function rngInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Fisher–Yates on a copy; the input is never mutated. */
export function rngShuffle(rng, arr) {
  var out = arr.slice();
  for (var i = out.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

/** One element, or undefined for an empty array. */
export function rngPick(rng, arr) {
  if (!arr.length) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * A fresh seed for a new match or session. Derived from the clock and a
 * little Math.random so two matches started in the same millisecond differ.
 */
export function freshSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 2147483000)) >>> 0 || 1;
}

/** Hash a string to a positive 31-bit int — for deriving per-item seeds. */
export function hashSeed(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return (h % (MODULUS - 1)) + 1;
}
