import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../js/track/model.js';

test('a position is never decreased', () => {
  const t = T.createTrack();
  T.step(t, 0, 1.0);
  T.step(t, 0, -5);
  assert.equal(t.positions[0], 1.0);
});

test('catch-up is capped at 15% of track length in total', () => {
  const t = T.createTrack({ length: 30 });
  T.addSeat(t, 0); T.addSeat(t, 1);
  t.positions[0] = 25;
  let total = 0;
  for (let i = 0; i < 20; i++) total += T.catchupAt(t, 1, 25);
  assert.ok(total <= 4.5 + 1e-9, 'granted ' + total);
  assert.ok(t.positions[1] <= 4.5 + 1e-9);
});

test('a trailing player gets a slightly easier success target, still inside the ZPD', () => {
  const t = T.createTrack({ length: 30 });
  T.addSeat(t, 0); T.addSeat(t, 1);
  t.positions[0] = 10; t.positions[1] = 2;
  assert.equal(T.successTargetFor(t, 1), 0.88);
  assert.equal(T.successTargetFor(t, 0), 0.82);
});

test('no member can contribute more than the anti-carry cap to team distance', () => {
  const t = T.createTrack({ teams: { A: [0, 1] } });
  T.addSeat(t, 0); T.addSeat(t, 1);
  t.positions[0] = 10; t.positions[1] = 1;
  const d = T.teamDistance(t, 'A');
  assert.ok(d < 11);
  assert.ok(Math.abs(d - (11 - 10 + 0.55 * 11)) < 1e-9);
  t.positions[1] = 9;
  assert.equal(T.teamDistance(t, 'A'), 19, 'balanced contributions are not capped');
});

test('the checkpoint regroup waits for the whole pack', () => {
  const t = T.createTrack();
  T.addSeat(t, 0); T.addSeat(t, 1);
  for (let i = 0; i < 5; i++) { T.step(t, 0, 1); T.noteAnswered(t, 0); }
  assert.equal(t.leg, 0, 'seat 0 alone cannot advance the leg');
  assert.ok(!T.mayAdvance(t, 0), 'seat 0 waits at the checkpoint');
  for (let i = 0; i < 5; i++) { T.step(t, 1, 1); T.noteAnswered(t, 1); }
  assert.equal(t.leg, 1);
  assert.ok(T.mayAdvance(t, 0));
});

test('finish order is fixed once', () => {
  const t = T.createTrack();
  assert.equal(T.finish(t, 2), 1);
  assert.equal(T.finish(t, 0), 2);
  assert.equal(T.finish(t, 2), 1);
});

test('tug position is the normalised difference of team distances', () => {
  const t = T.createTrack({ length: 30, teams: { A: [0], B: [1] } });
  T.addSeat(t, 0); T.addSeat(t, 1);
  t.positions[0] = 9; t.positions[1] = 3;
  assert.ok(Math.abs(T.tugPosition(t, 'A', 'B') - 0.2) < 1e-9);
});
