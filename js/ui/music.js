/**
 * music.js — the background music bed.
 *
 * One reused <audio> element, so switching screens never leaks elements. The
 * default volume is deliberately VERY low: this plays in a room where a
 * grown-up is usually sitting next to the child, often talking to them about
 * the question, and music that has to be talked over is music that gets
 * switched off for good on the first evening.
 *
 * Tracks are never precached — 11MB would make a first visit wait for
 * something the game does not need — but they are cached as they play, in a
 * cache that survives deploys, because the tracks themselves never change.
 */

import { readJSON, writeJSON } from '../store.js';

export var TRACKS = ['drift', 'marigold', 'parade', 'moonbeam', 'ballad', 'lanterns', 'runner', 'amble'];

/**
 * Six percent. Loud enough to notice in a quiet room, quiet enough that
 * nobody has to raise their voice over it. Anything higher tested as
 * "please turn that off".
 */
export var DEFAULT_VOLUME = 0.06;
export var MAX_VOLUME = 0.5;

var KEY = 'quiz/audio.v1';
var el = null;
var current = null;
var pendingPlay = false;

function prefs() {
  var p = readJSON(KEY, {});
  return {
    musicVolume: typeof p.musicVolume === 'number' ? p.musicVolume : DEFAULT_VOLUME,
    musicOn: p.musicOn !== false,
    soundOn: p.soundOn !== false
  };
}

function save(next) {
  var p = prefs();
  for (var k in next) p[k] = next[k];
  writeJSON(KEY, p);
  return p;
}

export function getPrefs() { return prefs(); }

export function setMusicVolume(v) {
  var clamped = Math.max(0, Math.min(MAX_VOLUME, v));
  save({ musicVolume: clamped });
  if (el) el.volume = clamped;
  return clamped;
}

export function setMusicOn(on) {
  save({ musicOn: !!on });
  if (!on) stop(); else if (current) play(current);
  return !!on;
}

export function setSoundOn(on) { save({ soundOn: !!on }); return !!on; }

function element() {
  if (el) return el;
  el = new Audio();
  el.loop = true;
  el.preload = 'none';
  el.volume = prefs().musicVolume;
  return el;
}

/** A track chosen from a seed, so one game keeps one tune throughout. */
export function trackForSeed(seed) {
  return TRACKS[Math.abs(seed | 0) % TRACKS.length];
}

export function play(name) {
  var p = prefs();
  current = name;
  if (!p.musicOn) return;
  var a = element();
  var src = 'audio/' + name + '.mp3';
  if (a.getAttribute('data-track') !== name) {
    a.setAttribute('data-track', name);
    a.src = src;
  }
  a.volume = p.musicVolume;
  var started = a.play();
  // Browsers refuse audio before a gesture. Remember, and start on the next tap.
  if (started && started.catch) started.catch(function () { pendingPlay = true; });
}

/** Called from any tap, so a refused autoplay recovers without asking. */
export function nudgeAfterGesture() {
  if (!pendingPlay || !current) return;
  pendingPlay = false;
  play(current);
}

export function stop() {
  if (!el) return;
  try { el.pause(); } catch (e) {}
}

export function fadeOut(ms) {
  if (!el || el.paused) return;
  var from = el.volume;
  var start = Date.now();
  var iv = setInterval(function () {
    var t = (Date.now() - start) / (ms || 600);
    if (t >= 1) { clearInterval(iv); stop(); el.volume = from; return; }
    el.volume = from * (1 - t);
  }, 40);
}
