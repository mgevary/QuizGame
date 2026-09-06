import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/learn/remediation.js';

const item = {
  id: 'i7', type: 'mcq', skill: 'lit.phonics.silent-e', difficulty: 4,
  options: [{ v: 'cake', correct: true }, { v: 'cak', misconception: 'omits-silent-e' }],
  remediation: {
    onMisconception: { 'omits-silent-e': { enterRung: 1 } },
    ladder: [
      { kind: 'nudge', text: 'Does the a say its name?' },
      { kind: 'example', text: 'cap → cape' },
      { kind: 'rule', text: 'Magic e makes the vowel say its name.' },
      { kind: 'reveal', text: "It's cake." }
    ],
    generate: { type: 'assemble', tiles: ['c','a','k','e'], answer: 'cake' }
  }
};

test('the entry rung rises when theta is below item difficulty', () => {
  const ladder = item.remediation.ladder;
  assert.equal(R.entryRung(8, 4, 0, ladder), 0, 'a slip gets a nudge');
  assert.equal(R.entryRung(4.5, 4, 0, ladder), 1);
  assert.equal(R.entryRung(2, 4, 0, ladder), 2, 'a real gap gets the rule');
});

test('two lapses escalate straight to the rule regardless of theta', () => {
  assert.equal(R.entryRung(9, 4, 2, item.remediation.ladder), 2);
});

test('a misconception with an authored entry rung overrides the theta choice', () => {
  const run = R.start({ item, theta: 9, misconception: 'omits-silent-e' });
  assert.equal(run.rung, 1);
});

test('there is no path from teach to done that skips generate', () => {
  const run = R.start({ item, theta: 5 });
  R.acknowledgeFeedback(run, 100);
  assert.equal(run.phase, 'teach');
  R.answerGenerate(run, true);            // ignored: not in generate
  assert.equal(run.phase, 'teach');
  R.proceedToGenerate(run);
  assert.equal(run.phase, 'generate');
});

test('a failed generate climbs one rung and re-teaches; the same rung is never repeated', () => {
  const run = R.start({ item, theta: 8 });   // rung 0
  R.acknowledgeFeedback(run); R.proceedToGenerate(run);
  R.answerGenerate(run, false);
  assert.equal(run.phase, 'teach');
  assert.equal(run.rung, 1);
});

test('a child can always exit via assisted success', () => {
  const run = R.start({ item, theta: 1 });   // rung 2
  R.acknowledgeFeedback(run);
  for (let i = 0; i < 5; i++) { R.proceedToGenerate(run); R.answerGenerate(run, false); if (run.phase === 'assist') break; }
  assert.equal(run.phase, 'assist');
  R.completeAssist(run);
  assert.equal(run.phase, 'done');
  assert.equal(run.outcome, 'assisted');
});

test('a correct generate goes to prove-it when a prove item exists, and a failed prove-it does not re-remediate', () => {
  const run = R.start({ item, theta: 5, proveItem: { id: 'i7v1' } });
  R.acknowledgeFeedback(run); R.proceedToGenerate(run); R.answerGenerate(run, true);
  assert.equal(run.phase, 'prove');
  R.answerProve(run, false);
  assert.equal(run.phase, 'done');
  assert.equal(run.outcome, 'remediated');
  assert.equal(run.proveResult, false);
});

test('an unauthored item falls back to the generic ladder and a reshuffled re-ask that retains the wrong choice', () => {
  const bare = { id: 'b1', type: 'mcq', skill: 'num.add.within10', difficulty: 3, options: [{ v: '7', correct: true }, { v: '8' }] };
  const ladder = R.resolveLadder(bare, {}, '7');
  assert.equal(ladder[ladder.length - 1].kind, 'reveal');
  const g = R.resolveGenerate(bare, '8');
  assert.equal(g.authored, false);
  assert.equal(g.retain, '8');
});

test('module-level remediation defaults cover items without their own', () => {
  const bare = { id: 'b1', type: 'mcq', skill: 'lit.phonics.silent-e', difficulty: 3 };
  const defaults = { 'lit.phonics.silent-e': { ladder: [{ kind: 'rule', text: 'Magic e.' }] } };
  assert.equal(R.resolveLadder(bare, defaults, 'x')[0].text, 'Magic e.');
});

test('the generate step must be higher-production than the original', () => {
  assert.ok(R.isHigherProduction('mcq', 'assemble'));
  assert.ok(R.isHigherProduction('tap-image', 'listen'));
  assert.ok(!R.isHigherProduction('assemble', 'mcq'));
  assert.ok(R.isHigherProduction('count', 'count'));
});

test('a generate answered instantly with no teach dwell looks like farming', () => {
  const run = R.start({ item, theta: 8 });
  R.acknowledgeFeedback(run, 1000); R.proceedToGenerate(run);
  assert.ok(R.looksLikeFarming(run, 1800));
  assert.ok(!R.looksLikeFarming(run, 6000));
});
