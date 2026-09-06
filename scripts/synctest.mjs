/**
 * synctest.mjs — prove the claim the whole replication design rests on:
 * devices that play apart and later meet converge on identical state, and it
 * does not matter who meets whom, in what order, or how many times.
 *
 * The unit tests check this for two devices. This drives four devices through
 * a term of realistic play and every pairwise meeting order it can reach, and
 * compares the folded state byte for byte.
 */
import { fold, canonical } from '../js/sync/fold.js';
import { mergeLogs, versionVector, diff, stableFrontier, compact } from '../js/sync/merge.js';
import { make, ansPayload, sessPayload, validate } from '../js/sync/event.js';
import { tick, observe, zero } from '../js/sync/hlc.js';
import { makeRng } from '../js/content/rng.js';

/** A device with its own clock, its own sequence and its own view of the log. */
function device(id, wallStart, skewMs) {
  let clock = zero(id), seq = 0, wall = wallStart;
  let log = [];
  return {
    id,
    get log() { return log; },
    // Real devices disagree about the time. Skew is deliberate here: the
    // hybrid logical clock has to keep the fold deterministic anyway.
    emit(kind, user, payload) {
      wall += 400 + Math.floor(Math.random() * 900);
      clock = tick(clock, wall + skewMs, id);
      seq += 1;
      const e = make(id, seq, clock, kind, user, payload);
      const bad = validate(e);
      if (bad) throw new Error(id + ' emitted a malformed event: ' + bad);
      log.push(e);
      return e;
    },
    absorb(incoming) {
      const before = log.length;
      log = mergeLogs(log, incoming);
      for (const e of incoming) clock = observe(clock, e.hlc, wall + skewMs, id);
      return log.length - before;
    },
    session(user, n, rng) {
      this.emit('sess', user, sessPayload('start', { session: id + ':s' + seq }));
      for (let i = 0; i < n; i++) {
        const r = rng();
        this.emit('ans', user, ansPayload({
          item: 'core.math.g1/g' + (i % 6),
          skill: ['num.add.within20', 'num.sub.within20', 'num.alg.missing'][i % 3],
          diff: 4 + (i % 3),
          outcome: r < 0.2 ? 'wrong' : r < 0.35 ? 'remediated' : r < 0.45 ? 'assisted' : 'first',
          mod: 'core.math.g1'
        }));
      }
      this.emit('sess', user, sessPayload('end'));
    }
  };
}

function sync(a, b) {
  const toB = diff(a.log, versionVector(b.log));
  const toA = diff(b.log, versionVector(a.log));
  b.absorb(toB);
  a.absorb(toA);
  return toA.length + toB.length;
}

let failures = [];
const DEVICES = ['ipad', 'phone', 'laptop', 'tablet'];
const SKEW = { ipad: 0, phone: 45_000, laptop: -120_000, tablet: 8_000 };

/* ── 1. Four devices play apart, then meet in a chain ─────────────────── */
const devs = DEVICES.map((id, i) => device(id, 1_700_000_000_000 + i * 3000, SKEW[id]));
const rng = makeRng(9);
devs[0].emit('prof', 'u_ana', { op: 'create', name: 'Ana', band: 'G1' });
devs[0].emit('prof', 'u_sam', { op: 'create', name: 'Sam', band: 'G3' });

for (let round = 0; round < 6; round++) {
  for (const d of devs) {
    d.session(round % 2 ? 'u_ana' : 'u_sam', 6 + (round % 4), rng);
  }
  // Only some devices meet each round, as they would in a house.
  sync(devs[0], devs[1]);
  if (round % 2 === 0) sync(devs[1], devs[2]);
  if (round % 3 === 0) sync(devs[2], devs[3]);
}
// Everybody meets everybody eventually.
for (let i = 0; i < devs.length; i++) for (let j = i + 1; j < devs.length; j++) sync(devs[i], devs[j]);

const sizes = devs.map(d => d.log.length);
if (new Set(sizes).size !== 1) failures.push('logs differ in size after full sync: ' + sizes.join('/'));

const states = devs.map(d => canonical(fold(d.log)));
if (new Set(states).size !== 1) {
  failures.push('devices disagree about state after full sync');
  const [a, b] = [states[0], states.find(s => s !== states[0])];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) { failures.push('  first difference at char ' + i + ': ' + a.slice(i - 60, i + 60)); break; }
  }
}

/* ── 2. Merge order must not matter ───────────────────────────────────── */
const all = devs[0].log;
const orders = [
  [0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]
];
const byOrder = orders.map(order => {
  let merged = [];
  for (const i of order) merged = mergeLogs(merged, devs[i].log.filter(e => e.id.startsWith(DEVICES[i] + ':')));
  // Everyone's own events, merged in a different order each time.
  return canonical(fold(merged));
});
if (new Set(byOrder).size !== 1) failures.push('merge ORDER changed the resulting state');

/* ── 3. Re-syncing repeatedly must change nothing ─────────────────────── */
const before = canonical(fold(devs[0].log));
for (let i = 0; i < 5; i++) sync(devs[0], devs[1]);
if (canonical(fold(devs[0].log)) !== before) failures.push('re-syncing an already-synced pair changed state');

/* ── 4. A device restored from an old backup rejoins harmlessly ───────── */
const stale = devs[2].log.slice(0, Math.floor(devs[2].log.length / 3));
const restored = device('tablet', 1_700_000_000_000, 0);
restored.absorb(stale);
sync(restored, devs[0]);
if (canonical(fold(restored.log)) !== canonical(fold(devs[0].log))) {
  failures.push('a device restored from an old backup did not catch up');
}

/* ── 5. Compaction preserves what a player sees ───────────────────────── */
const merged = devs[0].log;
const full = fold(merged);
const frontier = stableFrontier(devs.map(d => versionVector(d.log)));
let snapSeq = 0;
const compacted = compact(merged, frontier, fold,
  (upTo, state) => make('ipad', 900_000 + (++snapSeq), [upTo[0] + 1, 0, 'ipad'], 'snap', null, { upTo, state }));
const strip = (s) => { const c = JSON.parse(canonical(s)); delete c.applied; delete c.last; return JSON.stringify(c); };
if (strip(fold(compacted)) !== strip(full)) failures.push('compaction changed the folded state');
if (compacted.length >= merged.length) failures.push('compaction did not shrink the log');

/* ── report ───────────────────────────────────────────────────────────── */
const state = fold(devs[0].log);
const users = Object.values(state.users);
console.log('devices      ' + devs.length + ' (clock skew ' + Object.values(SKEW).map(x => (x / 1000) + 's').join(', ') + ')');
console.log('events       ' + devs[0].log.length);
console.log('after compact ' + compacted.length);
for (const u of users) {
  console.log('  ' + (u.name || '?').padEnd(6) + u.band.padEnd(4) + u.totals.answered + ' answered, ' +
    Object.keys(u.items).length + ' items, ' + u.sessions.length + ' sessions');
}
console.log('');
if (failures.length) {
  console.log('SYNC TEST FAILED:');
  for (const f of failures) console.log('  ' + f);
  process.exitCode = 1;
} else {
  console.log('sync ok — four devices with skewed clocks converged byte-for-byte, in any merge order, repeatably, and survived compaction');
}
