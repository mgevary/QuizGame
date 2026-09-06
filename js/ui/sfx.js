/**
 * sfx.js — the game's sounds, synthesised rather than shipped.
 *
 * Web Audio means no files, nothing to download and nothing to precache, and
 * every sound can be tuned by changing a number. For a two-year-old sound is
 * half the feedback; for everyone else it is most of what makes a thing feel
 * finished rather than assembled.
 *
 * Two rules, both from how a wrong answer is meant to feel:
 *   • There is NO buzzer, and no falling "wrong" sting. A mistake gets a warm
 *     low tone, because a pit stop is a repair job and not a failure.
 *   • Recovery gets the brightest sound in the game — brighter than winning.
 */

import { getPrefs } from './music.js';

var ctx = null;
var master = null;

function audio() {
  if (ctx) return ctx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18;      // the whole set sits well under the music
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
  return ctx;
}

/** iOS will not start an audio context outside a gesture. Called from taps. */
export function unlock() {
  var c = audio();
  if (c && c.state === 'suspended') c.resume().catch(function () {});
}

function tone(freq, start, dur, type, peak) {
  var c = audio();
  if (!c) return;
  var osc = c.createOscillator();
  var gain = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  // A short attack and an exponential tail: a raw square gate clicks, and a
  // click is the one thing that makes a synthesised sound feel cheap.
  gain.gain.setValueAtTime(0.0001, c.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(peak === undefined ? 0.6 : peak, c.currentTime + start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.02);
}

function sweep(from, to, start, dur, type) {
  var c = audio();
  if (!c) return;
  var osc = c.createOscillator();
  var gain = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(from, c.currentTime + start);
  osc.frequency.exponentialRampToValueAtTime(to, c.currentTime + start + dur);
  gain.gain.setValueAtTime(0.0001, c.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.5, c.currentTime + start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.02);
}

var A4 = 440;
function note(semitonesFromA4) { return A4 * Math.pow(2, semitonesFromA4 / 12); }

var SOUNDS = {
  tick: function () { tone(note(-9), 0, 0.06, 'square', 0.35); },
  tickHigh: function () { tone(note(-2), 0, 0.07, 'square', 0.4); },
  go: function () { tone(note(0), 0, 0.12, 'triangle'); tone(note(7), 0.09, 0.22, 'triangle'); },

  correct: function () { tone(note(4), 0, 0.10, 'sine'); tone(note(11), 0.07, 0.20, 'sine', 0.45); },

  // Recovery is the brightest sound in the game, on purpose. Turning a
  // mistake into a know is the thing this whole app is for.
  recovery: function () {
    tone(note(4), 0, 0.10, 'triangle');
    tone(note(9), 0.08, 0.10, 'triangle');
    tone(note(16), 0.16, 0.34, 'triangle', 0.55);
  },

  // Never a buzzer. Warm, low, brief: something to fix, not something lost.
  pit: function () { tone(note(-14), 0, 0.22, 'sine', 0.4); tone(note(-19), 0.05, 0.26, 'sine', 0.3); },

  boost: function () { sweep(note(-5), note(19), 0, 0.28, 'triangle'); },
  checkpoint: function () { tone(note(4), 0, 0.10, 'triangle'); tone(note(9), 0.08, 0.10, 'triangle'); tone(note(12), 0.16, 0.26, 'triangle'); },
  finish: function () {
    [0, 4, 7, 12].forEach(function (n, i) { tone(note(n), i * 0.09, 0.34, 'triangle', 0.5); });
  },
  cheer: function () { sweep(note(7), note(14), 0, 0.16, 'sine'); },
  tap: function () { tone(note(2), 0, 0.04, 'sine', 0.25); }
};

export function play(name) {
  if (!getPrefs().soundOn) return;
  var fn = SOUNDS[name];
  if (fn) { unlock(); try { fn(); } catch (e) { /* sound is never load-bearing */ } }
}

export var SOUND_NAMES = Object.keys(SOUNDS);

/**
 * Haptics. Free on Android and desktop Chrome, absent on iOS Safari — which
 * is a shame, because the countdown is where it matters most.
 */
export function buzz(pattern) {
  if (!getPrefs().soundOn) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

export var HAPTIC = {
  tick: 12,
  correct: 14,
  recovery: [12, 40, 12],
  pit: 26,
  checkpoint: [22, 40, 22],
  boost: [10, 30, 10]
};
