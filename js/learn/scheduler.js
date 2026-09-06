/**
 * scheduler.js — the two-clock Leitner scheduler. PURE.
 *
 * SM-2 is the wrong tool: its intervals are days, and a session is 10–20
 * minutes. So there are two clocks. Boxes 0–3 are measured in TURNS (items
 * this player has resolved this session) and boxes 4–6 in SESSIONS plus a
 * wall-clock floor, so a child who plays twice in one evening does not burn
 * through a week of reviews.
 *
 * Boxes 4–6 are where the durable learning lives, and they only ever fire on
 * a different day. That is why the Mission exists: "come back tomorrow" is a
 * learning requirement here, not a business metric.
 *
 * Everything here is a pure function of (ItemState, outcome, context). The
 * fold calls applyOutcome on every `ans` event in HLC order, so the same log
 * produces the same schedule on every device.
 */

export var BOX_GAPS = [
  { box: 0, scope: 'session', gapTurns: 2 },    // just failed — come back fast
  { box: 1, scope: 'session', gapTurns: 5 },
  { box: 2, scope: 'session', gapTurns: 12 },
  { box: 3, scope: 'session', gapTurns: 25 },   // often lands next session
  { box: 4, scope: 'cross', gapSessions: 1, minHours: 20 },
  { box: 5, scope: 'cross', gapSessions: 3, minHours: 72 },
  { box: 6, scope: 'cross', gapSessions: 8, minHours: 240 }   // effectively retired
];
export var MAX_BOX = BOX_GAPS.length - 1;

/** Box-6 items still surface occasionally so retirement is never total. */
export var OLD_FRIEND_RATE = 0.03;

/** Overdue this many turns and the picker serves it regardless of interleave. */
export var HARD_DUE_TURNS = 4;

var HOUR = 3600000;

export function emptyItemState() {
  return { b: 0, dt: 0, ds: 0, dh: 0, l: 0, r: -1, ft: null, a: false, rec: false, n: 0, t: 0 };
}

/**
 * Seeded jitter so the child cannot learn the rhythm ("the one I got wrong
 * always comes back third"). 0.8–1.2×.
 */
export function jitter(gap, rng) {
  return Math.max(1, Math.round(gap * (0.8 + 0.4 * rng())));
}

/**
 * Compute the next due clocks for a box.
 * @param {object} ctx {turn, session, nowMs, rng, horizonDaysLeft?}
 */
export function dueFor(box, ctx) {
  var g = BOX_GAPS[Math.max(0, Math.min(MAX_BOX, box))];
  if (g.scope === 'session') {
    return { dt: ctx.turn + jitter(g.gapTurns, ctx.rng), ds: ctx.session, dh: 0 };
  }
  var sessions = g.gapSessions;
  var hours = g.minHours;
  // Horizon mode (goal missions): cap every cross-session gap so each skill
  // gets at least one review before the exam. Cepeda 2008: optimal gap is
  // roughly 10–20% of the retention interval, and here the interval is known.
  if (typeof ctx.horizonDaysLeft === 'number') {
    var maxDays = Math.max(1, ctx.horizonDaysLeft * 0.20);
    hours = Math.min(hours, maxDays * 24);
    sessions = Math.min(sessions, Math.max(1, Math.round(maxDays)));
  }
  return { dt: 0, ds: ctx.session + sessions, dh: ctx.nowMs + hours * HOUR };
}

/**
 * Apply one resolved answer to an item's state. Returns a NEW state; the
 * input is not mutated (the fold owns the map and swaps entries).
 *
 * outcome: 'first' | 'review' | 'remediated' | 'assisted' | 'wrong'
 *   first      — correct, and this was the item's first ever exposure
 *   review     — correct on a scheduled review (may or may not have failed before)
 *   remediated — correct after the teach → generate loop
 *   assisted   — only got there via the assisted-success exit
 *   wrong      — wrong, not recovered this turn
 */
export function applyOutcome(prev, outcome, ctx, opts) {
  opts = opts || {};
  var s = {
    b: prev.b, dt: prev.dt, ds: prev.ds, dh: prev.dh, l: prev.l, r: prev.r,
    ft: prev.ft, a: prev.a, rec: prev.rec, n: prev.n + 1, t: ctx.nowMs
  };
  var firstEver = prev.n === 0;
  if (firstEver) s.ft = outcome === 'first' || outcome === 'review';

  if (outcome === 'first' || outcome === 'review') {
    // Correct on first exposure skips to box 2: don't waste session time
    // drilling what is already known. Otherwise, climb one.
    s.b = firstEver ? 2 : Math.min(MAX_BOX, prev.b + 1);
  } else if (outcome === 'remediated') {
    s.b = Math.max(0, Math.min(1, prev.b));   // recovered in-loop: back to the start of the ladder
  } else if (outcome === 'assisted') {
    s.b = 0; s.a = true;
  } else {
    s.b = Math.max(0, prev.b - 2); s.l = prev.l + 1;
  }
  if (typeof opts.rung === 'number') s.r = opts.rung;

  // The recovery bonus (docs/PLAN.md §4.3) is paid ONCE per item ever, so
  // deliberately failing an item to farm it is dominated by honest play.
  if (outcome === 'review' && prev.l > 0 && !prev.rec) s.rec = true;

  var due = dueFor(s.b, ctx);
  s.dt = due.dt; s.ds = due.ds; s.dh = due.dh;
  return s;
}

/** Is this item due now? */
export function isDue(item, ctx) {
  if (item.n === 0) return false;
  var g = BOX_GAPS[Math.min(MAX_BOX, item.b)];
  if (g.scope === 'session') return item.ds === ctx.session && ctx.turn >= item.dt;
  return ctx.session >= item.ds && ctx.nowMs >= item.dh;
}

/** Turns overdue for session-scope items, else 0. Drives the hard-due rule. */
export function overdueTurns(item, ctx) {
  var g = BOX_GAPS[Math.min(MAX_BOX, item.b)];
  if (g.scope !== 'session' || item.ds !== ctx.session) return 0;
  return Math.max(0, ctx.turn - item.dt);
}

/**
 * A session-scope due that was never served (the session ended) must not be
 * lost: on a new session it becomes due immediately. Called by the picker for
 * items whose ds is behind the current session.
 */
export function carriedOver(item, ctx) {
  var g = BOX_GAPS[Math.min(MAX_BOX, item.b)];
  return item.n > 0 && g.scope === 'session' && item.ds < ctx.session;
}

/** Was this item ever failed and later recovered? Feeds "turned into knows". */
export function isRecovered(item) {
  return item.l > 0 && item.rec === true;
}

/** Retired-but-known: gold on the map. */
export function isMastered(item) {
  return item.b >= 6 || (item.b >= 4 && item.l === 0 && item.ft === true);
}

/** Cross-session review pending: the "shimmer" on a map landmark. */
export function isShimmering(item, ctx) {
  return item.b >= 4 && item.b < 6 && isDue(item, ctx);
}
