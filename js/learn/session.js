/**
 * session.js — the item picker and the session queue. PURE.
 *
 * This is where the learning model becomes a sequence of questions. The
 * picker's job, in one line: serve the item that is most worth answering
 * right now, at a difficulty where this child succeeds about 85% of the time.
 *
 * Precedence (docs/PLAN.md §4.2):
 *   1. anything overdue by >= 4 turns          — nothing may starve
 *   2. a due review passing the interleave     — weakest box first
 *   3. a fresh item with expected success in [0.75, 0.90]
 *   4. the same, widened to [0.6, 0.95]
 *   5. a template-generated item               — the picker NEVER starves
 *
 * The interleave constraint (Rohrer & Taylor) refuses an item whose skill
 * shares a family with the last few served, unless it is a box-0 immediate
 * review. It relaxes rather than starving.
 */

import { familyKey, matchesAnyGlob, isAncestorOrSelf } from '../content/skills.js';
import { bandAllowsType, bandAtLeast } from '../content/bands.js';
import { expected, thetaFor, isStruggling } from './ability.js';
import { emptyItemState, isDue, overdueTurns, carriedOver, HARD_DUE_TURNS, OLD_FRIEND_RATE, MAX_BOX } from './scheduler.js';

export var RECENT_WINDOW = 3;
export var TARGET_BAND = [0.75, 0.90];
export var WIDE_BAND = [0.60, 0.95];

export function createQueue(opts) {
  return {
    turn: 0,
    session: opts.session,
    seed: opts.seed,
    band: opts.band,
    recent: [],                    // family keys of the last few served
    servedThisSession: {},
    remediationsUsed: 0,
    maxRemediations: opts.maxRemediations === undefined ? 6 : opts.maxRemediations,
    suspended: {},                 // skill -> true, from prerequisite backoff
    successTarget: opts.successTarget || 0.82
  };
}

/** Remediation is capped per session so a bad day is not 15 minutes of teaching. */
export function mayRemediate(q) { return q.remediationsUsed < q.maxRemediations; }
export function noteRemediation(q) { q.remediationsUsed += 1; }

function playable(item, band, ctx) {
  if (item.hidden) return false;
  if (ctx.broken && ctx.broken[item.id]) return false;
  if (item.band && !bandAtLeast(band, item.band)) return false;
  return bandAllowsType(band, item.type);
}

function interleaveOk(q, skill, relax) {
  if (relax >= 2) return true;
  var fam = familyKey(skill);
  var look = relax === 1 ? 1 : RECENT_WINDOW;
  for (var i = Math.max(0, q.recent.length - look); i < q.recent.length; i++) {
    if (q.recent[i] === fam) return false;
  }
  return true;
}

/**
 * Prerequisite backoff (docs/PLAN.md §5.4). A skill whose moving average has
 * collapsed is suspended for the session and its prerequisites substituted,
 * framed to the child as a detour rather than a demotion.
 */
export function updateSuspensions(q, skills, items) {
  // Only ever suspend a LEAF skill. The ability model writes a moving average
  // at every ancestor prefix, so suspending on the ancestor's average would
  // let one bad times-table fact suspend the whole of numeracy and leave the
  // picker with nothing to serve.
  var isLeaf = {};
  for (var id in skills) isLeaf[id] = true;
  for (var a in skills) {
    var anc = a.split('.');
    for (var n = 1; n < anc.length; n++) isLeaf[anc.slice(0, n).join('.')] = false;
  }
  for (var id2 in skills) {
    if (isLeaf[id2] && isStruggling(skills, id2)) q.suspended[id2] = true;
  }
  for (var itemId in items) {
    if (items[itemId].l >= 3) q.suspendedItems = q.suspendedItems || {}, q.suspendedItems[itemId] = true;
  }
  return q;
}

function isSuspended(q, skill) {
  for (var s in q.suspended) if (isAncestorOrSelf(s, skill)) return true;
  return false;
}

/**
 * @param {object} ctx {pool, items, skills, nowMs, rng, broken, parents, missionSkills}
 *   pool  — every candidate item (already resolved from installed modules)
 *   items — ItemState map;  skills — SkillState map
 * @returns {object|null} {item, reason} — null only if the pool is empty
 */
export function pick(q, ctx) {
  var band = q.band;
  var pool = [];
  for (var i = 0; i < ctx.pool.length; i++) {
    var it = ctx.pool[i];
    if (!playable(it, band, ctx)) continue;
    if (ctx.missionSkills && ctx.missionSkills.length && !matchesAnyGlob(ctx.missionSkills, it.skill)) continue;
    pool.push(it);
  }
  if (!pool.length) return null;

  var sctx = { turn: q.turn, session: q.session, nowMs: ctx.nowMs, rng: ctx.rng };
  var due = [], hard = [], fresh = [], seen = [];

  for (var j = 0; j < pool.length; j++) {
    var item = pool[j];
    var st = ctx.items[item.id];
    if (!st || st.n === 0) { fresh.push(item); continue; }
    if (q.suspendedItems && q.suspendedItems[item.id]) continue;
    seen.push(item);
    if (carriedOver(st, sctx) || isDue(st, sctx)) {
      // Box 6 is retired: it resurfaces only as a rare "old friend".
      if (st.b >= MAX_BOX && ctx.rng() > OLD_FRIEND_RATE) continue;
      due.push(item);
      if (overdueTurns(st, sctx) >= HARD_DUE_TURNS) hard.push(item);
    }
  }

  // 1. Hard-due: nothing may starve, interleave or not.
  if (hard.length) return serve(q, byWeakestBox(hard, ctx.items), 'hard-due');

  // 2. A due review, weakest box first, respecting interleave (relaxing rather
  //    than starving). A box-0 item is an immediate re-ask and is exempt.
  for (var relax = 0; relax <= 2; relax++) {
    var ok = [];
    for (var k = 0; k < due.length; k++) {
      var s2 = ctx.items[due[k].id];
      if (s2.b === 0 || interleaveOk(q, due[k].skill, relax)) ok.push(due[k]);
    }
    if (ok.length) return serve(q, byWeakestBox(ok, ctx.items), 'review');
  }

  // 3 & 4. A fresh item inside the target success band, then widened.
  var bands = [TARGET_BAND, WIDE_BAND];
  for (var b = 0; b < bands.length; b++) {
    for (var r2 = 0; r2 <= 2; r2++) {
      var cands = [];
      for (var m = 0; m < fresh.length; m++) {
        var f = fresh[m];
        if (isSuspended(q, f.skill)) continue;
        if (!interleaveOk(q, f.skill, r2)) continue;
        var p = expected(thetaFor(ctx.skills, f.skill, band, ctx.parents), f.difficulty);
        if (p >= bands[b][0] && p <= bands[b][1]) cands.push({ item: f, p: p });
      }
      if (cands.length) {
        cands.sort(function (x, y) { return Math.abs(x.p - q.successTarget) - Math.abs(y.p - q.successTarget); });
        return serve(q, cands[0].item, b === 0 ? 'fresh' : 'fresh-wide');
      }
    }
  }

  // 5. Nothing sat inside a success band — which is normal for a brand new
  //    learner, whose estimate is exactly the difficulty of the items we
  //    authored for their band. Serve the fresh item NEAREST the target
  //    instead of giving up, still respecting interleave where it can.
  for (var r3 = 0; r3 <= 2; r3++) {
    var near = [];
    for (var n2 = 0; n2 < fresh.length; n2++) {
      if (isSuspended(q, fresh[n2].skill)) continue;
      if (!interleaveOk(q, fresh[n2].skill, r3)) continue;
      near.push(fresh[n2]);
    }
    if (near.length) return serve(q, nearestDifficulty(near, ctx, band, q.successTarget), 'fresh-nearest');
  }

  // 6. A template can be generated at any difficulty, so it never starves.
  var tmpl = [];
  for (var t = 0; t < pool.length; t++) if (pool[t].type === 'template' && !isSuspended(q, pool[t].skill)) tmpl.push(pool[t]);
  if (tmpl.length) return serve(q, nearestDifficulty(tmpl, ctx, band, q.successTarget), 'template');

  // 7. Last resorts, ignoring EVERY suspension. Prerequisite backoff is a
  //    safety valve, and on a small pool it can suspend the whole thing;
  //    being asked something slightly too hard beats being asked nothing.
  //
  //    But there is one thing the last resort must never do: hand back a
  //    question this player already answered this session and that is not
  //    due. "It asked me the same thing again" is the fastest way to lose a
  //    child's trust in the game. So the order is: any template, any fresh
  //    item, any DUE item — and if none of those exist, the honest answer is
  //    null, and the session ends with everything done.
  var anyTmpl = [], anyFresh = [], anyDue = [];
  for (var f2 = 0; f2 < pool.length; f2++) {
    var it2 = pool[f2];
    var st2 = ctx.items[it2.id];
    if (it2.type === 'template') anyTmpl.push(it2);
    else if (!st2 || st2.n === 0) anyFresh.push(it2);
    else if (carriedOver(st2, sctx) || isDue(st2, sctx)) anyDue.push(it2);
  }
  if (anyTmpl.length) return serve(q, nearestDifficulty(anyTmpl, ctx, band, q.successTarget), 'template-any');
  if (anyFresh.length) return serve(q, nearestDifficulty(anyFresh, ctx, band, q.successTarget), 'fresh-any');
  if (anyDue.length) return serve(q, byWeakestBox(anyDue, ctx.items), 'due-any');
  return null;
}

function serve(q, item, reason) {
  q.recent.push(familyKey(item.skill));
  if (q.recent.length > RECENT_WINDOW * 2) q.recent.shift();
  q.servedThisSession[item.id] = (q.servedThisSession[item.id] || 0) + 1;
  return { item: item, reason: reason };
}

function byWeakestBox(list, items) {
  var best = list[0], bestB = items[best.id].b;
  for (var i = 1; i < list.length; i++) {
    var b = items[list[i].id].b;
    if (b < bestB) { best = list[i]; bestB = b; }
  }
  return best;
}

function nearestDifficulty(list, ctx, band, target) {
  var best = list[0], bestD = Infinity;
  for (var i = 0; i < list.length; i++) {
    var p = expected(thetaFor(ctx.skills, list[i].skill, band, ctx.parents), list[i].difficulty);
    var d = Math.abs(p - target);
    if (d < bestD) { best = list[i]; bestD = d; }
  }
  return best;
}

/** Called after an answer is folded, to advance the queue's own clock. */
export function advance(q) { q.turn += 1; return q; }

/** The prove-it item for a failed item: a variant at the same skill. */
export function proveItemFor(item, byId) {
  var vs = item.variants || [];
  for (var i = 0; i < vs.length; i++) {
    var v = byId[vs[i]];
    if (v && v.skill === item.skill) return v;
  }
  if (item.remediation && item.remediation.proveIt && byId[item.remediation.proveIt.ref]) {
    return byId[item.remediation.proveIt.ref];
  }
  return null;
}
