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

test('the offer is three boosts, and the team pull is only offered when there is a team', () => {
  const solo = B.chooseOffer(B.offerFor(false), makeRng(3));
  assert.equal(solo.length, 3);
  assert.ok(!solo.includes('team'));
  assert.equal(new Set(solo).size, 3, 'no duplicates in an offer');
  const withTeam = B.offerFor(true);
  assert.ok(withTeam.includes('team'));
});

test('the same seed offers the same choice, so every device agrees', () => {
  assert.deepEqual(B.chooseOffer(B.offerFor(true), makeRng(11)), B.chooseOffer(B.offerFor(true), makeRng(11)));
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
