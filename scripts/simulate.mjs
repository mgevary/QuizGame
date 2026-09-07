/**
 * simulate.mjs — a headless soak. Synthetic learners of every band play every
 * module they would be offered, for a whole simulated term.
 *
 * It exists to catch the failures a browser test never reaches because they
 * need hundreds of questions to show up: a picker that starves, an item that
 * is never scheduled again, a remediation loop that cannot terminate, an
 * ability estimate that runs away, a box distribution that means nothing is
 * being retained.
 */
import fs from 'node:fs';
import { makeRng, hashSeed } from '../js/content/rng.js';
import { BAND_INFO, bandAtLeast, bandAllowsType } from '../js/content/bands.js';
import { moduleFit } from '../js/content/registry.js';
import { generate } from '../js/content/templates.js';
import { expected, thetaFor, observe as observeAbility } from '../js/learn/ability.js';
import { emptyItemState, applyOutcome, isMastered, isRecovered, isDue, carriedOver, MAX_BOX } from '../js/learn/scheduler.js';
import * as Session from '../js/learn/session.js';
import * as Rem from '../js/learn/remediation.js';
import * as Boost from '../js/learn/boosts.js';

const index = JSON.parse(fs.readFileSync(new URL('../content/index.json', import.meta.url), 'utf8'));
const modules = {};
for (const m of index.modules) {
  modules[m.id] = JSON.parse(fs.readFileSync(new URL('../content/' + m.url, import.meta.url), 'utf8'));
}

/** Same flattening the app does, so the pool a learner sees is the real one. */
function buildPool(mods, band) {
  const pool = [], byId = {}, defaults = {}, parents = {};
  for (const mod of mods) {
    const d = mod.defaults || {};
    Object.assign(parents, mod.parents || {});
    defaults[mod.id] = mod.remediationDefaults || {};
    for (const raw of mod.items) {
      const item = { ...raw };
      item.type = item.type || d.type;
      item.skill = item.skill || d.skill;
      item.band = item.band || d.band;
      if (item.difficulty === undefined) item.difficulty = d.difficulty;
      item.mod = mod.id;
      item.id = mod.id + '/' + item.id;
      if (item.variants) item.variants = item.variants.map(v => mod.id + '/' + v);
      if (item.remediation && item.remediation.proveIt) {
        item.remediation = JSON.parse(JSON.stringify(item.remediation));
        item.remediation.proveIt = { ref: mod.id + '/' + item.remediation.proveIt.ref };
      }
      byId[item.id] = item;
      if (!item.hidden) pool.push(item);
    }
  }
  return { pool, byId, defaults, parents };
}

/**
 * A learner with a true ability. They answer correctly with the probability
 * the model predicts for that true ability — so a well-behaved picker should
 * hold them near the 85% target without ever being told what it is.
 */
function learner(trueTheta, rng) {
  return (difficulty) => rng() < expected(trueTheta, difficulty);
}

const BANDS = ['PN', 'N', 'R', 'K', 'G1', 'G2', 'G3', 'G4', 'G5'];
const SESSIONS = 24;               // roughly a term at twice a week
let failures = [];

console.log('band  sessions  asked  right%  recov  mastered  boxes 0-6            theta drift');
console.log('----  --------  -----  ------  -----  --------  -------------------  -----------');

for (const band of BANDS) {
  const mine = index.modules.filter(m => moduleFit(m, band) === 'exact').map(m => modules[m.id]);
  if (!mine.length) { failures.push(band + ': no modules at all'); continue; }
  const bundle = buildPool(mine, band);

  const rng = makeRng(hashSeed(band));
  const info = BAND_INFO[band];
  const trueTheta = info.thetaStart + 1.2;
  const answers = learner(trueTheta, rng);

  const items = {}, skills = {};
  let asked = 0, firstTry = 0, correct = 0, recovered = 0, remediations = 0, starved = 0, usedUp = 0;
  let longestLoop = 0;
  const meter = Boost.emptyMeter();
  let boosts = 0;
  let nowMs = Date.UTC(2026, 0, 1);

  for (let sess = 1; sess <= SESSIONS; sess++) {
    const q = Session.createQueue({ session: sess, seed: sess * 7 + 1, band });
    Session.updateSuspensions(q, skills, items);
    const target = info.items[0];

    for (let turn = 0; turn < target; turn++) {
      const got = Session.pick(q, { pool: bundle.pool, items, skills, nowMs, rng, parents: bundle.parents });
      if (!got) {
        // A null pick is STARVATION only if there was something to serve.
        // A finite module that a learner has genuinely finished for the day
        // — nothing fresh, nothing due — is the picker being honest, and the
        // session simply ends early.
        const sctx = { turn: q.turn, session: sess, nowMs, rng };
        // Mirror the picker's own playability rule, or an item the band may
        // not be served — a Reception-only listen item for a Nursery child —
        // counts as "available" and reports a starvation that never happened.
        const servable = bundle.pool.some(it => {
          if (it.hidden) return false;
          if (it.band && !bandAtLeast(band, it.band)) return false;
          if (!bandAllowsType(band, it.type)) return false;
          const st = items[it.id];
          if (!st || st.n === 0) return true;
          return isDue(st, sctx) || carriedOver(st, sctx);
        });
        if (servable) starved++; else usedUp++;
        break;
      }

      let item = got.item;
      if (item.type === 'template') {
        const gen = generate(item, makeRng(hashSeed(item.id + ':' + sess + ':' + turn)));
        if (gen) { gen.id = item.id; gen.mod = item.mod; item = gen; }
      }

      const prev = items[item.id] || emptyItemState();
      const right = answers(item.difficulty);
      let outcome;

      if (right) {
        correct++;
        outcome = prev.n === 0 ? 'first' : 'review';
        if (outcome === 'first') firstTry++;
        if (outcome === 'review' && prev.l > 0 && !prev.rec) recovered++;
      } else if (Session.mayRemediate(q)) {
        Session.noteRemediation(q);
        remediations++;
        // Drive the real remediation state machine to termination.
        const run = Rem.start({
          item,
          theta: thetaFor(skills, item.skill, band, bundle.parents),
          lapses: prev.l,
          moduleDefaults: bundle.defaults[item.mod] || {},
          answerText: 'x',
          proveItem: Session.proveItemFor(item, bundle.byId),
          nowMs
        });
        Rem.acknowledgeFeedback(run, nowMs);
        let steps = 0;
        while (run.phase !== 'done' && steps < 40) {
          steps++;
          if (run.phase === 'teach') Rem.proceedToGenerate(run);
          else if (run.phase === 'generate') Rem.answerGenerate(run, answers(item.difficulty - 1), nowMs);
          else if (run.phase === 'assist') Rem.completeAssist(run);
          else if (run.phase === 'prove') Rem.answerProve(run, answers(item.difficulty));
          else break;
        }
        longestLoop = Math.max(longestLoop, steps);
        if (run.phase !== 'done') failures.push(band + ': remediation did not terminate for ' + item.id);
        outcome = run.outcome === 'assisted' ? 'assisted' : 'remediated';
      } else {
        outcome = 'wrong';
      }

      items[item.id] = applyOutcome(prev, outcome, { turn: q.turn, session: sess, nowMs, rng });
      observeAbility(skills, item.skill, item.difficulty, outcome, band, bundle.parents, nowMs);
      if (Boost.addResolved(meter, outcome, outcome === 'review' && prev.l > 0 && !prev.rec)) boosts++;
      Session.advance(q);
      asked++;
      nowMs += 25000;
    }
    nowMs += 2 * 24 * 3600 * 1000;   // come back in two days
  }

  const boxes = new Array(MAX_BOX + 1).fill(0);
  let mastered = 0;
  for (const id in items) { boxes[Math.min(MAX_BOX, items[id].b)]++; if (isMastered(items[id])) mastered++; }

  const leaf = Object.keys(skills).filter(k => k.split('.').length >= 3);
  const meanTheta = leaf.length ? leaf.reduce((a, k) => a + skills[k].th, 0) / leaf.length : 0;
  const correctPct = asked ? Math.round((correct / asked) * 100) : 0;

  console.log(
    band.padEnd(4), String(SESSIONS).padStart(9), String(asked).padStart(7),
    (correctPct + '%').padStart(7), String(recovered).padStart(6), String(mastered).padStart(9),
    ' ' + boxes.join('/').padEnd(20), (meanTheta - trueTheta).toFixed(2).padStart(11)
  );

  if (starved) failures.push(band + ': the picker starved ' + starved + ' times with questions still available');
  if (usedUp) console.log('      ' + band + ': finished every available question early in ' + usedUp + ' session(s) — a finite module, honestly used up');
  if (!asked) failures.push(band + ': asked nothing');
  if (longestLoop >= 40) failures.push(band + ': a remediation loop ran ' + longestLoop + ' steps');
  // A learner who keeps coming back must end up with SOMETHING retained, or
  // the cross-session boxes are not doing their job.
  if (asked > 200 && mastered === 0) failures.push(band + ': nothing was ever mastered across ' + asked + ' questions');
  // The picker targets ~85%; anything wildly off means it is not finding
  // items at the learner's level.
  // The picker aims at roughly 85% success. Well outside that in either
  // direction means it is not finding items at the learner's level.
  if (asked > 200 && (correctPct < 55 || correctPct > 98)) {
    failures.push(band + ': accuracy ' + correctPct + '% is outside the range the picker targets');
  }
  if (Math.abs(meanTheta - trueTheta) > 3) {
    failures.push(band + ': ability estimate drifted ' + (meanTheta - trueTheta).toFixed(2) + ' from truth');
  }
}

console.log('');
if (failures.length) {
  console.log('SIMULATION FAILED:');
  for (const f of failures) console.log('  ' + f);
  process.exitCode = 1;
} else {
  console.log('simulation ok — every band played ' + SESSIONS + ' sessions with no starvation, no runaway remediation and a stable ability estimate');
}
