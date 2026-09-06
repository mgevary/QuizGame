import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Log from '../js/sync/log.js';
import * as Gossip from '../js/sync/gossip.js';
import { familyCode, isFamily, joinFamily } from '../js/sync/pairing.js';
import { ansPayload, sessPayload, make } from '../js/sync/event.js';

/** A fake session: messages sent land in `out`; `deliver` plays one in. */
function fakeSession() {
  const handlers = {};
  const out = [];
  return {
    out,
    on(t, fn) { handlers[t] = fn; return this; },
    sendRaw(m) { out.push(m); },
    deliver(m) { if (handlers[m.t]) handlers[m.t](m); }
  };
}

test('attaching announces what we have, and only to the family', () => {
  const s = fakeSession();
  Gossip.attach(s);
  assert.equal(s.out[0].t, 'sync-have');
  assert.equal(s.out[0].campaignId, familyCode());
  assert.ok(s.out[0].vv);
});

test('a guest with a different family code receives nothing durable', () => {
  const s = fakeSession();
  Gossip.attach(s);
  s.out.length = 0;
  s.deliver({ t: 'sync-have', vv: {}, campaignId: 'c_someone_else' });
  assert.equal(s.out.filter(m => m.t === 'sync-events').length, 0, 'no events may cross to a guest');
});

test('a family device asking with an empty vector is sent everything we hold', () => {
  Log.append('prof', 'u_t', { op: 'create', name: 'T', band: 'K' });
  Log.append('sess', 'u_t', sessPayload('start', { session: 'x' }));
  Log.append('ans', 'u_t', ansPayload({ item: 'i', skill: 'num.add.within10', diff: 3, outcome: 'first', mod: 'm' }));
  const s = fakeSession();
  Gossip.attach(s);
  s.out.length = 0;
  s.deliver({ t: 'sync-have', vv: {}, campaignId: familyCode() });
  const sent = s.out.filter(m => m.t === 'sync-events');
  assert.ok(sent.length >= 1);
  const total = sent.reduce((a, m) => a + m.events.length, 0);
  assert.equal(total, Log.all().length);
});

test('events from a family device are absorbed and the fold sees them', () => {
  const before = Log.all().length;
  const s = fakeSession();
  let synced = 0;
  Gossip.attach(s, { onSynced: (n) => { synced += n; } });
  const remote = make('zz', 1, [Date.now() + 5, 0, 'zz'], 'prof', 'u_r', { op: 'create', name: 'Remote', band: 'G1' });
  s.deliver({ t: 'sync-events', campaignId: familyCode(), events: [remote] });
  assert.equal(Log.all().length, before + 1);
  assert.equal(synced, 1);
  assert.equal(Log.state().users.u_r.name, 'Remote');
  // Delivering the same batch again changes nothing.
  s.deliver({ t: 'sync-events', campaignId: familyCode(), events: [remote] });
  assert.equal(Log.all().length, before + 1);
});

test('joining a family adopts its code and keeps this device’s history', () => {
  const kept = Log.all().length;
  const old = familyCode();
  joinFamily('cabc123');
  assert.equal(familyCode(), 'cabc123');
  assert.notEqual(familyCode(), old);
  assert.equal(Log.all().length, kept);
  assert.ok(isFamily('cabc123'));
  assert.ok(!isFamily(old));
  assert.throws(() => joinFamily('not a code'));
});
