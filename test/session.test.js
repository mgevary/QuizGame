import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue, pick, advance, mayRemediate, noteRemediation, proveItemFor, updateSuspensions } from '../js/learn/session.js';
import { applyOutcome, emptyItemState } from '../js/learn/scheduler.js';
import { observe } from '../js/learn/ability.js';
import { makeRng } from '../js/content/rng.js';

const mk = (id, skill, difficulty, type = 'mcq') => ({ id, skill, difficulty, type, band: 'K' });
const ctx = (pool, items = {}, skills = {}) => ({ pool, items, skills, nowMs: 1_000_000, rng: makeRng(9), broken: {}, parents: null });

test('the picker never serves two items from the same skill family back to back', () => {
  const pool = [mk('a1', 'num.add.within10', 4), mk('a2', 'num.add.within20', 4), mk('s1', 'num.sub.within10', 4), mk('l1', 'lit.alpha.sound.upper.b', 4)];
  const q = createQueue({ session: 1, seed: 1, band: 'G1' });
  const c = ctx(pool);
  const first = pick(q, c); advance(q);
  const second = pick(q, c); advance(q);
  assert.notEqual(first.item.skill.split('.').slice(0, 2).join('.'), second.item.skill.split('.').slice(0, 2).join('.'));
});

test('the picker never starves — it falls back to a template', () => {
  const pool = [{ id: 't1', skill: 'num.add.within20', difficulty: 5, type: 'template', band: 'K', gen: 'add' }];
  const q = createQueue({ session: 1, seed: 1, band: 'G1' });
  // Serve it many times; it must keep coming back rather than returning null.
  for (let i = 0; i < 10; i++) {
    const got = pick(q, ctx(pool, { t1: { ...emptyItemState(), n: 1, b: 3, ds: 99, dt: 999 } }));
    assert.ok(got, 'picker starved on turn ' + i);
    advance(q);
  }
});

test('the picker returns null only when the pool is genuinely empty', () => {
  assert.equal(pick(createQueue({ session: 1, seed: 1, band: 'K' }), ctx([])), null);
});

test('a hard-overdue item is served even when interleave would forbid it', () => {
  const pool = [mk('a1', 'num.add.within10', 4), mk('a2', 'num.add.within20', 4)];
  const items = { a2: applyOutcome(emptyItemState(), 'wrong', { turn: 0, session: 1, nowMs: 0, rng: makeRng(1) }) };
  const q = createQueue({ session: 1, seed: 1, band: 'G1' });
  q.recent = ['num.add.within20', 'num.add.within20', 'num.add.within20'];
  const got = pick(q, { ...ctx(pool, items), nowMs: 1_000_000 });
  // a2 is overdue by well past the hard-due threshold at turn 20
  q.turn = 20;
  const got2 = pick(q, ctx(pool, items));
  assert.equal(got2.item.id, 'a2');
  assert.equal(got2.reason, 'hard-due');
});

test('due reviews are served weakest box first', () => {
  const pool = [mk('a', 'num.add.within10', 4), mk('b', 'lit.spell.wk1', 4), mk('c', 'sci.life.plant', 4)];
  const s = { turn: 0, session: 1, nowMs: 0, rng: makeRng(1) };
  const items = {
    a: { ...applyOutcome(emptyItemState(), 'first', s), dt: 0, ds: 1 },     // box 2
    b: { ...applyOutcome(emptyItemState(), 'wrong', s), dt: 0, ds: 1 }      // box 0
  };
  const q = createQueue({ session: 1, seed: 1, band: 'G1' });
  q.turn = 30;
  const got = pick(q, ctx(pool, items));
  assert.equal(got.item.id, 'b');
});

test('fresh items are chosen near the target success rate for this learner', () => {
  const pool = [mk('easy', 'num.add.within10', 1), mk('right', 'num.sub.within10', 5), mk('hard', 'lit.spell.wk1', 10)];
  const skills = {};
  for (let i = 0; i < 30; i++) observe(skills, 'num.sub.within10', 5, 'first', 'G2');
  for (let i = 0; i < 30; i++) observe(skills, 'num.add.within10', 5, 'first', 'G2');
  for (let i = 0; i < 30; i++) observe(skills, 'lit.spell.wk1', 5, 'wrong', 'G2');
  const q = createQueue({ session: 1, seed: 1, band: 'G2' });
  const got = pick(q, ctx(pool, {}, skills));
  assert.notEqual(got.item.id, 'hard');
});

test('a band gates item type, not difficulty — a pre-nursery child is never served tiles', () => {
  const pool = [{ id: 'x', skill: 'lit.alpha.sound.upper.b', difficulty: 1, type: 'assemble', band: 'R' },
                { id: 'y', skill: 'lit.alpha.sound.upper.d', difficulty: 1, type: 'tap-image', band: 'PN' }];
  const q = createQueue({ session: 1, seed: 1, band: 'PN' });
  assert.equal(pick(q, ctx(pool)).item.id, 'y');
});

test('an item flagged broken by a parent is never served', () => {
  const pool = [mk('bad', 'num.add.within10', 3)];
  const q = createQueue({ session: 1, seed: 1, band: 'G1' });
  assert.equal(pick(q, { ...ctx(pool), broken: { bad: true } }), null);
});

test('remediation is capped per session', () => {
  const q = createQueue({ session: 1, seed: 1, band: 'G1', maxRemediations: 2 });
  assert.ok(mayRemediate(q)); noteRemediation(q);
  assert.ok(mayRemediate(q)); noteRemediation(q);
  assert.ok(!mayRemediate(q));
});

test('a struggling skill is suspended so a child cannot fail twenty times in a row', () => {
  const skills = {};
  for (let i = 0; i < 10; i++) observe(skills, 'num.mul.facts.7', 8, 'wrong', 'G2');
  const pool = [mk('m1', 'num.mul.facts.7', 8), mk('e1', 'num.add.within10', 3)];
  const q = updateSuspensions(createQueue({ session: 1, seed: 1, band: 'G2' }), skills, {});
  assert.equal(pick(q, ctx(pool, {}, skills)).item.id, 'e1');
});

test('a mission restricts the pool to its own skills', () => {
  const pool = [mk('a', 'num.add.within10', 4), mk('b', 'lit.spell.wk1', 4)];
  const q = createQueue({ session: 1, seed: 1, band: 'G1' });
  const got = pick(q, { ...ctx(pool), missionSkills: ['lit.*'] });
  assert.equal(got.item.id, 'b');
});

test('the prove-it item is a different item at the same skill', () => {
  const item = { id: 'i7', skill: 'lit.phonics.silent-e', variants: ['i7v1', 'other'] };
  const byId = { i7v1: { id: 'i7v1', skill: 'lit.phonics.silent-e' }, other: { id: 'other', skill: 'num.add.within10' } };
  assert.equal(proveItemFor(item, byId).id, 'i7v1');
  assert.equal(proveItemFor({ id: 'x', skill: 's', variants: [] }, byId), null);
});
