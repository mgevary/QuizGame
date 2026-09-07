import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../js/learn/boosts.js';
import { makeRng } from '../js/content/rng.js';

test('the meter fills from answering, not from being right', () => {
  const wrong = B.emptyMeter();
  const right = B.emptyMeter();
  for (let i = 0; i < 4; i++) { B.addResolved(wrong, 'wrong'); B.addResolved(right, 'first'); }
  assert.equal(wrong.fill, right.fill, 'a wrong answer must move the meter as much as a right one');
});

test('turning a mistake around fills the meter faster than getting it right', () => {
  const recovered = B.emptyMeter();
  const correct = B.emptyMeter();
  B.addResolved(recovered, 'review', true);
  B.addResolved(correct, 'first');
  assert.ok(recovered.fill > correct.fill);
});

test('a child who struggles earns boosts at least as fast as one who does not', () => {
  // Five questions: one gets everything right first time, the other gets each
  // wrong, is taught, and recovers.
  const breeze = B.emptyMeter();
  const struggle = B.emptyMeter();
  for (let i = 0; i < 5; i++) {
    B.addResolved(breeze, 'first');
    B.addResolved(struggle, 'remediated');
  }
  assert.ok(struggle.earned >= breeze.earned, 'struggle ' + struggle.earned + ' vs breeze ' + breeze.earned);
});

test('a boost is earned every five questions and the meter carries the remainder', () => {
  const m = B.emptyMeter();
  const earned = [];
  for (let i = 0; i < 10; i++) earned.push(B.addResolved(m, 'first'));
  assert.equal(earned.filter(Boolean).length, 2);
  assert.equal(m.earned, 2);
  assert.equal(m.fill, 0);
});

test('an armed boost expires after its runs and cannot be hoarded', () => {
  const m = B.arm(B.emptyMeter(), 'turbo');
  assert.equal(B.multiplierFor(m), 2);
  B.tickRun(m);
  assert.equal(B.multiplierFor(m), 1, 'turbo lasts exactly one question');

  const s = B.arm(B.emptyMeter(), 'surge');
  for (let i = 0; i < 3; i++) { assert.equal(B.multiplierFor(s), 2); B.tickRun(s); }
  assert.equal(B.multiplierFor(s), 1);
});

test('the game picks one boost itself, and the team pull is only picked when there is a team', () => {
  for (let seed = 1; seed < 40; seed++) {
    const solo = B.pickBoost(B.offerFor(false), makeRng(seed));
    assert.ok(typeof solo === 'string' && B.BOOSTS[solo], 'a real boost every time');
    assert.notEqual(solo, 'team');
  }
  assert.ok(B.offerFor(true).includes('team'));
});

test('the same seed picks the same boost, so every device agrees', () => {
  assert.equal(B.pickBoost(B.offerFor(true), makeRng(11)), B.pickBoost(B.offerFor(true), makeRng(11)));
});

test('a boost already running is not picked again while anything else is on offer', () => {
  const m = B.arm(B.emptyMeter(), 'surge');
  for (let seed = 1; seed < 40; seed++) {
    const id = B.pickBoost(B.offerFor(false), makeRng(seed), m);
    assert.notEqual(B.BOOSTS[id].kind, 'run', 'seed ' + seed + ' stacked a run boost');
  }
});

test('every boost explains itself in one big sentence a child can read', () => {
  for (const id of Object.keys(B.BOOSTS)) {
    const b = B.BOOSTS[id];
    assert.ok(b.what && b.what.length > 10, id + ' needs a "what" line');
    assert.ok(b.explain && b.explain.length > 20, id + ' needs an explanation');
    assert.ok(b.what.split(/\s+/).length <= 12, id + ': the big line must stay short');
  }
});

test('a narrow-it waits for a question it can apply to instead of being wasted', () => {
  const m = B.arm(B.emptyMeter(), 'hint');
  assert.ok(B.narrowPending(m));
  const trace = { type: 'trace' };
  assert.equal(B.applyNarrow(m, trace, makeRng(1)), trace, 'a tracing question is untouched');
  assert.ok(B.narrowPending(m), 'still armed');
  const mcq = { options: [{ v: 'a', correct: true }, { v: 'b' }, { v: 'c' }, { v: 'd' }] };
  const out = B.applyNarrow(m, mcq, makeRng(1));
  assert.equal(out.options.length, 3);
  assert.ok(!B.narrowPending(m), 'spent');
});

test('narrowing removes a wrong option and never the right one', () => {
  const item = { options: [{ v: 'a', correct: true }, { v: 'b' }, { v: 'c' }, { v: 'd' }] };
  for (let seed = 1; seed < 20; seed++) {
    const n = B.narrowOptions(item, makeRng(seed));
    assert.equal(n.options.length, 3);
    assert.equal(n.options.filter(o => o.correct).length, 1);
    assert.equal(item.options.length, 4, 'the original item must not be mutated');
  }
});

test('narrowing a two-option question does nothing rather than giving the answer away', () => {
  const item = { options: [{ v: 'a', correct: true }, { v: 'b' }] };
  assert.equal(B.narrowOptions(item, makeRng(1)).options.length, 2);
});

test('every boost affects the race only — none touch difficulty or the schedule', () => {
  for (const id of Object.keys(B.BOOSTS)) {
    const b = B.BOOSTS[id];
    assert.ok(['instant', 'run', 'question', 'team'].includes(b.kind));
    assert.ok(!('difficulty' in b) && !('box' in b) && !('theta' in b),
      id + ' must not touch the learning model');
  }
});
