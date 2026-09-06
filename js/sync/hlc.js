/**
 * hlc.js — hybrid logical clock. PURE.
 *
 * Every event carries [wallMs, counter, deviceId]. Compared lexicographically
 * this gives a TOTAL order across devices that respects causality (an event
 * you saw before emitting yours always sorts before yours) while staying close
 * to wall-clock time, so a parent reading a log sees sensible timestamps.
 *
 * Why not just wall time: two devices' clocks disagree, and two events in the
 * same millisecond would tie. The ability model is Elo, which is order
 * dependent, so a tie would make the fold non-deterministic — devices would
 * disagree about a child's ability after merging identical logs.
 *
 * deviceId breaks every remaining tie, so compare() never returns 0 for two
 * distinct events. (Kulkarni, Demirbas, Madappa, Avva & Leone, 2014.)
 */

/** A clock that has never ticked. */
export function zero(deviceId) {
  return [0, 0, deviceId];
}

/** Advance the local clock for a new local event. */
export function tick(prev, nowMs, deviceId) {
  var wall = Math.max(nowMs, prev[0]);
  var ctr = wall === prev[0] ? prev[1] + 1 : 0;
  return [wall, ctr, deviceId];
}

/**
 * Advance the local clock having just received a remote event's clock, so the
 * next local event sorts after everything we have seen.
 */
export function observe(prev, remote, nowMs, deviceId) {
  var wall = Math.max(nowMs, prev[0], remote[0]);
  var ctr;
  if (wall === prev[0] && wall === remote[0]) ctr = Math.max(prev[1], remote[1]) + 1;
  else if (wall === prev[0]) ctr = prev[1] + 1;
  else if (wall === remote[0]) ctr = remote[1] + 1;
  else ctr = 0;
  return [wall, ctr, deviceId];
}

/** Total order. Only returns 0 for the same clock from the same device. */
export function compare(a, b) {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  if (a[2] === b[2]) return 0;
  return a[2] < b[2] ? -1 : 1;
}

/** Compact string form for keys and logs: "1757088000123.7.d3f2". */
export function toKey(hlc) {
  return hlc[0] + '.' + hlc[1] + '.' + hlc[2];
}

export function fromKey(key) {
  var parts = String(key).split('.');
  return [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, parts.slice(2).join('.')];
}
