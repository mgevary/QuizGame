import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOutcome, emptyItemState, isDue, overdueTurns, carriedOver, dueFor, isRecovered, isShimmering } from '../js/learn/scheduler.js';
import { makeRng } from '../js/content/rng.js';

const ctx = (turn, session = 1, nowMs = 1_000_000, seed = 7) => ({ turn, session, nowMs, rng: makeRng(seed) });

test('a failed item comes back within 2 turns', () => {
  const s = applyOutcome(emptyItemState(), 'wrong', ctx(10));
  assert.equal(s.b, 0);
  assert.equal(s.l, 1);
  assert.ok(s.dt >= 11 && s.dt <= 13, 'due turn ' + s.dt);
  assert.ok(isDue(s, ctx(13)));
  assert.ok(!isDue(s, ctx(10)));
});

test('an item correct on first exposure skips to box 2', () => {
  const s = applyOutcome(emptyItemState(), 'first', ctx(0));
  assert.equal(s.b, 2);
  assert.equal(s.ft, true);
});

test('a review climbs one box; a failure drops two and never below zero', () => {
  let s = applyOutcome(emptyItemState(), 'first', ctx(0));   // box 2
  s = applyOutcome(s, 'review', ctx(20));                     // box 3
  assert.equal(s.b, 3);
  s = applyOutcome(s, 'wrong', ctx(30));                      // box 1
  assert.equal(s.b, 1);
  s = applyOutcome(s, 'wrong', ctx(31));                      // box 0, not -1
  assert.equal(s.b, 0);
  assert.equal(s.l, 2);
});

test('gap jitter is deterministic under the same seed', () => {
  const a = applyOutcome(emptyItemState(), 'wrong', ctx(5, 1, 0, 42));
  const b = applyOutcome(emptyItemState(), 'wrong', ctx(5, 1, 0, 42));
  assert.equal(a.dt, b.dt);
});

test('cross-session boxes are gated by both session count and wall-clock hours', () => {
  let s = emptyItemState();
  s = applyOutcome(s, 'first', ctx(0));      // 2
  s = applyOutcome(s, 'review', ctx(15));    // 3
  s = applyOutcome(s, 'review', ctx(45));    // 4 — cross scope, 1 session, 20h
  assert.equal(s.b, 4);
  assert.ok(!isDue(s, ctx(0, 2, 1_000_000 + 3600_000)), 'next session but only an hour later');
  assert.ok(isDue(s, ctx(0, 2, 1_000_000 + 21 * 3600_000)), 'next session, 21h later');
});

test('a session-scope due that was never served carries over to the next session', () => {
  const s = applyOutcome(emptyItemState(), 'wrong', ctx(10, 1));
  assert.ok(carriedOver(s, ctx(0, 2)));
  assert.ok(!carriedOver(s, ctx(0, 1)));
});

test('overdue turns are counted so nothing can starve', () => {
  const s = applyOutcome(emptyItemState(), 'wrong', ctx(10));
  assert.equal(overdueTurns(s, ctx(s.dt + 4)), 4);
});

test('the recovery bonus flag is set once per item ever', () => {
  let s = applyOutcome(emptyItemState(), 'wrong', ctx(0));
  s = applyOutcome(s, 'review', ctx(3));
  assert.equal(s.rec, true);
  assert.ok(isRecovered(s));
  const before = s.rec;
  s = applyOutcome(s, 'wrong', ctx(10));
  s = applyOutcome(s, 'review', ctx(13));
  assert.equal(s.rec, before);
});

test('with 5 days to an exam, a box-6 gap compresses to at most a day', () => {
  const loose = dueFor(6, { turn: 0, session: 1, nowMs: 0, rng: makeRng(1) });
  const tight = dueFor(6, { turn: 0, session: 1, nowMs: 0, rng: makeRng(1), horizonDaysLeft: 5 });
  assert.equal(loose.dh, 240 * 3600_000);
  assert.equal(tight.dh, 24 * 3600_000);
  assert.equal(tight.ds, 2);
});

test('with 60 days to an exam, a box-6 gap is untouched', () => {
  const d = dueFor(6, { turn: 0, session: 1, nowMs: 0, rng: makeRng(1), horizonDaysLeft: 60 });
  assert.equal(d.dh, 240 * 3600_000);
});

test('a box-4 item that is due shimmers; a box-6 one does not', () => {
  let s = emptyItemState();
  s = applyOutcome(s, 'first', ctx(0)); s = applyOutcome(s, 'review', ctx(15)); s = applyOutcome(s, 'review', ctx(45));
  const later = ctx(0, 3, 1_000_000 + 48 * 3600_000);
  assert.ok(isShimmering(s, later));
  s.b = 6;
  assert.ok(!isShimmering(s, later));
});
