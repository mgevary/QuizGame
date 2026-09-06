# Replicated state — every device is the server

There is no server, so every device is one. This document specifies how.

**The claim:** all durable state is a **deterministic fold over an append-only event log**.
The log is replicated by gossip whenever two paired devices connect. Because the fold is
deterministic and the log is a grow-only set, every device converges to identical state with
no coordinator anywhere.

**Nothing derived is ever transmitted or merged — only immutable facts.** There is no merge
logic for Leitner boxes, ability estimates, or mission progress, because those are *computed*,
not stored. That is the entire trick, and it is why this design is small enough to be correct.

---

## 1. What this buys

- **Cross-device continuity.** A child plays on the iPad on Tuesday and Dad's phone on
  Thursday; the schedules merge the next time those devices are in the same room.
- **Any device can host.** The "server" is whichever device starts the session.
- **Host handoff.** If the host's phone dies mid-race, another paired device resumes the
  campaign. Match state is ephemeral; campaign state was never at risk.
- **Corruption is a non-event.** Every cache is rebuildable by replaying the log.
- **Retroactive rebalancing.** Change the mission pacing constants and the whole history
  re-renders correctly, because nothing was baked in.

---

## 2. Event shape

```js
{
  id:  'd3f2:1041',                    // deviceId:seq — unique without coordination
  hlc: [1757088000123, 7, 'd3f2'],     // hybrid logical clock: wallMs, counter, deviceId
  k:   'ans',                          // kind
  u:   'u_ana',                        // subject profile
  /* payload varies by kind */
}
```

### Event kinds — facts only, never conclusions

| Kind | Payload | Emitted when |
|---|---|---|
| `ans` | `{item, skill, diff, outcome, assisted, rung, ms, mod}` | a question resolves |
| `sess` | `{start\|end, mode, seats, legSteps}` | a session opens / closes |
| `prof` | `{op, name, band, avatar}` | profile created / renamed / re-banded |
| `mod` | `{op, moduleId, version, approved}` | module installed / approved / flagged broken |
| `art` | `{kind, ref, strokes?}` | a trace or album card is kept |
| `role` | `{role}` | a crew role is chosen |
| `mission` | `{op, id, title, kind, skills, horizon, skin, crew}` | a mission is created or edited |
| `snap` | `{upTo: hlc, state}` | a compaction checkpoint (§6) |

**Mission progress, Leitner boxes, θ and mastery are derived, never events.** That discipline
is what keeps merging trivial. If you are tempted to add an event kind that records a
*conclusion* rather than a *fact*, that is the bug.

---

## 3. Ordering — hybrid logical clocks

θ updates are Elo and therefore **order-dependent**, so the fold needs a stable *total* order
that also respects causality. A Hybrid Logical Clock (Kulkarni et al., 2014) gives both.

```js
// hlc.js — [wallMs, counter, deviceId], compared lexicographically. Stays close to
// wall-clock time so a parent reading a log sees sensible times, but never goes backwards
// and never ties, so the fold is deterministic on every device.

export function tick(prev, nowMs, deviceId) {
  var wall = Math.max(nowMs, prev[0]);
  var ctr  = wall === prev[0] ? prev[1] + 1 : 0;
  return [wall, ctr, deviceId];
}

export function observe(prev, remote, nowMs, deviceId) {
  var wall = Math.max(nowMs, prev[0], remote[0]);
  var ctr;
  if (wall === prev[0] && wall === remote[0]) ctr = Math.max(prev[1], remote[1]) + 1;
  else if (wall === prev[0])                  ctr = prev[1] + 1;
  else if (wall === remote[0])                ctr = remote[1] + 1;
  else                                        ctr = 0;
  return [wall, ctr, deviceId];
}

export function compare(a, b) {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;   // deviceId breaks every remaining tie
}
```

`compare` never returns 0 for two distinct events, because `deviceId` is unique. That is what
makes the sort a **total** order and therefore the fold deterministic.

### The convergence guarantee

Stated as the test that must pass, in `test/fold.test.js`:

> **Two devices that play offline and then merge produce byte-identical derived state,
> regardless of merge direction.**

This is the most important test in the project. If it fails, nothing above it works.

---

## 4. The fold

```js
// fold.js — events -> derived state. Pure: same input, same output, on every device.
export function fold(events, opts) {
  var sorted = events.slice().sort(function (a, b) { return compare(a.hlc, b.hlc); });
  var state = emptyState();
  for (var i = 0; i < sorted.length; i++) apply(state, sorted[i], opts);
  return state;
}
```

Produces:

- `items` — `ItemState` per item the learner has met (box, due clocks, lapses, flags)
- `skills` — `SkillState` per skill id **and per ancestor prefix** (θ, counts, EMA)
- `missions` — position, claimed landmarks, shimmer set, readiness
- `sessions` — the last 30, for cross-session gap calculation

All of it is a **cache**. `quiz/derived.v1.<userId>` and `quiz/mission-state.v1` can be
deleted at any moment and rebuilt.

---

## 5. Gossip sync (anti-entropy)

Each device keeps a **version vector**: `{deviceId: highestSeq}`.

```
A → B   sync-have    {vv, campaignId}
B → A   sync-have    {vv, campaignId}
A → B   sync-events  [events B lacks]      chunked, deflated with pako
B → A   sync-events  [events A lacks]
both    re-fold, update vv
```

The exchange is **idempotent** (dedup by event id), **commutative** and
**order-independent** — safe to run repeatedly, over any transport, in either direction, at
any time.

### Sizing, honestly

An `ans` event is ~55 bytes of JSON. A three-child family playing four times a week produces
roughly 500 events a week — about 25,000 events over six months, ≈1.4 MB raw, ≈300 KB
deflated with the already-vendored `pako`.

So a **first** sync between two devices is a one-time few-hundred-KB transfer over the data
channel: a couple of seconds. Every subsequent sync is a few KB.

---

## 6. Compaction

Log growth is real: a heavy family reaches the 5 MB localStorage quota in roughly two years
without compaction. It is easy to defer and easy to forget, so it is written down here as a
requirement.

Fold everything below a **stable horizon** — the minimum HLC known, from the replicated
version vectors, to have reached *every paired device* — into a `snap` event, which itself
replicates. A device that was behind catches up from the snapshot rather than the raw events.

Because the horizon is derived from replicated vectors and the fold is deterministic, every
device computes the **same** snapshot, so compaction does not break convergence.

Trigger: on session start, when the log exceeds 300 KB.

---

## 7. Trust scopes — do not skip this

Replicating the full log to any device that joins a match would leak a child's entire
learning history to a visiting friend's phone.

### Family scope

Devices are **paired once** — a 6-character code or a pairing QR, confirmed behind the parent
gate. Only paired devices exchange the durable log. Pairing writes a `campaignId` so devices
know they are on the same expedition.

```
quiz/device.v1 = { deviceId: 'd3f2', campaignId: 'c_8812', paired: ['a91c','7fe0'] }
```

### Guest scope

A friend joining a match receives:

- the match (seed, mode, track, roster)
- any modules needed to play it
- **nothing durable**

Their outcomes are ephemeral and discarded when the match ends. A guest can be promoted to
family later, behind the parent gate.

**Build pairing before gossip, not after.** Getting this wrong is the one failure in this
design with a real-world cost.

---

## 8. Honest limitations

- **Two devices that never meet and never use the relay never converge.** Real limitation.
  A device that only ever plays alone holds a divergent view until it meets another.
  Mitigate by making pairing prominent at setup, and by shipping the Phase 9 mailbox.
- **Clock skew** beyond a few minutes can order events oddly. HLC bounds this but does not
  eliminate it. The impact is a slightly different θ path — never corruption.
- **A device restored from an old backup** replays stale events. Harmless: events are
  idempotent by id, and the fold is order-independent.
- **Event sourcing costs ergonomics.** Every state change is "emit a fact, re-fold" rather
  than "mutate". Under the ES2018 rule this is more verbose than it would be elsewhere. It
  is worth it, but it is a real tax on every feature.
- **A malicious or broken paired device could inject bad events.** This is a family app;
  the mitigation is that pairing is a deliberate, parent-gated act. Do not extend pairing to
  strangers without revisiting this.

---

## 9. The Cloudflare mailbox (Phase 9)

The Worker is an **event mailbox, not a source of truth**. Paired devices push events and
pull others', so two devices that never physically meet still converge.

This keeps the "no server owns the truth" property intact: the mailbox holds an unordered bag
of immutable facts and has no opinion about them. It cannot resolve a conflict because there
are no conflicts to resolve.

The same Durable Object also serves as the room server for remote matches — see
[ARCHITECTURE.md](ARCHITECTURE.md#networking--one-coordinator-four-transports).
