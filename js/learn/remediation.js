/**
 * remediation.js — the ASK → JUDGE → TEACH → GENERATE → PROVE state machine.
 * PURE: it knows nothing about the DOM. The play screen drives it and renders
 * whatever `view()` says to show.
 *
 * This is the heart of the app. When a child gets something wrong:
 *   FEEDBACK  immediate, task-level, names the specific error
 *   TEACH     a hint-ladder rung; ENTRY RUNG CHOSEN BY ABILITY (Kalyuga's
 *             expertise reversal — a slip gets a nudge, a real gap gets the
 *             worked example)
 *   GENERATE  the child must PRODUCE the answer (Slamecka & Graf) — a
 *             higher-production form of the item, never an "OK" button
 *   PROVE-IT  a DIFFERENT item at the same skill, so "I memorised that this
 *             one is B" does not pass
 *   then the scheduler takes over.
 *
 * Assisted success is mandatory: after the last rung the answer is shown and
 * the child taps it. A child must never be trapped in a loop they cannot
 * exit. It is recorded as 'assisted' and pays reduced steps.
 */

import { expected } from './ability.js';

export var RUNG_KINDS = ['nudge', 'example', 'rule', 'reveal'];

/** Engine-level generic ladder — tier 3 fallback so the loop always runs. */
export function genericLadder(answerText) {
  return [
    { kind: 'nudge', text: 'Have another careful look.' },
    { kind: 'reveal', text: 'The answer is ' + answerText + '.' }
  ];
}

/**
 * Pick the rung to enter at. A child whose ability is well above the item
 * probably slipped — a nudge suffices and a worked example would be redundant
 * (expertise reversal). A child below the item needs the example. Repeated
 * lapses escalate regardless.
 */
export function entryRung(theta, difficulty, lapses, ladder, misconceptionEntry) {
  var max = ladder.length - 1;
  if (misconceptionEntry && typeof misconceptionEntry.enterRung === 'number') {
    return Math.min(max, misconceptionEntry.enterRung);
  }
  var p = expected(theta, difficulty);
  var rung;
  if (lapses >= 2) rung = 2;
  else if (p >= 0.85) rung = 0;          // a slip
  else if (p >= 0.6) rung = 1;           // near the edge
  else rung = 2;                          // a real gap: worked example / rule
  return Math.min(max, rung);
}

/**
 * Resolve the ladder for an item: item-level, else module-level default for
 * its skill, else the generic. Never returns an empty ladder.
 */
export function resolveLadder(item, moduleDefaults, answerText) {
  if (item.remediation && item.remediation.ladder && item.remediation.ladder.length) return item.remediation.ladder;
  var d = moduleDefaults && moduleDefaults[item.skill];
  if (d && d.ladder && d.ladder.length) return d.ladder;
  return genericLadder(answerText);
}

/**
 * The generate step. Authored if present; else the original re-asked with
 * options reshuffled and the chosen wrong option RETAINED so elimination
 * doesn't work. Degraded, but still a retrieval attempt.
 */
export function resolveGenerate(item, chosenWrong) {
  if (item.remediation && item.remediation.generate) return { authored: true, spec: item.remediation.generate };
  return { authored: false, spec: null, retain: chosenWrong === undefined ? null : chosenWrong };
}

/**
 * Create a remediation run for one failed item.
 * @param {object} o {item, theta, ladder, misconception, moduleDefaults, answerText, proveItem, maxRungs}
 */
export function start(o) {
  var ladder = o.ladder || resolveLadder(o.item, o.moduleDefaults, o.answerText);
  var entry = null;
  if (o.misconception && o.item.remediation && o.item.remediation.onMisconception) {
    entry = o.item.remediation.onMisconception[o.misconception] || null;
  }
  var rung = entryRung(o.theta, o.item.difficulty, o.lapses || 0, ladder, entry);
  return {
    phase: 'feedback',            // feedback → teach → generate → (teach…) → prove → done
    item: o.item,
    ladder: ladder,
    rung: rung,
    highestRung: rung,
    misconceptionNote: entry && entry.text ? entry.text : null,
    generateAttempts: 0,
    generateFails: 0,
    assisted: false,
    proveItem: o.proveItem || null,
    proveResult: null,
    startedAt: o.nowMs || 0,
    teachShownAt: 0,
    outcome: null                 // 'remediated' | 'assisted' — set at done
  };
}

/** Advance from FEEDBACK to the first TEACH rung. */
export function acknowledgeFeedback(run, nowMs) {
  if (run.phase !== 'feedback') return run;
  run.phase = 'teach';
  run.teachShownAt = nowMs || 0;
  return run;
}

/**
 * TEACH → GENERATE. There is deliberately no "OK" transition that skips
 * generate: reading the card is never enough.
 */
export function proceedToGenerate(run) {
  if (run.phase !== 'teach') return run;
  run.phase = 'generate';
  run.generateAttempts += 1;
  return run;
}

/**
 * The child attempted the generate step.
 * Correct → prove (or done if no prove item). Wrong → climb one rung and
 * teach again; past the last rung → assisted success.
 */
export function answerGenerate(run, correct, nowMs) {
  if (run.phase !== 'generate') return run;
  if (correct) {
    run.phase = run.proveItem ? 'prove' : 'done';
    if (run.phase === 'done') run.outcome = 'remediated';
    return run;
  }
  run.generateFails += 1;
  if (run.rung >= run.ladder.length - 1) {
    // Out of rungs: assisted success. Show the answer, let them tap it.
    run.phase = 'assist';
    return run;
  }
  run.rung += 1;
  run.highestRung = run.rung;
  run.phase = 'teach';
  run.teachShownAt = nowMs || 0;
  return run;
}

/** The child tapped the highlighted answer in the assisted exit. */
export function completeAssist(run) {
  if (run.phase !== 'assist') return run;
  run.assisted = true;
  run.phase = run.proveItem ? 'prove' : 'done';
  run.outcome = 'assisted';
  return run;
}

/**
 * PROVE-IT result. A failed prove-it does NOT re-remediate (that is a spiral);
 * the scheduler simply keeps the item in box 0 and moves on.
 */
export function answerProve(run, correct) {
  if (run.phase !== 'prove') return run;
  run.proveResult = !!correct;
  run.phase = 'done';
  if (run.outcome === null) run.outcome = 'remediated';
  return run;
}

/** The current rung object, for rendering. */
export function currentRung(run) {
  return run.ladder[Math.min(run.rung, run.ladder.length - 1)];
}

/**
 * Anti-farm heuristic (docs/PLAN.md §4.3): a generate answered correctly
 * in under 1.5s with zero dwell on the teach card looks like a child who
 * knew the answer and failed on purpose to farm the recovery bonus.
 */
export function looksLikeFarming(run, generateAnsweredAt) {
  if (!run.teachShownAt || !generateAnsweredAt) return false;
  return run.generateFails === 0 && (generateAnsweredAt - run.teachShownAt) < 1500;
}

/**
 * Is this generate spec "higher production" than the original type? Used by
 * the validator; the engine trusts authored content once validated.
 */
export var PRODUCTION_RANK = { 'tap-image': 1, 'listen': 2, 'mcq': 2, 'count': 3, 'trace': 3, 'assemble': 4, 'cloze': 4, 'short': 5 };
export function isHigherProduction(fromType, toType) {
  var a = PRODUCTION_RANK[fromType], b = PRODUCTION_RANK[toType];
  if (a === undefined || b === undefined) return false;
  if (fromType === 'count' && toType === 'count') return true;   // count → tap-to-count (no choices)
  if (fromType === 'trace' && toType === 'trace') return true;
  return b > a;
}
