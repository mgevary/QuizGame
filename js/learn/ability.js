/**
 * ability.js — the per-skill ability estimate (theta). PURE.
 *
 * Deliberately Elo-like rather than IRT: IRT needs item calibration pooled
 * across many learners, which needs a server. Elo behaves acceptably on the
 * 20–60 observations a child produces in a few sessions, and a parent can
 * understand it in one sentence.
 *
 * theta lives on the same 1..10 scale as authored item difficulty, so
 * "expected success" is a direct comparison. The /2 divisor sets the scale:
 * a 2-point gap ≈ 91% expected success, appropriate for a coarse 10-point
 * scale (classic Elo's 400-point divisor, rescaled).
 *
 * The hierarchical update is the single most important fairness detail in
 * the app. theta is stored at every ancestor prefix of a skill id, updated
 * with decaying weight, so a brand new skill inherits a prior from its parent
 * instead of cold-starting. A ten-year-old who installs a new spelling module
 * has never seen `x.spelling.wk12.because`, but has a strong `lit.spell`
 * estimate, and starts there — never at "prove yourself on baby questions".
 *
 * theta is NEVER shown to a child. See docs/PLAN.md §4.3.
 */

import { lineage, resolveParent } from '../content/skills.js';
import { BAND_INFO, clampTheta } from '../content/bands.js';

/** Probability of success for ability theta on an item of difficulty d. */
export function expected(theta, d) {
  return 1 / (1 + Math.pow(10, (d - theta) / 2));
}

/** Learning rate decays with observations so early swings settle. */
export function kFor(n) {
  return n < 10 ? 0.80 : n < 30 ? 0.40 : 0.25;
}

/** Ancestor weights: leaf ×1, parent ×0.5, grandparent ×0.25, then ×0.1. */
export function ancestorWeight(depthFromLeaf) {
  if (depthFromLeaf === 0) return 1.0;
  if (depthFromLeaf === 1) return 0.5;
  if (depthFromLeaf === 2) return 0.25;
  return 0.1;
}

/**
 * Outcome scores. Getting it right after being taught is genuine partial
 * evidence of ability, but not full evidence — hence 0.4, not 1.
 */
export var OUTCOME_SCORE = { first: 1.0, review: 1.0, remediated: 0.4, assisted: 0.0, wrong: 0.0 };

export function emptySkillState() {
  return { th: null, n: 0, c: 0, st: 0, ema: 0.5, rec: 0, t: 0 };
}

/**
 * The prior for a skill nobody has observed yet: the nearest ancestor with an
 * estimate, minus a little (a new leaf is usually harder than its parent's
 * average), else the band's starting theta.
 *
 * @param {object} skills   map skillId -> SkillState
 * @param {string} id
 * @param {string} band
 * @param {object} [parents] the module's parents map, for x.* skills
 */
export function priorFor(skills, id, band, parents) {
  var chain = lineage(id);
  var mapped = resolveParent(id, parents);
  if (mapped) chain = chain.concat(lineage(mapped));
  for (var i = 1; i < chain.length; i++) {
    var s = skills[chain[i]];
    if (s && s.th !== null && s.n > 0) return clampTheta(band, s.th - 0.5);
  }
  return (BAND_INFO[band] || BAND_INFO.A).thetaStart;
}

/** Current theta for a skill, falling back to the prior. */
export function thetaFor(skills, id, band, parents) {
  var s = skills[id];
  if (s && s.th !== null) return s.th;
  return priorFor(skills, id, band, parents);
}

/**
 * Apply one observation. Mutates `skills` (the caller owns a fresh derived
 * state from the fold; there is no persistent object to protect).
 *
 * @param {object} skills   map skillId -> SkillState
 * @param {string} id       leaf skill id
 * @param {number} d        item difficulty 1..10
 * @param {string} outcome  'first' | 'review' | 'remediated' | 'assisted' | 'wrong'
 * @param {string} band
 * @param {object} [parents]
 * @param {number} [nowMs]
 */
export function observe(skills, id, d, outcome, band, parents, nowMs) {
  var score = OUTCOME_SCORE[outcome];
  if (score === undefined) score = 0;
  var correct = score > 0;
  var chain = lineage(id);
  var mapped = resolveParent(id, parents);
  if (mapped) chain = chain.concat(lineage(mapped));

  for (var depth = 0; depth < chain.length; depth++) {
    var key = chain[depth];
    var s = skills[key];
    if (!s) s = skills[key] = emptySkillState();
    if (s.th === null) s.th = depth === 0 ? priorFor(skills, id, band, parents) : (BAND_INFO[band] || BAND_INFO.A).thetaStart;
    var w = ancestorWeight(depth);
    var delta = kFor(s.n) * (score - expected(s.th, d)) * w;
    s.th = clampTheta(band, s.th + delta);
    s.n += 1;
    if (correct) s.c += 1;
    s.st = correct ? s.st + 1 : 0;
    s.ema = s.ema + 0.2 * ((correct ? 1 : 0) - s.ema);
    if (outcome === 'review') s.rec += 1;
    if (nowMs) s.t = nowMs;
  }
}

/**
 * Prerequisite backoff signal (docs/PLAN.md §5.4): a skill is struggling when
 * its moving average has collapsed over enough observations to mean it.
 */
export function isStruggling(skills, id) {
  var s = skills[id];
  return !!s && s.n >= 8 && s.ema < 0.35;
}
