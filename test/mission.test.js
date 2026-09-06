import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/mission/model.js';

const DAY = 86400000;
const users = (steps, extra = {}) => ({ u_ana: { id: 'u_ana', totals: { steps }, items: {}, skills: {}, sessions: [], session: 1, ...extra } });

test('a solo leg advances the crew journey', () => {
  const m = M.createMission({ id: 'm', title: 'Voyage', crew: ['u_ana', 'u_sam'] });
  const d = M.distanceFor(m, users(50));
  assert.ok(d > 0);
  assert.equal(M.landmarksReached(d), 1);
});

test('the next landmark is always within two legs', () => {
  for (const dist of [0, 13, 44.9, 90, 400]) {
    assert.ok(M.toNextLandmark(dist) <= M.LANDMARK_DISTANCE);
  }
});

test('a landmark never un-claims', () => {
  const m = M.createMission({ id: 'm', title: 'V', crew: ['u_ana'] });
  const a = M.claimedLandmarks(m, users(200), { nowMs: 0 }).length;
  const b = M.claimedLandmarks(m, users(200), { nowMs: 10 * DAY }).length;
  assert.equal(a, b);
  assert.ok(M.claimedLandmarks(m, users(400), { nowMs: 0 }).length > a);
});

test('a two-week absence opens more map, never less', () => {
  const m = M.createMission({ id: 'm', title: 'V', crew: [], createdAt: 0 });
  assert.equal(M.regionsOpen(m, 0), 1);
  assert.equal(M.regionsOpen(m, 14 * DAY), 3);
  assert.ok(M.regionsOpen(m, 30 * DAY) > M.regionsOpen(m, 14 * DAY));
});

test('the shimmer count never exceeds three', () => {
  const items = {};
  for (let i = 0; i < 20; i++) items['i' + i] = { b: 4, n: 3, l: 1, ds: 0, dh: 0, dt: 0, ft: false, a: false, rec: true, r: 0, t: 0 };
  const m = M.createMission({ id: 'm', title: 'V', crew: ['u_ana'] });
  const got = M.shimmering(m, users(0, { items }), { nowMs: 9e12 });
  assert.equal(got.length, 3);
});

test('only a goal mission shows a learner their own ability', () => {
  assert.ok(!M.showsAbility(M.createMission({ id: 'a', title: 'V', kind: 'story' })));
  assert.ok(M.showsAbility(M.createMission({ id: 'b', title: 'AWS', kind: 'goal' })));
});

test('horizon mode is off for story missions and off once the date passes', () => {
  const story = M.createMission({ id: 'a', title: 'V', kind: 'story' });
  assert.equal(M.horizonDaysLeft(story, Date.UTC(2027, 0, 1)), undefined);
  const goal = M.createMission({ id: 'b', title: 'AWS', kind: 'goal', horizon: '2027-03-03' });
  assert.equal(M.horizonDaysLeft(goal, Date.UTC(2027, 2, 1)), 2);
  assert.equal(M.horizonDaysLeft(goal, Date.UTC(2027, 5, 1)), undefined);
});

test('coverage is weighted over mastery early in a horizon and the reverse near the end', () => {
  const m = M.createMission({ id: 'b', title: 'AWS', kind: 'goal', horizon: '2027-03-03', createdAt: Date.UTC(2027, 0, 2) });
  const early = M.horizonWeights(m, Date.UTC(2027, 0, 5));
  const late = M.horizonWeights(m, Date.UTC(2027, 2, 1));
  assert.ok(early.fresh > early.review);
  assert.ok(late.review > late.fresh);
});

test('a 30% weight domain receives roughly 30% of practice', () => {
  const m = M.createMission({ id: 'b', title: 'AWS', kind: 'goal',
    domains: [{ skill: 'x.saa.secure', weight: 0.3 }, { skill: 'x.saa.perf', weight: 0.2 },
              { skill: 'x.saa.cost', weight: 0.2 }, { skill: 'x.saa.res', weight: 0.3 }] });
  const w = M.domainWeightFor(m, 'x.saa.secure.iam');
  const total = m.domains.reduce((s, d) => s + M.domainWeightFor(m, d.skill), 0);
  assert.ok(Math.abs(w / total - 0.3) < 0.01);
});

test('readiness reports coverage and mastery, never a predicted score', () => {
  const m = M.createMission({ id: 'b', title: 'AWS', kind: 'goal', crew: ['u_ana'],
    domains: [{ skill: 'x.saa.secure', weight: 1, targetTheta: 7 }] });
  const u = { u_ana: { id: 'u_ana', totals: { steps: 0 }, items: {}, sessions: [], session: 1,
    skills: { 'x.saa.secure.iam': { n: 5, th: 8 }, 'x.saa.secure.kms': { n: 5, th: 4 }, 'x.saa.secure.vpc': { n: 0, th: null } } } };
  const r = M.readiness(m, u).u_ana;
  assert.ok(Math.abs(r.domains[0].readiness.coverage - 2 / 3) < 1e-9);
  assert.ok(Math.abs(r.domains[0].readiness.mastery - 1 / 3) < 1e-9);
  assert.equal(r.score, 0.5);
  assert.ok(!('predicted' in r));
});

test('a mission archives rather than deleting when its horizon passes', () => {
  const m = M.createMission({ id: 'b', title: 'AWS', kind: 'goal', horizon: '2027-03-03' });
  assert.ok(!M.shouldArchive(m, Date.UTC(2027, 2, 1)));
  assert.ok(M.shouldArchive(m, Date.UTC(2027, 2, 4)));
});

test('the end-of-session card names what was turned into knows', () => {
  const u = { sessions: [{ recovered: ['i1', 'i2', 'i3', 'i4'] }] };
  assert.deepEqual(M.turnedIntoKnows(u, 3), ['i1', 'i2', 'i3']);
});
