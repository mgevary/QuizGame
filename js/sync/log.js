/**
 * log.js — the event log, against localStorage.
 *
 * The log is the SOURCE OF TRUTH. Everything a player sees is a fold over it
 * (sync/fold.js), and the folded state in `quiz/derived.v1` is only a cache
 * that can be deleted at any moment and rebuilt.
 *
 * Chunked across several keys because some browsers cap a single value long
 * before they cap the whole origin, and because rewriting one 2MB string on
 * every answer is slow on an old iPad.
 */

import { readJSON, writeJSON, readRaw, writeRaw, removeKey } from '../store.js';
import { tick, observe as observeClock, zero } from './hlc.js';
import { make, validate } from './event.js';
import { fold } from './fold.js';
import { versionVector, mergeLogs } from './merge.js';

var DEVICE_KEY = 'quiz/device.v1';
var CHUNK_KEY = 'quiz/log.v1.';
var CHUNK_MAX = 400;          // events per chunk
var MAX_EVENTS = 60000;       // hard ceiling before compaction is forced

var device = null;
var events = null;
var clock = null;
var derived = null;
var dirty = true;

function newDeviceId() {
  return 'd' + Math.random().toString(36).slice(2, 6) + Date.now().toString(36).slice(-3);
}

export function getDevice() {
  if (device) return device;
  device = readJSON(DEVICE_KEY, null);
  if (!device || !device.deviceId) {
    device = { deviceId: newDeviceId(), campaignId: 'c' + Math.random().toString(36).slice(2, 8), paired: [], seq: 0 };
    writeJSON(DEVICE_KEY, device);
  }
  if (!device.paired) device.paired = [];
  return device;
}

function saveDevice() { writeJSON(DEVICE_KEY, device); }

export function load() {
  if (events) return events;
  getDevice();
  events = [];
  for (var i = 0; ; i++) {
    var chunk = readJSON(CHUNK_KEY + i, null);
    if (!chunk || !chunk.length) break;
    events = events.concat(chunk);
  }
  clock = zero(device.deviceId);
  for (var j = 0; j < events.length; j++) {
    if (events[j].hlc[0] > clock[0]) clock = [events[j].hlc[0], events[j].hlc[1], device.deviceId];
  }
  dirty = true;
  return events;
}

function persist() {
  var n = Math.ceil(events.length / CHUNK_MAX) || 1;
  for (var i = 0; i < n; i++) writeJSON(CHUNK_KEY + i, events.slice(i * CHUNK_MAX, (i + 1) * CHUNK_MAX));
  for (var k = n; k < n + 4; k++) removeKey(CHUNK_KEY + k);
}

/** Append a local event. Returns it. */
export function append(kind, userId, payload) {
  load();
  clock = tick(clock, Date.now(), device.deviceId);
  device.seq = (device.seq || 0) + 1;
  var e = make(device.deviceId, device.seq, clock, kind, userId, payload);
  var bad = validate(e);
  if (bad) { if (typeof console !== 'undefined') console.warn('refusing malformed event: ' + bad); return null; }
  events.push(e);
  saveDevice();
  persist();
  dirty = true;
  return e;
}

/** Absorb events from a peer. Idempotent, so it is safe to call repeatedly. */
export function absorb(incoming) {
  load();
  var before = events.length;
  events = mergeLogs(events, incoming.filter(function (e) { return validate(e) === null; }));
  for (var i = 0; i < incoming.length; i++) clock = observeClock(clock, incoming[i].hlc, Date.now(), device.deviceId);
  if (events.length !== before) { persist(); dirty = true; }
  return events.length - before;
}

export function all() { return load(); }
export function vector() { return versionVector(load()); }

/** The folded state. Cached until the log changes. */
export function state() {
  if (!dirty && derived) return derived;
  derived = fold(load());
  dirty = false;
  return derived;
}

export function invalidate() { dirty = true; }

export function isFull() { return load().length > MAX_EVENTS; }

/** Wipe everything on this device. Used by the parent gate's reset. */
export function wipe() {
  for (var i = 0; i < 200; i++) removeKey(CHUNK_KEY + i);
  removeKey(DEVICE_KEY);
  device = null; events = null; clock = null; derived = null; dirty = true;
}
