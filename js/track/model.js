/**
 * track/model.js — the race as pure state. PURE.
 *
 * A TrackModel is what every renderer draws and what the coordinator owns in
 * a match. Steps come from the fold's outcome maths (sync/fold.js STEPS) and
 * are simply added to a seat's position. Everything about "how a wrong
 * answer feels" is here as arithmetic: a position is never decreased.
 *
 * `teams` is an arbitrary map from the start, so N teams is renderer work.
 */

export var DEFAULT_LENGTH = 30;
export var CHECKPOINT_EVERY = 5;        // items per leg
export var CATCHUP_CAP = 0.15;          // of track length — beyond this the leader notices
export var ANTI_CARRY = { 2: 0.55, 3: 0.40 };   // max share of team distance one member may hold

export function createTrack(opts) {
  opts = opts || {};
  var length = opts.length || DEFAULT_LENGTH;
  var cps = [];
  for (var p = CHECKPOINT_EVERY; p < length; p += CHECKPOINT_EVERY) cps.push(p);
  return {
    length: length,
    theme: opts.theme || 'race',
    positions: {},            // seat -> fractional distance
    answered: {},             // seat -> items resolved this match
    catchup: {},              // seat -> catch-up distance granted so far
    checkpoints: cps,
    leg: 0,                   // current checkpoint index the pack is racing toward
    arrived: {},              // seat -> true when at the current checkpoint
    teams: opts.teams || null,
    finished: [],             // seats in finish order
    pits: {}                  // seat -> true while in remediation
  };
}

export function addSeat(track, seat) {
  if (!(seat in track.positions)) { track.positions[seat] = 0; track.answered[seat] = 0; track.catchup[seat] = 0; }
}

export function teamOf(track, seat) {
  if (!track.teams) return null;
  for (var t in track.teams) if (track.teams[t].indexOf(seat) !== -1) return t;
  return null;
}

/** Team distance is the sum of members, with the anti-carry cap applied. */
export function teamDistance(track, team) {
  var seats = track.teams[team] || [];
  var total = 0, max = 0;
  for (var i = 0; i < seats.length; i++) { var p = track.positions[seats[i]] || 0; total += p; if (p > max) max = p; }
  var cap = seats.length <= 2 ? ANTI_CARRY[2] : ANTI_CARRY[3];
  if (seats.length > 1 && total > 0 && max / total > cap) {
    // The strongest member's excess becomes cosmetic "overdrive", not distance.
    var allowed = cap * total;
    total = total - max + allowed;
  }
  return total;
}

/**
 * Apply a step delta for a seat. Never negative. The delta is what the
 * fold's stepsFor() produced on the player's own device.
 */
export function step(track, seat, delta) {
  addSeat(track, seat);
  var d = Math.max(0, delta || 0);
  track.positions[seat] = Math.min(track.length, track.positions[seat] + d);
  track.answered[seat] += 1;
  return track.positions[seat];
}

/**
 * Invisible catch-up (docs/PLAN.md §4.3): a trailing player's expected-success
 * target rises slightly, and at each checkpoint they get a small nudge —
 * capped at CATCHUP_CAP of the track in total. Returns the nudge granted.
 */
export function catchupAt(track, seat, leaderPos) {
  addSeat(track, seat);
  var gap = leaderPos - track.positions[seat];
  if (gap <= 0) return 0;
  var room = CATCHUP_CAP * track.length - track.catchup[seat];
  var nudge = Math.max(0, Math.min(room, gap * 0.25));
  track.catchup[seat] += nudge;
  track.positions[seat] = Math.min(track.length, track.positions[seat] + nudge);
  return nudge;
}

/** The trailing player's expected-success target: easier, still inside the ZPD. */
export function successTargetFor(track, seat) {
  var lead = leader(track);
  if (lead === null || lead === seat) return 0.82;
  var gap = track.positions[lead] - (track.positions[seat] || 0);
  return gap > track.length * 0.1 ? 0.88 : 0.82;
}

export function leader(track) {
  var best = null, bestP = -1;
  for (var s in track.positions) if (track.positions[s] > bestP) { bestP = track.positions[s]; best = s; }
  return best === null ? null : (isNaN(best) ? best : Number(best));
}

/**
 * Checkpoint regroup. A seat "arrives" when its answered count reaches the
 * leg's item count. When every seat has arrived, the pack moves to the next
 * leg. Returns true if the leg advanced.
 */
export function noteAnswered(track, seat) {
  var need = (track.leg + 1) * CHECKPOINT_EVERY;
  if (track.answered[seat] >= need) track.arrived[seat] = true;
  var seats = Object.keys(track.positions);
  for (var i = 0; i < seats.length; i++) if (!track.arrived[seats[i]] && track.finished.indexOf(Number(seats[i])) === -1) return false;
  track.leg += 1;
  track.arrived = {};
  return true;
}

/** How far a seat may be ahead of the pack: at most one leg. */
export function mayAdvance(track, seat) {
  return track.answered[seat] < (track.leg + 1) * CHECKPOINT_EVERY;
}

export function finish(track, seat) {
  if (track.finished.indexOf(seat) !== -1) return track.finished.indexOf(seat) + 1;
  track.finished.push(seat);
  return track.finished.length;
}

export function isFinished(track, seat) { return track.finished.indexOf(seat) !== -1; }

export function setPit(track, seat, on) { if (on) track.pits[seat] = true; else delete track.pits[seat]; }

/** For the tug renderer: signed difference of two team distances, normalised to [-1, 1]. */
export function tugPosition(track, teamA, teamB) {
  var a = teamDistance(track, teamA), b = teamDistance(track, teamB);
  return Math.max(-1, Math.min(1, (a - b) / track.length));
}
