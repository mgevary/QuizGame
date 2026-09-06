/**
 * event.js — event constructors and validation. PURE.
 *
 * Events are FACTS, never conclusions. "Ana answered item i7 wrong at this
 * clock" is an event. "Ana's box for i7 is now 0" is not — it is derived by
 * the fold. If you are tempted to add a kind that records a conclusion, that
 * is the bug: it would need merge logic, and the whole design rests on there
 * being none.
 *
 * Shape: { id: 'deviceId:seq', hlc: [wall, ctr, deviceId], k: kind, u: userId, ...payload }
 */

export var KINDS = ['ans', 'sess', 'prof', 'mod', 'art', 'role', 'mission', 'snap'];

export var OUTCOMES = ['first', 'review', 'remediated', 'assisted', 'wrong'];

/** Build an event. `clock` is the already-ticked HLC for this event. */
export function make(deviceId, seq, clock, kind, userId, payload) {
  var e = { id: deviceId + ':' + seq, hlc: clock, k: kind, u: userId || null };
  if (payload) {
    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i++) e[keys[i]] = payload[keys[i]];
  }
  return e;
}

export function deviceOf(e) { return e.id.split(':')[0]; }
export function seqOf(e) { return parseInt(e.id.split(':')[1], 10); }

/** @returns {string|null} an error, or null if the event is well-formed. */
export function validate(e) {
  if (!e || typeof e !== 'object') return 'not an object';
  if (typeof e.id !== 'string' || !/^[A-Za-z0-9_-]+:\d+$/.test(e.id)) return 'bad id';
  if (!Array.isArray(e.hlc) || e.hlc.length !== 3) return 'bad hlc';
  if (typeof e.hlc[0] !== 'number' || typeof e.hlc[1] !== 'number' || typeof e.hlc[2] !== 'string') return 'bad hlc parts';
  if (e.hlc[2] !== deviceOf(e)) return 'hlc device does not match id';
  if (KINDS.indexOf(e.k) === -1) return 'unknown kind ' + e.k;
  if (e.k === 'ans') {
    if (typeof e.item !== 'string' || typeof e.skill !== 'string') return 'ans needs item and skill';
    if (typeof e.diff !== 'number') return 'ans needs diff';
    if (OUTCOMES.indexOf(e.outcome) === -1) return 'ans has unknown outcome';
    if (typeof e.u !== 'string') return 'ans needs a user';
  }
  if (e.k === 'sess' && (e.op !== 'start' && e.op !== 'end')) return 'sess op must be start|end';
  if (e.k === 'snap' && (!Array.isArray(e.upTo) || !e.state)) return 'snap needs upTo and state';
  return null;
}

/* Typed payload helpers — keep the wire shape in one place. */

export function ansPayload(o) {
  return {
    item: o.item, skill: o.skill, diff: o.diff, outcome: o.outcome,
    assisted: !!o.assisted, rung: o.rung === undefined ? -1 : o.rung,
    ms: o.ms || 0, mod: o.mod || null, session: o.session || null,
    farm: !!o.farm
  };
}

export function sessPayload(op, o) {
  o = o || {};
  return { op: op, session: o.session, mode: o.mode || 'solo', seats: o.seats || 1, mission: o.mission || null };
}
