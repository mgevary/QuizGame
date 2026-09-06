/**
 * fold.js — events → derived state. PURE.
 *
 * This is the only place state is computed. Given the same set of events,
 * every device produces byte-identical output, because:
 *   1. events are sorted into a TOTAL order by hybrid logical clock;
 *   2. every random choice (gap jitter) is seeded from the event's own id;
 *   3. nothing depends on wall-clock "now" — only on the clocks in the events.
 *
 * Nothing here is ever persisted as authoritative. The output is a cache.
 * test/fold.test.js asserts the convergence guarantee directly.
 */

import { compare } from './hlc.js';
import { makeRng, hashSeed } from '../content/rng.js';
import { observe as observeAbility } from '../learn/ability.js';
import { applyOutcome, emptyItemState } from '../learn/scheduler.js';

/** Track steps per outcome (docs/PLAN.md §4.3). Recovery pays most. */
export var STEPS = { first: 1.0, recovery: 1.2, review: 1.0, remediated: 0.7, assisted: 0.4, wrong: 0.0 };

export function emptyUser(id) {
  return {
    id: id, name: null, band: 'K', avatar: null, role: null,
    items: {}, skills: {}, sessions: [], session: 0, turn: 0,
    totals: { answered: 0, firstTry: 0, recovered: 0, steps: 0 }
  };
}

export function emptyState() {
  return { users: {}, modules: {}, missions: {}, art: [], applied: 0, last: null };
}

function user(state, id) {
  if (!id) return null;
  return state.users[id] || (state.users[id] = emptyUser(id));
}

function currentSession(u) {
  return u.sessions.length ? u.sessions[u.sessions.length - 1] : null;
}

/** Steps earned for one answer, given the item's state before it. */
export function stepsFor(outcome, prev, farm) {
  if (outcome === 'review' && prev.l > 0 && !prev.rec) return farm ? STEPS.review : STEPS.recovery;
  return STEPS[outcome] === undefined ? 0 : STEPS[outcome];
}

function applyAns(state, e, opts) {
  var u = user(state, e.u);
  if (!u) return;
  var prev = u.items[e.item] || emptyItemState();
  // The client says whether it thought this was a first exposure; the fold
  // decides from the item's real history so a confused client cannot skew
  // the schedule.
  var outcome = e.outcome;
  if (outcome === 'first' || outcome === 'review') outcome = prev.n === 0 ? 'first' : 'review';

  var ctx = {
    turn: u.turn, session: u.session, nowMs: e.hlc[0],
    rng: makeRng(hashSeed(e.id)),
    horizonDaysLeft: opts && opts.horizonDaysLeft ? opts.horizonDaysLeft(state, u, e) : undefined
  };
  var steps = stepsFor(outcome, prev, !!e.farm);
  var next = applyOutcome(prev, outcome, ctx, { rung: e.rung });
  u.items[e.item] = next;

  var parents = state.modules[e.mod] && state.modules[e.mod].parents;
  observeAbility(u.skills, e.skill, e.diff, outcome, u.band, parents, e.hlc[0]);

  u.turn += 1;
  u.totals.answered += 1;
  if (outcome === 'first') u.totals.firstTry += 1;
  if (outcome === 'review' && prev.l > 0 && !prev.rec) u.totals.recovered += 1;
  u.totals.steps += steps;
  var s = currentSession(u);
  if (s && !s.end) { s.turns += 1; s.steps += steps; if (outcome === 'review' && prev.l > 0 && !prev.rec) s.recovered.push(e.item); }
}

function applySess(state, e) {
  var u = user(state, e.u);
  if (!u) return;
  if (e.op === 'start') {
    u.session += 1;
    u.turn = 0;
    u.sessions.push({ id: e.session || e.id, start: e.hlc[0], end: null, mode: e.mode || 'solo', mission: e.mission || null, turns: 0, steps: 0, recovered: [] });
    if (u.sessions.length > 30) u.sessions.shift();
  } else {
    var s = currentSession(u);
    if (s && !s.end) s.end = e.hlc[0];
  }
}

function applyProf(state, e) {
  var u = user(state, e.u);
  if (!u) return;
  if (e.op === 'delete') { delete state.users[e.u]; return; }
  if (typeof e.name === 'string') u.name = e.name;
  if (typeof e.band === 'string') u.band = e.band;
  if (e.avatar !== undefined) u.avatar = e.avatar;
}

function applyMod(state, e) {
  var m = state.modules[e.moduleId] || (state.modules[e.moduleId] = { id: e.moduleId, version: 0, approved: false, removed: false, broken: {}, parents: null });
  if (e.op === 'install') { m.version = e.version || m.version; m.removed = false; if (e.parents) m.parents = e.parents; }
  if (e.op === 'approve') m.approved = true;
  if (e.op === 'remove') m.removed = true;
  if (e.op === 'flag' && e.item) m.broken[e.item] = true;
  if (e.op === 'unflag' && e.item) delete m.broken[e.item];
}

function applyMission(state, e) {
  if (e.op === 'archive') { if (state.missions[e.mid]) state.missions[e.mid].archived = true; return; }
  if (e.op === 'delete') { delete state.missions[e.mid]; return; }
  var m = state.missions[e.mid] || (state.missions[e.mid] = { id: e.mid, archived: false });
  var keys = ['title', 'kind', 'crew', 'skills', 'targetTheta', 'horizon', 'skin', 'weeklyTide', 'domains', 'createdAt'];
  for (var i = 0; i < keys.length; i++) if (e[keys[i]] !== undefined) m[keys[i]] = e[keys[i]];
  if (m.createdAt === undefined) m.createdAt = e.hlc[0];
}

function applyArt(state, e) {
  state.art.push({ id: e.id, u: e.u, kind: e.kind, ref: e.ref, at: e.hlc[0], strokes: e.strokes || null });
  if (state.art.length > 200) state.art.shift();
}

function applyRole(state, e) {
  var u = user(state, e.u);
  if (u) u.role = e.role;
}

/** Apply one event to state. Exported so the log can fold incrementally. */
export function apply(state, e, opts) {
  switch (e.k) {
    case 'ans': applyAns(state, e, opts); break;
    case 'sess': applySess(state, e); break;
    case 'prof': applyProf(state, e); break;
    case 'mod': applyMod(state, e); break;
    case 'mission': applyMission(state, e); break;
    case 'art': applyArt(state, e); break;
    case 'role': applyRole(state, e); break;
    case 'snap': break;   // handled in fold()
  }
  state.applied += 1;
  state.last = e.hlc;
  return state;
}

export function sortEvents(events) {
  return events.slice().sort(function (a, b) { return compare(a.hlc, b.hlc); });
}

/**
 * Fold a whole log. If a snapshot exists, start from the latest one and
 * apply only the events after it.
 */
export function fold(events, opts) {
  var sorted = sortEvents(events);
  var snap = null;
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].k === 'snap' && (snap === null || compare(sorted[i].upTo, snap.upTo) > 0)) snap = sorted[i];
  }
  var state = snap ? JSON.parse(JSON.stringify(snap.state)) : emptyState();
  for (var j = 0; j < sorted.length; j++) {
    var e = sorted[j];
    if (e.k === 'snap') continue;
    if (snap && compare(e.hlc, snap.upTo) <= 0) continue;
    apply(state, e, opts);
  }
  return state;
}

/** Stable serialisation for equality checks and tests. */
export function canonical(state) {
  return JSON.stringify(state, function (k, v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      var out = {}; var keys = Object.keys(v).sort();
      for (var i = 0; i < keys.length; i++) out[keys[i]] = v[keys[i]];
      return out;
    }
    return v;
  });
}
