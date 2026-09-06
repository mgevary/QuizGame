/**
 * mission/model.js — the durable arc. PURE.
 *
 * A Mission is a crew, a set of skills, an optional deadline and a skin.
 * `story` missions (kids) render as an Expedition map; `goal` missions
 * (teens, adults) render as a readiness dashboard against a real exam date.
 * Everything below the skin is identical — see docs/MISSIONS.md.
 *
 * All of it is DERIVED from the fold, never stored as authoritative. So two
 * devices that played apart converge with no merge logic for the map, any
 * device can render it, and changing the pacing constants below retroactively
 * re-renders the whole history correctly.
 */

import { matchesAnyGlob } from '../content/skills.js';
import { isMastered, isShimmering, isRecovered } from '../learn/scheduler.js';

/* ── Expedition pacing (docs/MISSIONS.md §2) ─────────────────────────── */
export var LEG_STEP_SCALE = 0.9;
export var LANDMARK_DISTANCE = 45;
export var REGION_LANDMARKS = 8;
export var MAX_SHIMMER = 3;          // never show a debt pile
export var DAY_MS = 86400000;

export function createMission(o) {
  return {
    id: o.id,
    title: o.title,
    kind: o.kind || 'story',
    crew: o.crew || [],
    skills: o.skills || [],
    targetTheta: o.targetTheta === undefined ? 6 : o.targetTheta,
    horizon: o.horizon || null,
    skin: o.skin || (o.kind === 'goal' ? 'blueprint' : 'expedition'),
    weeklyTide: o.weeklyTide !== false && (o.kind || 'story') === 'story',
    domains: o.domains || null,
    createdAt: o.createdAt === undefined ? 0 : o.createdAt,
    archived: false
  };
}

/** Only a goal mission ever shows a learner their own numbers. */
export function showsAbility(mission) { return mission.kind === 'goal'; }

export function daysUntil(horizon, nowMs) {
  if (!horizon) return null;
  var end = typeof horizon === 'number' ? horizon : Date.parse(horizon + 'T00:00:00Z');
  if (isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - nowMs) / DAY_MS));
}

/** Horizon mode is on only while a goal mission still has a future date. */
export function horizonDaysLeft(mission, nowMs) {
  if (!mission || mission.kind !== 'goal') return undefined;
  var d = daysUntil(mission.horizon, nowMs);
  return d === null || d === 0 ? undefined : d;
}

/**
 * Coverage-then-mastery weighting. Early in a horizon you cannot revise what
 * you have never met, so fresh items are weighted up; near the date the
 * balance flips to reviewing what is weak. One blended weight — no mode
 * switch the learner can feel.
 */
export function horizonWeights(mission, nowMs) {
  var left = horizonDaysLeft(mission, nowMs);
  if (left === undefined) return { fresh: 0.5, review: 0.5 };
  var bornAt = mission.createdAt === undefined || mission.createdAt === null ? nowMs : mission.createdAt;
  var total = Math.max(1, daysUntil(mission.horizon, bornAt) || left);
  var t = Math.max(0, Math.min(1, 1 - left / total));
  return { fresh: 1 - t, review: t };
}

/* ── Progress ────────────────────────────────────────────────────────── */

/** Crew distance: every member's steps count, so a solo leg still advances. */
export function distanceFor(mission, users) {
  var total = 0;
  for (var i = 0; i < mission.crew.length; i++) {
    var u = users[mission.crew[i]];
    if (u) total += u.totals.steps * LEG_STEP_SCALE;
  }
  return total;
}

export function landmarksReached(distance) {
  return Math.floor(distance / LANDMARK_DISTANCE);
}

export function regionOf(landmarkIndex) {
  return Math.floor(landmarkIndex / REGION_LANDMARKS);
}

/** Distance to the next landmark — the map auto-paces so it is always close. */
export function toNextLandmark(distance) {
  return LANDMARK_DISTANCE - (distance % LANDMARK_DISTANCE);
}

/**
 * The weekly tide: a new region opens on a calendar cadence whether or not
 * anyone played. This is the deliberate inversion of a streak — coming back
 * after two weeks away means MORE map, never a pile of guilt.
 */
export function regionsOpen(mission, nowMs) {
  if (!mission.weeklyTide) return Infinity;
  // Compare against undefined explicitly: a mission created at timestamp 0 is
  // a real mission, and `mission.createdAt || nowMs` would silently treat it
  // as "created just now" and open exactly one region forever.
  var born = mission.createdAt === undefined || mission.createdAt === null ? nowMs : mission.createdAt;
  var weeks = Math.floor((nowMs - born) / (7 * DAY_MS));
  return Math.max(1, weeks + 1);
}

/**
 * Landmarks the crew has claimed, each labelled by the skill cluster they
 * demonstrated there. Territory equals knowledge: the map is a record of
 * what the kids actually know, not a progress bar in a costume.
 */
export function claimedLandmarks(mission, users, ctx) {
  var n = landmarksReached(distanceFor(mission, users));
  var skills = masteredSkills(mission, users);
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push({ index: i, region: regionOf(i), skill: skills[i] || null, gold: !!skills[i] });
  }
  return out;
}

function inMission(mission, skill) {
  return !mission.skills.length || matchesAnyGlob(mission.skills, skill);
}

export function masteredSkills(mission, users) {
  var counts = {};
  for (var c = 0; c < mission.crew.length; c++) {
    var u = users[mission.crew[c]];
    if (!u) continue;
    for (var id in u.items) {
      var st = u.items[id];
      if (!isMastered(st)) continue;
      var sk = (u.itemSkill && u.itemSkill[id]) || null;
      if (sk && inMission(mission, sk)) counts[sk] = (counts[sk] || 0) + 1;
    }
  }
  return Object.keys(counts).sort();
}

/**
 * Shimmering places: landmarks whose skills have a cross-session review due.
 * Spaced repetition rendered as territory maintenance. Capped at three,
 * because "247 cards due" is the thing that makes people quit.
 */
export function shimmering(mission, users, ctx) {
  var out = [];
  for (var c = 0; c < mission.crew.length && out.length < MAX_SHIMMER; c++) {
    var u = users[mission.crew[c]];
    if (!u) continue;
    for (var id in u.items) {
      if (out.length >= MAX_SHIMMER) break;
      if (isShimmering(u.items[id], { turn: 0, session: u.session, nowMs: ctx.nowMs })) {
        out.push({ user: u.id, item: id });
      }
    }
  }
  return out;
}

/* ── Goal missions: readiness ────────────────────────────────────────── */

/**
 * Readiness is deliberately NOT a predicted score — we have no calibration
 * data and claiming one would be dishonest. It answers "how much of the
 * blueprint have you shown you know".
 */
export function domainReadiness(domain, user) {
  var skills = user.skills || {};
  var met = 0, mastered = 0, total = 0;
  for (var id in skills) {
    if (!matchesAnyGlob([domain.skill + '.*', domain.skill], id)) continue;
    total += 1;
    if (skills[id].n > 0) met += 1;
    if (skills[id].n > 0 && skills[id].th >= (domain.targetTheta || 6)) mastered += 1;
  }
  if (!total) return { coverage: 0, mastery: 0, score: 0, seen: 0, total: 0 };
  var coverage = met / total, mastery = mastered / total;
  return { coverage: coverage, mastery: mastery, score: 0.5 * coverage + 0.5 * mastery, seen: met, total: total };
}

export function readiness(mission, users) {
  if (mission.kind !== 'goal' || !mission.domains) return null;
  var perUser = {};
  for (var c = 0; c < mission.crew.length; c++) {
    var u = users[mission.crew[c]];
    if (!u) continue;
    var domains = [], score = 0;
    for (var i = 0; i < mission.domains.length; i++) {
      var d = mission.domains[i];
      var r = domainReadiness(d, u);
      domains.push({ skill: d.skill, weight: d.weight, readiness: r });
      score += d.weight * r.score;
    }
    domains.sort(function (a, b) { return a.readiness.score - b.readiness.score; });
    perUser[u.id] = { score: score, domains: domains, weakest: domains.length ? domains[0].skill : null };
  }
  return perUser;
}

/** Item selection is biased by blueprint weight: a 30% domain gets ~30% of practice. */
export function domainWeightFor(mission, skill) {
  if (!mission.domains) return 1;
  for (var i = 0; i < mission.domains.length; i++) {
    if (matchesAnyGlob([mission.domains[i].skill + '.*', mission.domains[i].skill], skill)) {
      return mission.domains[i].weight * mission.domains.length;
    }
  }
  return 1;
}

/**
 * A mission archives rather than deleting when its horizon passes: "passed
 * the exam" and "still knows it" are different things, and only one of them
 * is worth having.
 */
export function shouldArchive(mission, nowMs) {
  if (mission.kind !== 'goal' || !mission.horizon || mission.archived) return false;
  return daysUntil(mission.horizon, nowMs) === 0;
}

/** The end-of-session card: things you got right today that you'd got wrong before. */
export function turnedIntoKnows(user, limit) {
  var out = [];
  var s = user.sessions.length ? user.sessions[user.sessions.length - 1] : null;
  if (s) for (var i = 0; i < s.recovered.length && out.length < (limit || 3); i++) out.push(s.recovered[i]);
  return out;
}
