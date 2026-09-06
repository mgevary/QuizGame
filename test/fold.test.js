import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, canonical, stepsFor } from '../js/sync/fold.js';
import { mergeLogs, versionVector, diff, stableFrontier, compact } from '../js/sync/merge.js';
import { make, ansPayload, sessPayload } from '../js/sync/event.js';
import { tick, zero } from '../js/sync/hlc.js';
import { emptyItemState } from '../js/learn/scheduler.js';

/** A tiny simulated device that emits a plausible play session. */
function device(id, wallStart) {
  let clock = zero(id), seq = 0, wall = wallStart;
  const log = [];
  const emit = (kind, u, payload) => {
    wall += 700; clock = tick(clock, wall, id); seq += 1;
    const e = make(id, seq, clock, kind, u, payload); log.push(e); return e;
  };
  return {
    log,
    profile(u, band) { emit('prof', u, { op: 'create', name: u, band }); },
    session(u, answers) {
      emit('sess', u, sessPayload('start', { session: id + ':s' + seq }));
      for (const a of answers) emit('ans', u, ansPayload({ item: a[0], skill: a[1], diff: a[2], outcome: a[3], mod: 'core' }));
      emit('sess', u, sessPayload('end'));
    }
  };
}

const script = (n, seed) => Array.from({ length: n }, (_, i) => {
  const item = 'i' + ((i * 7 + seed) % 12);
  const skill = ['num.add.within10', 'num.sub.within10', 'lit.alpha.sound.upper.b'][i % 3];
  const outcome = (i + seed) % 4 === 0 ? 'wrong' : 'first';
  return [item, skill, 3 + (i % 3), outcome];
});

test('two devices that play offline and then merge produce byte-identical derived state, in either merge order', () => {
  const ipad = device('ipad', 1_000_000), phone = device('phone', 1_000_500);
  ipad.profile('u_ana', 'G1');
  ipad.session('u_ana', script(25, 1));
  phone.session('u_ana', script(30, 2));      // same child, other device, overlapping wall time
  ipad.session('u_ana', script(20, 3));

  const ab = fold(mergeLogs(ipad.log, phone.log));
  const ba = fold(mergeLogs(phone.log, ipad.log));
  assert.equal(canonical(ab), canonical(ba));
  assert.equal(ab.users.u_ana.totals.answered, 75);
});

test('applying an event twice changes nothing', () => {
  const d = device('a', 5000);
  d.profile('u', 'K'); d.session('u', script(10, 4));
  const once = fold(d.log);
  const twice = fold(mergeLogs(d.log, d.log));
  assert.equal(canonical(once), canonical(twice));
});

test('the fold decides first-vs-review from real history, not the client\'s claim', () => {
  const d = device('a', 5000);
  d.profile('u', 'K');
  d.session('u', [['i1', 'num.add.within10', 3, 'review'], ['i1', 'num.add.within10', 3, 'first']]);
  const s = fold(d.log).users.u;
  assert.equal(s.totals.firstTry, 1);
  assert.equal(s.items.i1.n, 2);
});

test('a version-vector diff ships exactly the missing events and no others', () => {
  const a = device('a', 1000), b = device('b', 1000);
  a.profile('u', 'K'); a.session('u', script(5, 1));
  b.session('u', script(3, 2));
  const merged = mergeLogs(a.log, b.log);
  const forB = diff(merged, versionVector(b.log));
  assert.equal(forB.length, a.log.length);
  assert.ok(forB.every(e => e.id.startsWith('a:')));
  assert.equal(diff(merged, versionVector(merged)).length, 0);
});

test('compaction below the stable frontier preserves the fold exactly', () => {
  const a = device('a', 1000), b = device('b', 1000);
  a.profile('u', 'G2'); a.session('u', script(20, 1)); b.session('u', script(20, 2));
  const merged = mergeLogs(a.log, b.log);
  const full = fold(merged);
  // Both devices know everything: the whole log is stable.
  const frontier = stableFrontier([versionVector(merged), versionVector(merged)]);
  let snapSeq = 0;
  const makeSnap = (upTo, state) => make('a', 10_000 + (++snapSeq), [upTo[0] + 1, 0, 'a'], 'snap', null, { upTo, state });
  const compacted = compact(merged, frontier, fold, makeSnap);
  assert.equal(compacted.length, 1);
  assert.equal(compacted[0].k, 'snap');
  const after = fold(compacted);
  // applied/last differ by construction; everything a player sees must not.
  const strip = s => { const c = JSON.parse(canonical(s)); delete c.applied; delete c.last; return JSON.stringify(c); };
  assert.equal(strip(after), strip(full));
});

test('compaction only folds what every paired device has', () => {
  const a = device('a', 1000), b = device('b', 1000);
  a.profile('u', 'G2'); a.session('u', script(6, 1)); b.session('u', script(6, 2));
  const merged = mergeLogs(a.log, b.log);
  // Device b has only seen a's first 3 events.
  const frontier = stableFrontier([versionVector(merged), { a: 3, b: versionVector(b.log).b }]);
  const compacted = compact(merged, frontier, fold, (upTo, state) => make('a', 9999, [upTo[0] + 1, 0, 'a'], 'snap', null, { upTo, state }));
  const rawA = compacted.filter(e => e.id.startsWith('a:') && e.k !== 'snap');
  assert.ok(rawA.every(e => parseInt(e.id.split(':')[1], 10) > 3));
});

test('an event from a device restored from backup is ignored as a duplicate', () => {
  const d = device('a', 1000); d.profile('u', 'K'); d.session('u', script(8, 1));
  const backup = d.log.slice(0, 4);
  assert.equal(mergeLogs(d.log, backup).length, d.log.length);
});

test('recovery pays more than first-try correct, and the bonus is paid once per item ever', () => {
  const failed = { ...emptyItemState(), n: 1, l: 1, rec: false };
  assert.equal(stepsFor('first', emptyItemState()), 1.0);
  assert.equal(stepsFor('review', failed), 1.2);
  assert.equal(stepsFor('review', { ...failed, rec: true }), 1.0);
  assert.equal(stepsFor('review', failed, true), 1.0, 'a farmed recovery pays the plain rate');
  assert.equal(stepsFor('wrong', failed), 0);
});

test('sessions track their own turns, steps and recoveries', () => {
  const d = device('a', 1000); d.profile('u', 'K');
  d.session('u', [['i1', 'num.add.within10', 3, 'wrong'], ['i2', 'num.sub.within10', 3, 'first'], ['i1', 'num.add.within10', 3, 'review']]);
  const s = fold(d.log).users.u.sessions[0];
  assert.equal(s.turns, 3);
  assert.deepEqual(s.recovered, ['i1']);
  assert.ok(Math.abs(s.steps - 2.2) < 1e-9);
  assert.ok(s.end > s.start);
});
