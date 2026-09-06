/**
 * merge.js — version vectors, diffing, dedup and compaction. PURE.
 *
 * A version vector is {deviceId: highestSeq}. Because every device numbers
 * its own events 1, 2, 3… with no gaps, "what do you have that I don't" is a
 * comparison of two small maps, and the answer is exact.
 *
 * Every operation here is idempotent, commutative and order-independent —
 * which is what lets gossip run over any transport, repeatedly, in either
 * direction, and still converge.
 */

import { compare } from './hlc.js';
import { deviceOf, seqOf } from './event.js';

export function versionVector(events) {
  var vv = {};
  for (var i = 0; i < events.length; i++) {
    var d = deviceOf(events[i]), s = seqOf(events[i]);
    if (!(d in vv) || vv[d] < s) vv[d] = s;
  }
  return vv;
}

/** Events in `events` that a peer with `remoteVV` has not seen. */
export function diff(events, remoteVV) {
  var out = [];
  for (var i = 0; i < events.length; i++) {
    var d = deviceOf(events[i]);
    if (!(d in remoteVV) || seqOf(events[i]) > remoteVV[d]) out.push(events[i]);
  }
  return out;
}

/** Union by id, sorted by clock. Duplicates are dropped; input is not mutated. */
export function mergeLogs(a, b) {
  var seen = {};
  var out = [];
  var all = a.concat(b);
  for (var i = 0; i < all.length; i++) {
    if (seen[all[i].id]) continue;
    seen[all[i].id] = true;
    out.push(all[i]);
  }
  out.sort(function (x, y) { return compare(x.hlc, y.hlc); });
  return out;
}

/** Is every event in `sub` present in `sup`? */
export function contains(sup, sub) {
  var ids = {};
  for (var i = 0; i < sup.length; i++) ids[sup[i].id] = true;
  for (var j = 0; j < sub.length; j++) if (!ids[sub[j].id]) return false;
  return true;
}

/**
 * The stable frontier: for each device, the highest seq that EVERY known
 * paired device has. Events at or below it are safe to fold into a snapshot,
 * because nobody can ever ask for them again.
 *
 * @param {object[]} vvs  version vectors of every paired device, including our own
 */
export function stableFrontier(vvs) {
  if (!vvs.length) return {};
  var devices = {};
  for (var i = 0; i < vvs.length; i++) for (var d in vvs[i]) devices[d] = true;
  var out = {};
  for (var dev in devices) {
    var min = Infinity;
    for (var j = 0; j < vvs.length; j++) min = Math.min(min, vvs[j][dev] || 0);
    out[dev] = min;
  }
  return out;
}

export function isStable(e, frontier) {
  var d = deviceOf(e);
  return d in frontier && seqOf(e) <= frontier[d];
}

/**
 * Compact: fold every stable event into one `snap` event and drop them.
 * The snap is itself an ordinary event, so it replicates, and devices below
 * the frontier catch up from it instead of from the raw events.
 *
 * @param {object[]} events
 * @param {object}   frontier   from stableFrontier()
 * @param {function} foldFn     (events) → state
 * @param {function} makeSnap   (upToHlc, state) → snap event
 */
export function compact(events, frontier, foldFn, makeSnap) {
  var stable = [], rest = [];
  for (var i = 0; i < events.length; i++) (isStable(events[i], frontier) ? stable : rest).push(events[i]);
  if (!stable.length) return events;
  var sorted = stable.slice().sort(function (a, b) { return compare(a.hlc, b.hlc); });
  var upTo = sorted[sorted.length - 1].hlc;
  var snap = makeSnap(upTo, foldFn(stable));
  return [snap].concat(rest);
}
