# Quiz Quest — Complete Build Plan

> **Working name:** Quiz Quest. **Repo/folder:** `/Volumes/MacMiniFiles/QuizGame` (currently empty).
> **Reference architecture:** `/Volumes/MacMiniFiles/MazeGame` — patterns are inherited deliberately and by name throughout.

---

## 1. Context

You want a multiplayer educational quiz game for your kids, modelled on MazeGame's architecture: a **zero-dependency static web app** on GitHub Pages, no build step, no server, playable offline, multiplayer over local WiFi with no infrastructure anywhere.

The problem it solves is specific and it is not "another quiz app". It is this: **when a child gets something wrong, that is the moment the learning is available, and almost every quiz app throws it away.** They show a red X and move on. Quiz Quest treats a wrong answer as the most valuable event in the session — it teaches the specific misconception, forces the child to *re-produce* the answer rather than read it, checks it with a different question, and then schedules it to come back later in the session and on later days until it sticks.

Around that loop sit two layers of motivation: a **race** that makes a child voluntarily do 40 retrieval attempts in 15 minutes, and a **months-long shared Expedition** that gives the family a reason to come back tomorrow — which matters because the durable learning lives in the cross-session reviews, not inside any one session.

And underneath all of it: **there is no server, so every device is one.** Family state is an append-only event log replicated to every paired device, so any device can resume the campaign, host the next session, and act as the authority.

### The three hard requirements

1. **Static objects only.** Everything is JSON and ES modules served from GitHub Pages. No database, no backend, no build step.
2. **Fair across a huge age range.** A 4-year-old and a 10-year-old must race each other and both feel it is fair. Down to pre-nursery (age 2).
3. **Trivially easy to add modules.** If authoring is hard, the content ecosystem dies and the app dies with it.

### Decisions locked in

| Decision | Choice |
|---|---|
| Multiplayer v1 | Big-screen host mode + same-WiFi QR/WebRTC + pass-one-device hot seat |
| Multiplayer later | Remote play via a **Cloudflare Worker** — architected now, built in Phase 9 |
| Drawing grading | **Trace accuracy only** (deterministic, on-device). No peer/parent grading in v1 |
| Browser floor | **Keep the Safari 12 / ES2018 rule**, enforced by a syntax-check script |
| Module intake | **JSON files in the repo** + manifest. Items may carry images, audio, and any media that helps learning |
| Durable state | **Event-sourced log, gossip-replicated to every paired device.** Any device can resume as host |
| Long-term motivation | **Missions** — a crew works toward a declared goal; all learning feeds it (§8) |
| Mission kinds | **Story** (fictional, for kids — the Expedition) and **Goal** (a real exam/certification, for teens and adults) on one engine |
| Multi-team | 2 teams in v1; **3+ teams and cross-household crews once the Worker lands** (Phase 10) |

---

## 2. Product in one paragraph

Each player has a device. They pick a race. Everyone answers questions **drawn from their own personal queue at their own difficulty**, so a pre-schooler identifying the letter B and a 10-year-old doing 7×8 are both working at ~85% success and both move the same distance on the track. Get one right, your racer moves. Get one wrong, your racer **pulls into a pit stop** (never backwards, never a red X): you're told exactly what went wrong, taught it, made to rebuild the answer from tiles, then given a *different* question on the same skill to prove it. That item comes back — a few questions later, then next session, then three sessions later. **Recovering a mistake pays more track distance than getting it right first time.** Everyone crosses the finish line. Every session's distance, win or lose, moves the crew's shared **Mission** forward — for kids, an **Expedition** across a map that has been growing since the day you installed it, where every place claimed is a thing they actually know; for a teenager or an adult, the same engine pointed at a real exam date with a readiness readout instead of a map.

---

## 3. Architecture and tech decisions

### 3.1 Stack — locked

| Decision | Choice | Why |
|---|---|---|
| Language | Vanilla ES modules, **ES2018 only** | Matches MazeGame; runs on iOS 12 hand-me-down iPads, which is exactly the device a kid gets |
| Framework | **None** | No build step is the whole point; the repo *is* the site |
| Types | None (JSDoc comments only) | TS needs a compile step |
| Styling | Plain CSS + custom properties on `:root` | Same as MazeGame's `css/app.css` |
| Rendering — track/map | **Canvas 2D** | Smooth animation, DPR-aware |
| Rendering — questions | **DOM** | Text, buttons, images, a11y all come free |
| Persistence | **localStorage**, defensive wrapper | Port `js/store.js` verbatim |
| Durable model | **Append-only event log + deterministic fold** | Enables replication; see §3.3 |
| Offline | Service worker, precache app + core content pack | Port `sw.js` including the network-first navigate handler |
| Deps | `playwright` + `ws`, **devDependencies only** | Same as MazeGame |

**The ES2018 rule.** Port `scripts/check-syntax.js` unchanged. Banned in shipped JS: `?.`, `??`, logical assignment, class fields, static blocks, `Array.at`, `String.replaceAll`, `Object.hasOwn`, `flatMap`, `globalThis`, BigInt. `js/vendor/`, `scripts/`, `test/` exempt. **Budget for friction** — the scheduler, the HLC and the fold are exactly the code you reflexively write with `?.`.

### 3.2 The layering rule

MazeGame's best property is that `runtime.js` has no DOM and `coordinator.js` has no network, so both are unit-testable for real. Quiz Quest extends that to a strict four-layer rule:

```
PURE (no DOM, no network, no storage) — 100% unit tested
  js/sync/{event,hlc,fold,merge}.js      the event log and its fold
  js/learn/*                             ability, scheduler, remediation, session
  js/content/*                           validation, skill maths, templates
  js/track/model.js, js/mission/model.js
  js/net/coordinator.js

STORAGE (localStorage only)
  js/store.js, js/sync/log.js, js/users/users.js

DOM (no game rules)
  js/items/*, js/track/render.js, js/expedition/render.js, js/screens/*

TRANSPORT (I/O only, no rules)
  js/net/{p2p,lan,local}.js, js/sync/gossip.js
```

Nothing in PURE may import anything below it — enforced by a grep in `check-syntax.js`.

### 3.3 Replicated state — every device is the server

This is the architectural spine, and it is what makes "any device can resume" true rather than aspirational.

**The claim:** all durable state is a **deterministic fold over an append-only event log**. The log is replicated by gossip whenever two paired devices connect. Because the fold is deterministic and the log is a grow-only set, every device converges to identical state without any coordinator.

Nothing derived is ever transmitted or merged — only immutable facts. There is no merge logic for boxes, θ, or expedition position, because those are *computed*, not stored.

#### 3.3.1 Event shape

```js
{
  id:  'd3f2:1041',                    // deviceId:seq — unique without coordination
  hlc: [1757088000123, 7, 'd3f2'],     // hybrid logical clock: wallMs, counter, deviceId
  k:   'ans',                          // kind
  u:   'u_ana',                        // subject profile
  /* payload varies by kind */
}
```

**Event kinds (v1) — facts only, never conclusions:**

| Kind | Payload | Emitted when |
|---|---|---|
| `ans` | `{item, skill, diff, outcome, assisted, rung, ms, mod}` | a question resolves |
| `sess` | `{start|end, mode, seats, legSteps}` | a session opens/closes |
| `prof` | `{op, name, band, avatar}` | profile created/renamed/re-banded |
| `mod` | `{op, moduleId, version, approved}` | module installed / parent-approved / flagged broken |
| `art` | `{kind, ref, strokes?}` | a trace or album card is kept |
| `role` | `{role}` | a crew role is chosen |
| `snap` | `{upTo: hlc, state}` | compaction checkpoint (§3.3.5) |

Expedition position, boxes, θ and mastery are **derived**, never events. That discipline is what keeps merging trivial.

#### 3.3.2 Ordering — hybrid logical clocks

θ updates are Elo and therefore **order-dependent**, so the fold needs a stable *total* order that also respects causality. A Hybrid Logical Clock (Kulkarni et al.) gives both in ~30 lines:

```js
// hlc.js — [wallMs, counter, deviceId], compared lexicographically. Stays close
// to wall-clock time so a parent reading a log sees sensible times, but never
// goes backwards and never ties, so the fold is deterministic on every device.
export function tick(prev, nowMs, deviceId) {
  var wall = Math.max(nowMs, prev[0]);
  var ctr  = wall === prev[0] ? prev[1] + 1 : 0;
  return [wall, ctr, deviceId];
}
export function observe(prev, remote, nowMs, deviceId) {
  var wall = Math.max(nowMs, prev[0], remote[0]);
  var ctr  = wall === prev[0] && wall === remote[0] ? Math.max(prev[1], remote[1]) + 1
           : wall === prev[0] ? prev[1] + 1
           : wall === remote[0] ? remote[1] + 1
           : 0;
  return [wall, ctr, deviceId];
}
```

**The convergence guarantee, stated as the test that must pass:** two devices that play offline and then merge produce **byte-identical derived state regardless of merge direction**. This is `sync/fold.test.js` and it is the single most important test in the project.

#### 3.3.3 Gossip sync (anti-entropy)

Each device keeps a **version vector** `{deviceId: highestSeq}`. On any connection:

```
A → B   sync-have   {vv, campaignId}
B → A   sync-have   {vv, campaignId}
A → B   sync-events [events B lacks]     (chunked, deflated)
B → A   sync-events [events A lacks]
both    re-fold, update vv
```

Idempotent (dedup by event id), commutative, order-independent — safe to run repeatedly over any transport, at any time, in either direction.

**Sizing, honestly.** An `ans` event is ~55 bytes JSON. A 3-child family playing 4×/week produces ~500 events/week ≈ 25k events over 6 months ≈ 1.4 MB raw, ~300 KB deflated with `pako` (already vendored). A **first** sync between two devices is therefore a one-time few-hundred-KB transfer over the data channel — a couple of seconds. Every subsequent sync is a few KB.

#### 3.3.4 Trust scopes — do not skip this

Replicating the full log to any device that joins a match would leak a child's entire learning history to a visiting friend's phone.

- **Family scope.** Devices are **paired once** — a 6-character code or a pairing QR, confirmed behind the parent gate. Only paired devices exchange the durable log. Pairing writes a `campaignId` so devices know they are on the same expedition.
- **Guest scope.** A friend joining a match gets the match state and any modules needed to play, and **nothing durable**. Their outcomes are ephemeral and are discarded when the match ends. A guest can be promoted to family later, behind the parent gate.

#### 3.3.5 Compaction

Log growth is real: a heavy family hits the 5 MB quota in roughly two years without compaction.

Fold everything below a **stable horizon** — the minimum HLC known (from version vectors) to have replicated to *every paired device* — into a `snap` event, which itself replicates. Devices that were behind can still catch up from the snapshot rather than the raw events. Because the horizon is derived from replicated vectors and the fold is deterministic, every device computes the same snapshot, so compaction does not break convergence.

Derived state stored in localStorage (`quiz/derived.v1.<userId>`) is **a cache, not a source of truth** — deletable at any time and rebuilt by replaying the log.

#### 3.3.6 Any device can host, and resume

Because `coordinator.js` is pure and every paired device holds the converged log:

- **Any device can start the next session** and be the authority. There is no designated server.
- **Host handoff.** If the host's phone dies mid-race, another paired device resumes the campaign — it has everything. Match state is ephemeral and is simply restarted; campaign state was never at risk.
- **Solo play converges later.** A child plays alone on the iPad on Tuesday; the next time that iPad is in the same room as Dad's phone, the two logs merge and the family Expedition takes both Tuesday and Wednesday into account.

**Honest limits** (also in §14): two devices that never meet and never use the Phase 9 relay never converge. Clock skew beyond a few minutes can order events oddly — HLC bounds this but does not eliminate it; the impact is a slightly different θ path, never corruption. A device restored from an old backup replays stale events, which is harmless because events are idempotent by id.

### 3.4 File tree

```
QuizGame/
  index.html  sw.js  manifest.webmanifest  .nojekyll  robots.txt  .gitignore
  package.json  README.md

  docs/
    PLAN.md  ARCHITECTURE.md  LEARNING.md  CONTENT-FORMAT.md
    AUTHORING-PROMPT.md  SYNC.md  ROADMAP.md  skill-registry.json

  css/  app.css  play.css  track.css  map.css

  js/
    main.js
    store.js                                                      [port]
    ui/  dom.js [port]  audio.js  confetti.js
    users/users.js                                                [port]
    settings/settings.js

    sync/
      hlc.js          hybrid logical clock                        [PURE]
      event.js        constructors + validation                   [PURE]
      fold.js         events -> derived state                     [PURE]
      merge.js        version vectors, diffing, dedup              [PURE]
      log.js          append/read/compact against localStorage
      gossip.js       the sync-have/sync-events exchange
      pairing.js      family pairing + campaignId

    content/  bands.js  skills.js  validate.js  registry.js  templates.js  rng.js
    learn/    ability.js  scheduler.js  session.js  remediation.js
    items/    index.js  mcq.js  tapimage.js  listen.js  assemble.js
              count.js  trace.js  trace-score.js
    track/    model.js  render.js  themes.js
    mission/  model.js      story + goal missions, readiness, horizon    [PURE]
              render.js     the map / readiness renderers
              regions.js    the expedition's region data (like levels.js)
    screens/  home.js  profiles.js  play.js  arena.js  hotseat.js
              library.js  results.js  report.js  map.js  pair.js
    net/      coordinator.js  p2p.js [port]  lan.js [port]  local.js  mpscreen.js
    vendor/   qrcode.js  jsqr.js  pako.js                         [port]

  content/  index.json  modules/*.json  media/<module-id>/*

  scripts/
    serve.mjs  lan-server.mjs  deploy.sh  genicon.mjs  check-syntax.js   [port]
    validate-modules.mjs  smoke.mjs  mptest.mjs  offlinecheck.mjs
    screenshot.mjs  simulate.mjs  synctest.mjs

  test/
    hlc.test.js  fold.test.js  merge.test.js  ability.test.js
    scheduler.test.js  session.test.js  remediation.test.js
    content.test.js  trace.test.js  track.test.js
    expedition.test.js  coordinator.test.js

  .github/workflows/ci.yml
  worker/  src/index.js  wrangler.toml                            (Phase 9)
```

`[port]` ≈ 1,200 lines you get for free from MazeGame.

### 3.5 Networking — one coordinator, four transports

`coordinator.js` stays pure and takes MazeGame's injected io interface unchanged:

```js
/** @param {object} io  {broadcast(msg, exceptSeat), sendTo(seat, msg), now(), seats()} */
export function createCoordinator(io) { ... }
```

| Transport | File | Signalling | Reach | Phase |
|---|---|---|---|---|
| **Hot seat** | `net/local.js` | none — all seats on one device | one device | 2 |
| **P2P WebRTC** | `net/p2p.js` | QR handshake | same WiFi/hotspot, fully offline | 5 |
| **LAN room** | `net/lan.js` + `scripts/lan-server.mjs` | 4-digit room code | same WiFi, laptop hosts | 5 |
| **Cloudflare** | `net/lan.js` (**same file**) | 4-digit room code | anywhere | 9 |

**The key insight for remote play:** a Cloudflare **Durable Object** speaking WebSocket is functionally identical to `scripts/lan-server.mjs`. So `net/lan.js` needs no new code in Phase 9 — only a different URL. Write the seam now:

```js
// lan.js — resolve the room server once, so the same client speaks to a laptop
// on the LAN and to a Cloudflare Durable Object without branching.
function roomServerUrl() {
  var override = readRaw('quiz/roomServer.v1');   // wss://quiz-rooms.<you>.workers.dev
  if (override) return override;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}
```

**Why big-screen mode needs a room code, not a QR.** MazeGame's QR handshake is a *two-way* scan: host shows a QR, joiner scans it, joiner shows an answer QR, host scans that back. On a TV that is impossible (no camera); on a laptop it means scanning four phones in sequence. So:

- Big screen on a **laptop** → a room server (`scripts/lan-server.mjs`, not built yet), everyone opens the printed address and joins with a 4-digit code. Zero cloud, works offline. **This is the recommended family setup once it exists.**
- Big screen on a **TV, no laptop** → Phase 9 Worker gives 4-digit codes with no local server.
- **Two phones, no laptop, no internet** → the QR handshake remains the offline fallback.

### 3.6 Wire protocol

| msg | dir | payload | notes |
|---|---|---|---|
| `hi` / `hi-ok` | join | `{name, band, avatar, elig, campaignId}` → `{seat, roster}` | |
| `roster` | →all | players + colours + bands | |
| `start` | →all | `{seed, mode, trackLength, checkpoints, teams, theme}` | |
| `step` | client→co→all | `{d, skillHash}` | **question content never goes on the wire** |
| `state` | co→all | `{positions, leg}` | ~4 Hz, authoritative |
| `pit` | client→co→all | `{on}` | *"Ana is fixing something"* — never the content |
| `cp` | co→all | `{index, arrived[]}` | checkpoint regroup |
| `cheer` | client→co→all | `{to, emoji}` | ~20 bytes, big relatedness payoff |
| `shared` / `shared-answer` / `shared-result` | | `{itemRef, seed}` / `{correct, ms}` / `{winner}` | duels, by item id (§3.7) |
| `finish` / `results` | | `{steps, recovered, firstTry}` / scoreboard | |
| `module` | host→joiner | chunked module JSON | so a guest can play your homework module |
| **`sync-have`** | paired↔paired | `{vv, campaignId}` | §3.3.3 |
| **`sync-events`** | paired↔paired | `{events[], more}` | chunked + deflated |
| **`pair-req` / `pair-ok`** | | `{code}` | one-time family pairing, parent-gated |

### 3.7 The determinism caveat — flag this early

MazeGame's elegant property is that **only a seed goes on the wire** and every device builds the identical maze. **That does not fully survive here**, because each player's question sequence depends on their own private scheduler state.

Resolution — **two classes of item**:

- **Personal items** — picked locally by that player's scheduler. Only the *outcome* is transmitted. Question content never leaves the device, which is also a nice privacy property.
- **Shared items** — duels and buzzer rounds. The coordinator picks from the intersection of players' declared eligibility and broadcasts **by item id + seed**; every device already has the module.

Eligibility is declared at join as a compact summary, never the whole scheduler state:

```js
elig = { m: ['core.letters.upper','milton.spelling.wk12'], d: [0,3,9,12,4,1,0,0,0,0] }
//        installed module ids                              item count per difficulty 1..10
```

**Someone will otherwise assume seed-only sync and hit this late.** Written down for that reason.

---

## 4. The learning model

Full research basis with citations and honest evidence grades goes in `docs/LEARNING.md`. Summarised as the mechanics it buys:

| Mechanic | Evidence | Grade |
|---|---|---|
| Everything is retrieval; never present content passively before testing | Roediger & Karpicke 2006; Adesope et al. 2017 meta g≈0.61 | **Strong** |
| Two-clock spaced repetition | Cepeda et al. 2006, 317 experiments, d≈0.4 | **Strong** |
| Never two items from the same skill back-to-back | Rohrer & Taylor 2007; Brunmair & Richter 2019 g≈0.42 (domain-dependent) | Moderate |
| After teaching, the child must **produce** the answer, never tap "OK" | Bertsch et al. 2007 generation effect d≈0.40 | Good |
| Hint-ladder **entry rung set by ability** | Sweller & Cooper 1985; Kalyuga et al. 2003 expertise reversal | Strong |
| Feedback is task-level and specific, **never person-level** | Kluger & DeNisi 1996 — **>⅓ of feedback makes performance worse** | Strong |
| Wrong answers are the valuable event; recovery pays more | Kornell/Hays/Bjork 2009; Metcalfe 2017 | Good |
| Audio + image, text suppressed for pre-readers | Mayer modality principle | Good (adult data) |
| Target ~85% success per player | Wilson et al. 2019 *Nat. Comms.* "85% rule" | Good |
| Choice of avatar/theme/topic; no announced exchange rate; no punishing streaks | Deci/Koestner/Ryan 1999 overjustification d≈−0.34 | Good |
| Process-worded praise | Adopted for the **feedback** reason; growth mindset itself is d≈0.08 (Sisk 2018) | Weak — don't build on it |
| **No learning-styles selector, ever** | Pashler et al. 2008 — the meshing hypothesis has no support | Settled |

**Honest ceiling, to be stated in the README:** serious-games meta-analyses land at d≈0.29–0.33 (Wouters 2013; Clark 2016), part of it novelty. Bloom's "2 sigma" is folklore and must not be repeated.

### 4.1 The remediation loop — the heart of the app

```
ASK ──answer──> JUDGE
                  |
      correct ────+──── wrong
        |                 |
        v                 v
   REINFORCE          FEEDBACK       immediate, task-level, names the specific error
   box+1, theta+,        |
   advance track         v
        |             TEACH          hint ladder; ENTRY RUNG CHOSEN BY THETA
        |               |
        |               v
        |           GENERATE         child must PRODUCE the answer. No "OK" button.
        |               |
        |          +----+----+
        |       ok |         | fail
        |          v         v
        |      PROVE-IT   NEXT RUNG --+  (max 4 rungs, then assisted success)
        |      different    ^          |
        |      question,    +----------+
        |      same skill
        |          |
        +----------+--> SCHEDULE
```

**The hint ladder** — four authored rungs, ascending support:

| Rung | Kind | Content |
|---|---|---|
| 0 | `nudge` | One short redirect: *"Say it out loud. Does the a say its name?"* |
| 1 | `example` | A worked example of an **analogous item, never the target**: *"cap → cape"* |
| 2 | `rule` | The rule, dual-coded: text + image + audio |
| 3 | `reveal` | The answer, with a why |

Entry rung by θ relative to item difficulty — a slip enters at rung 0, a genuine gap at rung 2. **Rung 1 must never solve the target item**, or the generate step becomes copying. This is the most common design error in edu apps.

**GENERATE must be a higher-production interaction than the original:**

| Original | Generate form |
|---|---|
| `mcq` | `assemble` from tiles, or cloze with word bank |
| `tap-image` | `listen`, target named aloud, options reshuffled |
| `count` | tap-to-count, no numeral shown |
| `trace` | trace again at the same tolerance |

Fallback if unauthored: re-ask the original **with options reshuffled and the chosen wrong option retained**, so elimination doesn't work.

**Assisted success is mandatory.** After rung 3, highlight the answer and let the child tap it. A child must never be trapped in a loop they cannot exit. Marked `assisted`, reduced steps, box 0.

**PROVE-IT** is a *different* item at the same skill, from `variants`. This is what stops "I memorised that this one's answer is B". If prove-it fails, do **not** re-remediate immediately (that's a spiral) — log a lapse and move on.

**Remediation cap: 6 per session.** After that, failed items are logged and scheduled without the full loop. Without this cap, a bad day becomes 15 minutes of remediation and zero racing. **Expect to tune this hard in playtesting.**

### 4.2 The scheduler — two-clock Leitner

SM-2 is the wrong tool: its intervals are days, and a session is 10–20 minutes. So: an **in-session clock in turns** and a **cross-session clock in sessions + wall-clock hours**.

```js
var BOX_GAPS = [
  { box: 0, scope: 'session', gapTurns: 2  },   // just failed — come back fast
  { box: 1, scope: 'session', gapTurns: 5  },
  { box: 2, scope: 'session', gapTurns: 12 },
  { box: 3, scope: 'session', gapTurns: 25 },   // often lands next session
  { box: 4, scope: 'cross', gapSessions: 1, minHours: 20  },
  { box: 5, scope: 'cross', gapSessions: 3, minHours: 72  },
  { box: 6, scope: 'cross', gapSessions: 8, minHours: 240 }   // effectively retired
];
```

- Correct on a review → `box += 1`
- Correct on **first-ever exposure** → `box = 4` — straight to a cross-session box. Boxes 0–3 are measured in turns and would bring it back *this sitting*, which is nagging, not spacing; a child who has just shown they know something is checked tomorrow, not twelve questions later
- Wrong → `box = max(0, box - 2)`, `lapses += 1`
- `assisted` → `box = 0`
- Box 6 items reappear at ~3% probability, so retirement isn't total
- **Gap jitter**, seeded: `gap * (0.8 + 0.4*rng())`, so the child can't learn the rhythm

**Boxes 4–6 are the Expedition's fuel.** They are what make a landmark "shimmer" in §8, which is how spaced repetition becomes a reason to come back rather than a chore.

**Picker precedence:**
1. Anything overdue by ≥4 turns (prevents starvation)
2. A due review passing the interleave constraint, lowest box first
3. A fresh item with expected success in [0.75, 0.90]
4. Widen to [0.6, 0.95]
5. A template-generated item at the target difficulty
6. If there is nothing fresh, nothing due and no template, the picker returns **nothing** and the session ends with everything done. It never re-asks a question already answered this session unless that question is due — "it asked me the same thing again" is the fastest way to lose a child's trust

**Interleave constraint:** don't serve an item whose skill shares a *parent* with any of the last 3 served, unless it's box 0. Relax to sibling level, then serve anyway.

### 4.3 Fairness — how a 4-year-old races a 10-year-old

**The core move: normalise at item selection, not at scoring.**

θ lives on the same 1–10 scale as authored difficulty. Elo-like, deliberately not IRT (IRT needs pooled calibration, which needs a server):

```js
function expected(theta, d) { return 1 / (1 + Math.pow(10, (d - theta) / 2)); }
function kFor(n) { return n < 10 ? 0.80 : n < 30 ? 0.40 : 0.25; }
// outcome: 1.0 first-try correct | 0.4 correct after remediation | 0.0 otherwise
theta += kFor(n) * (outcome - expected(theta, d));
```

**Hierarchical update — the single most important fairness detail.** θ is stored at every ancestor prefix of the skill id and updated with decaying weight (leaf ×1.0, parent ×0.5, grandparent ×0.25, strand ×0.1). So when you push a brand-new spelling module, a 10-year-old who has never seen `x.spelling.wk12.because` still has a strong `lit.spell` estimate and starts at `θ_parent − 0.5`. **No child ever grinds through 20 baby questions to prove themselves on new content.**

**Band clamping.** θ is clamped to the band's range. A precocious 3-year-old gets *harder taps*, never typed answers — **modality gating is separate from difficulty gating**.

**Never display θ.** No "Level 4.2 Reader". It is a noisy heuristic on 20–60 observations; showing it invites gaming and exactly the ability-level self-comparison Kluger & DeNisi warn against. Show **mastery counts**: *"12 of 26 letters"*.

**Track steps — same reward for the same achievement relative to yourself:**

```js
steps = firstTryCorrect            ? 1.0
      : correctOnReview_wasFailed  ? 1.2   // ← RECOVERY PAYS MOST
      : correctAfterRemediation    ? 0.7
      : assistedSuccess            ? 0.4
      :                              0.0;  // never negative
```

The 1.2 is the design's moral centre: **the fastest way up the track is to get something wrong and then master it.** Precisely the behaviour the errorful-learning research wants, and it removes all incentive to duck hard items.

*The exploit, dominated rather than policed:* the 1.2 is paid **once per item ever** (`rec` flag in the fold), and an item answered wrong then generate-corrected in <1.5 s with zero hint dwell is flagged `suspectFarm` and pays 1.0. Farming is slower than answering honestly.

**No speed bonus by default.** Speed rewards motor development and reading fluency, not knowledge, and penalises the youngest. Optional "Fast Lane", only when all players are G3+.

**No visible handicapping.** Kids detect and resent it. The only catch-up is invisible: a trailing player's expected-success target rises 0.82→0.88 (still in the ZPD) plus a small checkpoint boost — **capped at 15% of track length**, beyond which the leader notices and stops trying. Never move avatars backwards. Never slow the leader.

### 4.4 Team mode

- **Items assigned at each player's own θ.** Never "hardest to the oldest".
- **Team progress = sum of member steps.** The little one genuinely contributes and can see it.
- **Anti-carry cap:** any one member contributes at most 55% (2-player) / 40% (3+); excess becomes a cosmetic "Overdrive" meter. Without this the big sibling solos it and the little one is a spectator — the failure mode of every co-op family game.
- **Teach Assist:** when a teammate enters remediation, a teammate with higher θ on that skill is offered *"Ana is stuck on magic-e. Want to help?"* They see the teach card and pick how they'd explain it. **They cannot send the answer.** The assister earns a *Coach* cosmetic, never distance. Needs an easy off-switch and a "no thanks" from the learner — the sibling-mockery failure mode is entirely plausible.

### 4.5 The multiplayer pacing problem

Remediation takes 20–60 s; meanwhile others answer three more questions. **Solution: hybrid.** Free-running within a leg, with a **checkpoint every 5 items** where the pack regroups. Waiting players get a **Bonus Lane** — an optional, ungraded micro-activity. Nobody stares at a spinner; nobody is more than 5 items ahead.

**Remediation is private.** Others see only *"Ana is fixing something"*.

---

## 5. Age bands and topics

### 5.1 Bands (capability, not enrolment)

| Band | Age | Audio | Max words | Session | Items | Types | Trace tol. | Min touch |
|---|---|---|---|---|---|---|---|---|
| **PN** Pre-Nursery | 2–3 | **required** | 0 | 5 min | 8–12 | tap-image, listen, count(1–3), trace(free) | 30% | ≥96px |
| **N** Nursery | 3–4 | **required** | 0–3 | 8 min | 12–20 | + mcq(image), order(3), odd | 22% | ≥80px |
| **R** Reception | 4–5 | required | 3–6 | 10 min | 18–28 | + assemble(CVC), numberline(0–10), trace(letters) | 16% | ≥72px |
| **K** | 5–6 | default on | 8–15 | 12 min | 25–35 | + cloze(word bank), tf | 12% | ≥64px |
| **G1** | 6–7 | optional | 20–30 | 12 min | 30–40 | + estimate | 12% | ≥56px |
| **G2** | 7–8 | optional | 40–60 | 15 min | 35–45 | + short (typed, tolerant) | 9% | ≥48px |
| **G3** | 8–9 | off | 80 | 15 min | 35–50 | + multi-step | 9% | ≥48px |
| **G4–G6** | 9–14 | off | 120–200 | 18–20 min | 40–60 | all | 9% | ≥44px |

Driving facts: a pre-reader cannot read *any* instruction, so PN/N prompts must carry full meaning in **audio + image alone**; focused attention runs 2–5 minutes at age 3, so sessions are short and each item is under ~20 s; fine motor at 2–3 is whole-arm, so trace tolerance is enormous; typing is not viable before ~7, so every "produce the answer" step below G2 is tap/drag/tile.

Band is set by a parent from an age input and is **separate from θ**. Band gates *modality and item type*; θ gates *difficulty*.

### 5.2 Topic tree

```
lit   Literacy    lit.phon  lit.alpha  lit.phonics  lit.sight  lit.vocab
                  lit.read  lit.spell  lit.gram  lit.write
num   Numeracy    num.count num.numeral num.compare num.subitize
                  num.add num.sub num.mul num.div
                  num.place num.frac num.dec num.pct
                  num.meas num.time num.money num.geo num.data num.alg
sci   Science     sci.life sci.earth sci.phys sci.space sci.body sci.method
wld   World       wld.geo wld.hist wld.civ wld.culture wld.lang.<iso>
log   Logic       log.pattern log.seq log.class log.spatial log.puzzle log.code
art   Arts        art.draw art.color art.music art.craft
sel   Social-emo  sel.emotion sel.friend sel.safety sel.self
life  Practical   life.body life.food life.money life.time life.road
x     Custom      x.<slug>     e.g. x.spelling-wk12, x.dinosaurs
```

`x` is a **first-class escape hatch** — the homework use case lives there.

### 5.3 Skill ids

Format `<strand>.<topic>.<skill>[.<param>]`, lowercase, `[a-z0-9][a-z0-9-]*` per segment, ≤6 segments, ≤64 chars.

```
num.add.within10          num.mul.facts.7        ← per-fact: 7×8 has its own clock
lit.alpha.sound.upper.b   ← B is its own skill; B and D confuse, so schedule them apart
lit.phonics.cvc.short-a   x.spelling.wk12.because
```

1. **Leaf granularity = scheduling granularity.** Must be in the LLM authoring prompt.
2. **Prefix matching is semantic** — θ stored at every ancestor, giving warm starts.
3. **Two modules sharing a leaf id share one schedule.** A skill mastered in the school module is not re-drilled by a homemade one. This is the whole payoff of having a scheme.
4. **`x.` skills must declare a parent** (`"parents": {"x.spelling": "lit.spell"}`) so they inherit a prior instead of cold-starting.
5. Optional `prereqs`. Keep it shallow — a full knowledge graph is a trap no small project has ever finished.

### 5.4 Prerequisite backoff — the fairness safety valve

If `lapses >= 3` on an item, or a skill's moving average drops below 0.35 over ≥8 observations, **suspend that skill for the session** and substitute items from its `prereqs`, or the parent prefix one difficulty band lower. Framed as a detour, not a demotion: *"Let's warm up first."*

This stops a 6-year-old grinding fruitlessly against a module their older sibling installed.

---

## 6. Item types

**The load-bearing rule, enforced at the single place θ is updated:**

> Only deterministically gradable item types update θ and the schedule. Everything else awards track steps and joy, and is invisible to the learning model.

A `gradable: true|false` flag on the type registry enforces it.

### 6.1 v1 — six types (+ templates)

| Type | Interaction | Bands | Authoring |
|---|---|---|---|
| `mcq` | 2–4 options: text, image, or audio | PN+ | `options[]` with `v` + `misconception` |
| `tap-image` | 2–4 large pictures, audio prompt | **PN+** | `media.image` + `alt` per option |
| `listen` | Audio prompt → pick | **PN+** | `prompt.audio`, or `tts` |
| `assemble` | Build a word/number from tiles | R+ | `tiles[]`, `answer` |
| `count` | Tap objects one at a time, count reads aloud | **PN+** | `n`, `item` |
| `trace` | Trace a glyph/shape | **PN+** | SVG path + stroke order |
| `template` | Procedurally generated | R+ | whitelisted `gen` + `params` |

**Every item type carries optional `media.image`** — so "look at this picture and answer" works from day one on `mcq`, `listen` and `assemble` without a new type. This covers your note about questions requiring an image directly.

**Distractors must be diagnostic.** The `misconception` field on each wrong option is the highest-value field in the whole format: it lets the teach card address *the specific wrong idea this child has* rather than re-explaining the topic. Emphasise this in the authoring prompt.

### 6.2 Trace scoring — deterministic, on-device, feeds θ

~150 lines of pure canvas maths in `items/trace-score.js`.

1. Sample the target SVG path at N≈120 evenly spaced points.
2. **Coverage** = fraction of target points with child ink within radius `r`.
3. **Precision** = fraction of child points within `r` of the target path — this catches a wild scribble that happens to cover the letter.
4. Optional **formation**: stroke start points and dominant direction vs `strokeOrder`. **Only enforced G1+** — a 3-year-old drawing a correct-looking B bottom-up should pass.
5. `score = 0.6*coverage + 0.4*precision`; formation is a badge, never a fail.

Thresholds scale with band — this *is* the fine-motor accommodation:

| Band | r (% glyph height) | pass coverage / precision |
|---|---|---|
| PN | 30% | 0.50 / 0.35 |
| N | 22% | 0.60 / 0.50 |
| R | 16% | 0.72 / 0.62 |
| K–G1 | 12% | 0.82 / 0.72 |
| G2+ | 9% | 0.88 / 0.80 |

**Store drawings as stroke arrays (`Int16` x,y pairs), never PNGs.** ~1–2 KB versus 50–200 KB, and PNGs would blow both the storage quota and the replicated log.

### 6.3 v2 / v3 types (roadmap, not v1)

`order`, `match`, `sort`, `cloze`, `numberline`, `odd`, `pattern`, `estimate`, `hotspot`, `short` (typed). Fifteen types is a large surface — six is the fastest path to a playable, honest product covering ages 2–8 completely.

### 6.4 Audio — be honest about TTS

`speechSynthesis` is not dependable: voice lists load asynchronously, iOS requires a gesture before the first utterance, quality varies wildly, and **offline voices may not exist on some devices**, breaking the offline promise.

So: **`prompt.audio` (a recorded file) is the reliable path, and the bundled core PN–R pack must ship recorded audio.** TTS is the free fallback for user-authored modules.

```js
// audio.js — prefers a recorded file, falls back to TTS, falls back to showing
// the text with an "ask a grown-up to read this" badge. Never fails silently.
export function speak(text, audioUrl) { ... }
```

**The iOS autoplay trap:** a PN child cannot read a "tap to start" prompt. The **parent** starts the session, unlocking the audio context once for the whole session.

**Speech recognition is not in this plan.** Chrome-only and it streams audio to Google's servers — a genuine privacy problem in a children's app and a hard blocker on the offline promise.

---

## 7. The race — session-level gamification

### 7.1 One model, many skins

```js
TrackModel = {
  length: 30, positions: { seat: 12.4 }, checkpoints: [5,10,15,20,25],
  teams: { A:[0,2], B:[1,3] } | null,   // an arbitrary map, so N teams need no model change
  theme: 'race'|'tug'|'relay'|'lanes'
}
```

`teams` is a map rather than a pair from the start, so §8.8's 3+ teams costs a renderer (`lanes`) and nothing else.

`steps` are added to `positions[seat]`. The coordinator owns positions and checkpoints, exactly as MazeGame's owns finish order. The renderer is a **pure function of TrackModel** — new metaphors are new renderers, not new game logic. Same relationship as `themes.js` → maze generator.

Ship `race` (versus) then `tug` (team: position = *difference* of team totals, so every single answer visibly moves the rope and the little sibling's contribution is legible at a glance).

### 7.2 How a wrong answer feels — specification

| Never | Always |
|---|---|
| Red X, harsh buzzer, sad avatar | Soft tone, **curious** avatar |
| Moving backwards | Pausing in the pit, then a nudge forward on recovery |
| Broadcasting the failure | *"Ana is fixing something"* — content never shown |
| "Wrong" / "Nope!" | Name the error: *"'cak' is missing the magic e"* |
| Person-level: "you're not good at this" | Task-level: *"that one takes most people three tries"* |
| A "mistakes: 4" counter | A **"turned into knows: 4"** counter |
| Losing a life / a heart | **Nothing is ever taken away** |

**Evidence-based, not just kind.** Ashcraft & Krause (2007): maths anxiety consumes the very working memory the task needs — punishing errors directly degrades the resource required to answer. Plus Kluger & DeNisi: person-directed negative feedback is exactly the third of feedback that makes performance *worse*.

**Ranking is age-gated.** Under-8s never see a numeric position — they see distance-to-leader framed positively (*"catching up!"*) and always their own bar against their own previous best, the comparison they can always win.

**Everyone crosses the finish line.** The leader crossing starts a short "coming home" phase rather than ending the race. Same fanfare for every finisher.

### 7.3 Celebration moments — sparingly, so they keep value

- **Recovery moment** — the first time a previously-failed item comes back and you get it. **The biggest animation in the game, bigger than winning the race.** A deliberate statement of what the app values.
- **Checkpoint regroup** — small, shared.
- **Skill mastery** — a meter fills; a card joins the album.
- **End of session** — a **"What you learned"** card naming *three things you got right today that you'd got wrong before*, plus the distance added to the Expedition. **This card is the actual reward of the product**, and being informational rather than tangible it is exactly the form that does *not* undermine intrinsic motivation.

### 7.4 Overjustification — hard build rules

Deci, Koestner & Ryan (1999): expected, tangible, performance-contingent rewards undermine intrinsic motivation, d≈−0.34. This is where edu-games die, so these are rules:

1. **Never state an exchange rate.** Nothing says "10 coins per correct answer" — that is precisely the poisoned form.
2. Cosmetics unlock at **unannounced, variable milestones**. Unexpected rewards do not undermine.
3. Session and Expedition rewards are **completion-contingent, not performance-contingent**.
4. **No punishing streak.** Never "you lost your 40-day streak". See §8.2 for the inversion.
5. **No cross-family leaderboards. Ever.**
6. Praise copy is process/task oriented, never ability oriented.
7. **The most powerful motivator here is a parent or sibling sitting next to the child.** Design every screen for two people looking at it.

### 7.5 Big-screen host mode (Arena)

`screens/arena.js` on the TV/laptop:

- Full-bleed **track canvas** with all avatars, names, colours
- **Join panel**: room code (or QR) + roster as players connect
- Checkpoint celebrations, the "coming home" phase, final scoreboard
- A **"turned into knows"** ticker as recoveries happen across all players
- **A ribbon showing the Expedition distance this session is adding**
- **Never shows question content** — privacy, and so kids can't copy off the big screen

Each phone runs `screens/play.js`: the question card full-screen plus a small track strip. The host joins with `hostPlays: false`, so seat 0 is a pure display seat.

### 7.6 Hot seat (one device)

`screens/hotseat.js` + `net/local.js`. The local transport puts every seat on one device driving the **same coordinator** — so the coordinator gets exercised by the simplest possible mode from Phase 2. Pass the tablet, big "Ana's turn" card between players. The only mode that works for a toddler with no device, and the fastest path to a playable product.

---

## 8. Missions — the durable arc

The race is the **session**. A **Mission** is the **campaign**, and it is the answer to "why open this again tomorrow?"

This matters more than it sounds. §4.2 puts the durable learning in boxes 4–6, whose intervals are 20 hours, 3 days and 10 days. **Those reviews only happen if you come back on a different day.** Return is not a business metric here; it is the learning mechanism. The Mission exists to make returning feel like the interesting thing to do.

### 8.0 One engine, two kinds of goal

A Mission is a crew, a set of skills, an optional deadline, and a skin. Everything the crew learns feeds one visible objective.

```js
Mission = {
  id, title,
  kind: 'story' | 'goal',
  crew: ['u_ana','u_sam'],          // profiles, possibly across devices
  skills: ['lit.phonics.*','num.add.*'] | ['aws.saa.*'],   // globs over skill ids
  targetTheta: 6.5,                 // the ability the mission requires
  horizon: null | '2027-03-03',     // exam date, or null for open-ended
  skin: 'expedition' | 'ascent' | 'blueprint',
  weeklyTide: true                  // story missions open new map on a calendar
}
```

| | **Story mission** (kids) | **Goal mission** (teens/adults) |
|---|---|---|
| Objective | *Reach the Sunken City* | *Pass AWS Solutions Architect on 3 March* |
| Skills | whatever modules are installed | the exam blueprint's domains |
| Horizon | none — it unfolds | a real date, which changes the scheduler (§8.7) |
| Readout | a map with claimed territory | a **readiness dashboard**: coverage, mastery, days left |
| Skin | `expedition` | `blueprint` (a certification wall) or `ascent` (a climb) |
| Crew | a family | a study group, a couple prepping together, a classroom |

**Everything below the skin is identical** — the same fold, the same scheduler, the same ability model, the same replication, the same team mechanics. A goal mission is a story mission with a date and a different renderer. That is the whole reason this generalization is worth making: it roughly doubles the addressable use of the app for one extra data structure and one scheduler mode.

The rest of §8 describes the **Expedition**, which is the default story mission and the thing your kids will actually see. §8.6–8.7 cover what changes for goal missions.

### 8.1 Shape of the Expedition

The family is one crew on a long voyage across a map that reveals itself region by region. It spans months.

| Unit | Size | Cadence |
|---|---|---|
| **Leg** | one session (10–20 min) — race distance converts to map distance | per play |
| **Landmark** | reached every ~1.5 legs. Small celebration + a postcard | 2–3 per week |
| **Region** | ~8 landmarks, a themed area (*Coral Shallows*, *The Ember Waste*). Unlocks a track theme and cosmetics | ~1–2 weeks |
| **The Map** | ~24 regions ≈ a school year. Printable at the end | the artefact |

**Territory equals knowledge — this is the whole idea.** Every landmark is *claimed by a skill cluster the family demonstrated there*, and it is labelled that way: **Magic-E Cove**, **Sevens Ridge**, **The Bones of a Plant**. The map is not a progress bar wearing a costume; it is **a visible, accumulating record of what your kids actually know**, and that is the most motivating artefact available to this design.

### 8.2 Return hooks — every one of them guilt-free

The obvious way to drive return is a streak. It is also the single most reliable way to convert play into obligation and trigger the overjustification effect. So every hook below is built on **anticipation or accumulation, never on loss**.

1. **Nothing ever decays.** A claimed landmark stays claimed forever. No wilting garden, no lost streak, no expiring anything. **Nothing is ever taken away** — the same rule as §7.2, applied at campaign scale.

2. **Shimmering places = due reviews.** A landmark whose skills have box-4/5 reviews due glows gently on the map. Tapping it starts a short **check-up leg** (5–8 items, 3–4 minutes). Passing turns the landmark **gold** — permanent, box 6.
   - **Cap the shimmer count at 3.** Anki's motivation-killer is opening the app to "247 cards due". Three shimmering places is an invitation; a debt pile is a reason to quit. Overflow is simply not displayed and surfaces later.
   - This is spaced repetition rendered as *territory maintenance*, and it is the mechanic that ties the arc directly to the learning model.

3. **The weekly tide — the anti-streak.** A new region opens on a calendar cadence (say Monday morning), **whether or not you played**. So **coming back after two weeks away is a better experience, not a worse one**: there is more map to see, not a pile of guilt. This is the deliberate inversion of the streak, and it is the most important design decision in this section.

4. **The next landmark is always close.** The map auto-paces so the next landmark is 1–2 legs away. Never show a bar that takes a month to fill.

5. **Solo legs count.** A child playing alone advances the *family* journey. This removes "we need everyone in the room" as a blocker — the single biggest practical barrier to any family game. Their leg merges into the shared map the next time devices meet (§3.3).

6. **"While you were away."** On opening after a gap: postcards from siblings' solo legs, new islands that appeared because you added a module, the region the tide opened. Real social evidence, not manufactured FOMO.

7. **Crew roles.** Each child picks a role — Navigator, Engineer, Lookout, Cook — with a small cosmetic function, rotating each region. An autonomy lever and a relatedness lever for the cost of a picker screen.

8. **The Homework Boss** is a weekly **storm** on the map, assembled locally from *this family's* failed-and-recovered items across all children and all modules. Zero authoring, perfectly targeted, and it is literally the spaced-repetition queue wearing a costume.

9. **The year-end poster.** The map exports as a single image: a year of learning, on the wall. The real long-term payoff, and the thing parents send to grandparents.

### 8.3 Composition with the race

**The Expedition is always co-op, even when the session is versus.** The race decides who won *today*; the crew's *combined* distance is what moves the ship. So losing a race still advances the journey, and the family is permanently on the same side.

This is the reconciliation of the two things that are usually in tension: kids want to compete, families want to be on the same team. Versus at the session scale, co-op at the campaign scale.

### 8.4 Pacing maths (concrete, so it can be tuned)

```
legDistance      = crewSteps * 0.9        // ~35 items/player/session
landmarkDistance = 45                     // ≈ 1.5 legs for a 2-child crew
regionLandmarks  = 8                      // ≈ 12 legs ≈ 1.5 weeks at 4 sessions/wk
mapRegions       = 24                     // ≈ a school year
```

`regions.js` holds the region definitions as a plain data array — name, palette, landmark count, unlock date offset — exactly the way `levels.js` holds MazeGame's 30-level curve. Adding a region is one line.

### 8.5 It is all derived

Expedition position, claimed landmarks and shimmer state are a **pure fold over the event log** (§3.3), never stored as authoritative. Consequences that fall out for free:

- Two devices that played apart converge automatically when they meet — no merge logic for the map.
- Any device can render the map and host the next leg.
- The map can be recomputed from scratch at any time, so a corrupted cache is a non-event.
- Rebalancing the pacing constants later **retroactively re-renders the whole history correctly**, because nothing was baked in.

### 8.6 Goal missions — real exams and certifications

A goal mission points the identical engine at something with a date on it: an SAT, a GCSE, an AP paper, a driving theory test, AWS/Azure certs, a nursing board, a language exam.

**What a goal mission adds:**

- **A skill map drawn from the exam blueprint.** Every certification publishes a domain breakdown with weights ("Domain 1: Design Secure Architectures — 30%"). That maps directly onto the skill tree as a custom strand with declared weights:
  ```jsonc
  "mission": {
    "kind": "goal", "title": "AWS Solutions Architect Associate", "horizon": "2027-03-03",
    "domains": [
      { "skill": "aws.saa.secure",   "weight": 0.30, "targetTheta": 7 },
      { "skill": "aws.saa.resilient","weight": 0.26, "targetTheta": 7 },
      { "skill": "aws.saa.perf",     "weight": 0.24, "targetTheta": 6 },
      { "skill": "aws.saa.cost",     "weight": 0.20, "targetTheta": 6 }
    ]
  }
  ```
  The same LLM authoring path that turns a homework photo into a module turns a syllabus PDF into a set of them — this is a *better* fit for AI authoring than kids' content, because the source material is public, structured and dense.

- **A readiness estimate instead of a map.** Honest, and stated with its own uncertainty:
  ```js
  domainReadiness = 0.5 * coverage      // fraction of domain skills ever met
                  + 0.5 * mastery;      // fraction at box >= 4 AND theta >= targetTheta
  readiness = sum(weight_d * domainReadiness_d);
  ```
  Displayed as a per-domain bar chart with the weakest domain called out, plus **days remaining** and **skills not yet touched**. Never a predicted score — we have no calibration data and claiming one would be dishonest. The label is *"how much of the blueprint you've shown you know"*, not *"you will pass"*.

- **Adults may see their own numbers.** §4.3 forbids showing θ *to a child*, because it invites gaming and ability-level self-comparison. An adult who has voluntarily chosen a certification is in a different situation: they need the diagnostic, and hiding it is patronising. So θ, box distribution and readiness are visible on goal missions and hidden on story missions — a per-mission flag, not a global setting.

- **Study-group crews.** The team mechanics transfer unchanged: shared readiness, per-member contribution, the anti-carry cap (so one strong member doesn't mask a weak one), and the Teach Assist — which for adults is straightforwardly the protégé effect and the most defensible mechanic in the whole app.

**What is deliberately *not* different:** the remediation loop. Adults benefit from being made to re-generate an answer after being taught at least as much as children do, and the "read the explanation, tap OK" pattern that every professional cert-prep tool ships is exactly the mistake §4.1 exists to avoid.

### 8.7 Horizon-aware scheduling — the one real engine change

An open-ended mission optimises for durable learning with no deadline. A goal mission knows the retention interval, which is the ideal case for spacing research: Cepeda et al. (2008) found the optimal gap is roughly **10–20% of the target retention interval**. When the target is *known*, that stops being a heuristic and becomes a calculation.

`learn/scheduler.js` gains a `horizon` mode with three behaviours:

1. **Interval compression near the date.** Cap every cross-session gap so each mission skill gets at least one review before the exam:
   ```js
   var daysLeft = daysUntil(mission.horizon);
   var maxGapDays = Math.max(1, daysLeft * 0.20);
   gapDays = Math.min(gapDays, maxGapDays);
   ```
   With 60 days left, box 6's 10-day gap is untouched. With 5 days left it compresses to 1 day, so nothing goes unreviewed into the exam.

2. **Coverage-then-mastery weighting.** Early in the horizon the picker over-weights *unseen* mission skills (breadth first — you cannot revise what you have never met). Past ~60% of the horizon it flips to over-weighting *weak* skills (depth). One blended weight, no mode switch the user can feel:
   ```js
   var t = 1 - daysLeft / horizonDays;          // 0 at the start, 1 at the exam
   var freshWeight = 1 - t, reviewWeight = t;
   ```

3. **Domain weighting.** Item selection is biased by the blueprint weight, so a 30% domain gets roughly 30% of the practice. Obvious, and every serious cert-prep tool gets it wrong by drilling whatever has the most content.

**After the horizon passes**, the mission archives rather than deleting — the skills stay in the schedule at long intervals, because "passed the exam" and "still knows it" are different things and only one of them is worth having.

**Honest caveat:** with a very short horizon (days), interval compression pushes the schedule toward massed practice, which is exactly what the spacing literature says is worse for retention. It is still the right call — cramming beats not covering the material at all — but the app should say so plainly rather than pretending a week of compressed review is equivalent to two months of spacing.

### 8.8 Multi-team and cross-household crews (Phase 10)

v1 supports **two teams** (the `tug` renderer) or a free-for-all up to five. Once the Worker exists and devices can converge without meeting, three things open up:

- **3+ teams in one session.** The coordinator already keys everything by seat; `TrackModel.teams` becomes an arbitrary map, and the renderer moves from a two-ended rope to N lanes. Modest work, gated on nothing but the renderer.
- **Cross-household crews.** Cousins in two cities on one Mission. This is the case that actually needs the relay — both for the match and for the log mailbox (§12, Phase 9).
- **A league.** Several crews on the same Mission, comparing progress.

**The league has a tension worth naming rather than papering over.** §7.4 rules out cross-family leaderboards for children on overjustification grounds, and that rule is correct. So:

- **Children's story missions: no league. Ever.** Comparison stays inside the room they are physically in.
- **Crews you deliberately paired with** (cousins, a co-op group) may compare, but the unit is **"new things learned this week"**, not points — the same unit as the family board, chosen for the same reason: it is a metric the youngest child can win.
- **Adult goal missions may have a real leaderboard**, because an adult who chose a certification has already supplied their own extrinsic goal; the overjustification risk is largely spent. Opt-in, among a named group, never global.

This ordering also matters for safeguarding: cross-household play is the first feature that puts a child's device in contact with people outside the house, so pairing, guest scopes (§3.3.4) and the no-chat rule must all be solid *before* Phase 10, not during it.

---

## 9. Content

### 9.1 Priorities for the format

1. **An LLM emits a valid module from a photo of homework in one shot**, no tooling.
2. A human hand-writes a 5-item module in a text editor in 10 minutes.
3. Remediation content is **optional at every level**, with three tiers of fallback.
4. **Media is referenced, never inlined.** Base64 in JSON would destroy sharing and blow the quota.
5. **No executable code in content, ever.** A hard security requirement for a kids' app.

### 9.2 Module schema (abridged — full reference in `docs/CONTENT-FORMAT.md`)

```jsonc
{
  "schema": "quizquest.module/1",
  "id": "milton.spelling.wk12", "version": 3,
  "title": "Spelling — week 12 (magic e)",
  "author": { "name": "Dad", "kind": "ai-assisted", "model": "claude-opus-5" },
  "source": "photo of school homework sheet, 2026-09-05",
  "license": "CC-BY-4.0",

  "bands": ["G2","G3"], "locale": "en-GB",
  "skills":  ["lit.phonics.silent-e", "x.spelling.wk12"],
  "parents": { "x.spelling": "lit.spell" },          // REQUIRED for x.* skills
  "prereqs": { "lit.phonics.silent-e": ["lit.phonics.cvc"] },
  "alignment": { "ccss": ["L.2.2.D"], "engnc": ["Y3 spelling"] },

  "media": { "baseUrl": "./media/milton-spelling-wk12/" },
  "defaults": { "type": "mcq", "difficulty": 4, "band": "G2", "skill": "x.spelling.wk12" },

  "remediationDefaults": {                     // TIER 2: one ladder covers 20 items
    "lit.phonics.silent-e": {
      "ladder": [
        { "kind": "nudge",   "text": "Say the word out loud. Does the vowel say its own name?" },
        { "kind": "example", "text": "cap → cape.  hop → hope.", "image": "magic-e-pairs.png" },
        { "kind": "rule",    "text": "A silent e at the end makes the vowel say its name.",
                             "image": "magic-e-rule.png", "audio": "magic-e-rule.mp3" }
      ]
    }
  },
  "items": [ /* below */ ]
}
```

A full item, showing the remediation payload:

```jsonc
{
  "id": "i7", "type": "mcq", "skill": "lit.phonics.silent-e",
  "difficulty": 4, "band": "G2", "rep": "abstract",

  "prompt": { "text": "Which spelling is correct?", "audio": "q7.mp3", "tts": true },
  "media":  { "image": "cake.png", "alt": "a birthday cake with candles" },

  "options": [
    { "v": "cake", "correct": true },
    { "v": "caik", "misconception": "vowel-team-for-silent-e" },
    { "v": "cak",  "misconception": "omits-silent-e" },
    { "v": "kake", "misconception": "hard-c-spelled-k" }
  ],
  "shuffle": true,

  "remediation": {
    "onMisconception": {                       // jump to the rung addressing THIS wrong idea
      "omits-silent-e":          { "enterRung": 1 },
      "vowel-team-for-silent-e": { "enterRung": 2 },
      "hard-c-spelled-k":        { "enterRung": 2,
                                   "text": "'c' before a, o, u says /k/. We don't need a k." }
    },
    "ladder": [
      { "kind": "nudge",   "text": "Listen: /kayk/. Does the a say its own name?", "audio": "h1.mp3" },
      { "kind": "example", "text": "cap → cape. The e is silent, and it makes the a say A.",
                           "image": "cap-cape.png" },
      { "kind": "rule",    "text": "Magic e makes the vowel say its name.", "image": "magic-e-rule.png" },
      { "kind": "reveal",  "text": "It's cake — c, a, k, e. The e is silent." }
    ],
    "generate": {                              // MANDATORY production step
      "type": "assemble",
      "prompt": { "text": "Build the word", "audio": "g1.mp3" },
      "tiles": ["c","a","k","e","i","p","k"], "answer": "cake"
    },
    "proveIt": { "ref": "i7v1" }
  },

  "variants": ["i7v1", "i7v2"],
  "why": {                                     // occasional elaborative-interrogation prompt
    "question": "Why does it need the e?",
    "options": [ { "v": "It makes the a say its name", "correct": true },
                 { "v": "Because every word ends in e" }, { "v": "I just knew it" } ]
  }
}
```

Variants are ordinary items marked `hidden: true` — never served fresh, reachable only as prove-it or follow-up.

### 9.3 Variants and follow-ups — two mechanisms only

No server, and **no `eval()` of authored strings** (a security hole and a CSP problem). So:

1. **Enumeration.** Author 2–3 `variants` per item. LLMs are excellent at this and it costs them nothing — a 24-item module yields 48 variants without complaint. **The primary path.**
2. **Whitelisted declarative templates** for procedural domains — exactly the pattern already in MazeGame's `js/maze/math.js`:

```jsonc
{ "id": "t1", "type": "template", "skill": "num.add.within20.regroup", "difficulty": 5,
  "gen": "add", "params": { "a": [4,9], "b": [4,9], "constraint": "carry", "choices": 4 },
  "remediation": { "ladder": [{ "kind": "example",
                    "text": "Make ten first: 8+5 → 8+2=10, then +3 = 13." }] } }
```

v1 generators: `add`, `sub`, `mul`, `div`, `compare`, `count`, `sequence`, `missing-number`, `letter-recognize`, `spell-from-list`. **`constraint` is an enum, not an expression** (`carry`, `no-carry`, `borrow`, `exact-ten`). Unknown `gen`/`constraint` → item skipped at load with a validation warning. Templates draw from the match seed, preserving determinism.

### 9.4 Three-tier remediation fallback

What makes "easy to add modules" a real claim rather than a slogan:

1. **Item-level** `remediation` — best.
2. **Module-level** `remediationDefaults[skillId]` — one ladder covers 20 items. The sweet spot for hand-authoring.
3. **Engine-level generic ladder** — `nudge: "Have another careful look."` → `reveal: "The answer is X."` → generic generate (reshuffled original, chosen wrong option retained).

**A module with zero remediation content is valid and playable.** Never make good remediation a precondition for shipping content — that is how content ecosystems die.

### 9.5 Manifest and distribution

`content/index.json`:

```jsonc
{
  "schema": "quizquest.index/1",
  "modules": [
    { "id": "core.letters.upper", "title": "Uppercase letters", "url": "modules/core-letters-upper.json",
      "bands": ["PN","N","R"], "strands": ["lit"], "items": 26, "version": 4,
      "bytes": 21400, "hasAudio": true, "verified": true },
    { "id": "milton.spelling.wk12", "title": "Spelling — week 12", "url": "modules/milton-spelling-wk12.json",
      "bands": ["G2","G3"], "strands": ["lit"], "items": 24, "version": 3, "verified": false }
  ],
  "packs": [ { "id": "core", "title": "Starter pack",
               "modules": ["core.letters.upper","core.count.10","core.shapes"], "precache": true } ]
}
```

The **`core` pack is bundled and precached by the service worker**, so a first-run device with no network has a playable game. Everything else is fetched and cached on demand — the same trade MazeGame makes with its 28MB of music.

**Module transfer on join.** When devices connect, the host ships its module set to joiners (`module` message, chunked). A guest who has never seen your homework module can play it immediately. **Media is never transferred** — only URLs; a module shared offline without images degrades to text+TTS, which must be a *supported, tested* degradation, not a crash.

### 9.6 The authoring pipeline — protect the 60 seconds

**The killer loop is yours, not the kids'.** *Photo of tonight's homework → 60 seconds → a game they ask to play.* At 60 seconds it happens nightly; at 10 minutes it happens twice.

`docs/AUTHORING-PROMPT.md` is a single complete, schema-embedding LLM prompt. Workflow: point Claude at the photo and that prompt → get `content/modules/<id>.json` → add a line to `index.json` → `npm run validate` → `npm run deploy`.

**`scripts/validate-modules.mjs` is not optional.** Runs in CI and locally:
- schema shape and required fields
- skill-id regex; strand registered in `skill-registry.json`; every `x.*` skill declares a parent
- every item has a resolvable correct answer
- every referenced media file exists on disk
- every `proveIt.ref` and `variants[]` id resolves; no duplicate item ids
- prompt word count within the declared band's limit
- `gen` and `constraint` whitelisted

**Unvalidated content will crash a child's game mid-race, and a crash mid-race is unrecoverable trust damage.**

**AI content will contain errors** — wrong answers, ambiguous distractors, reading levels three years off. Schema validation catches *structure*, never *semantics*. Mitigations: **parent-preview mode** (play it yourself first), a one-tap kid-facing **"this question is broken"** flag that suppresses the item locally, emits a `mod` event and surfaces in the parent report, and a `verified` flag gating whether a module may update θ.

### 9.7 Security

All authored text inserted with `textContent`, **never `innerHTML`**. No `eval`, no `Function`, no `<script>` from content. Strict CSP meta tag. Media only from same-origin or the module's declared `baseUrl`.

---

## 10. What makes kids want more modules

Honest premise: retention in children's apps is driven overwhelmingly by **co-play** — a sibling or parent in the room — not by mechanics. The meta-game serves the social situation rather than replacing it.

1. **Fresh badge + first-play ritual.** A new module's first play is **co-op, not versus** — nobody meets unfamiliar content while losing a race. A new module appears on the map as a **newly sighted island**.
2. **Collections, not currency.** Mastering (not merely completing) a module yields a **card** for an album. Cosmetic, unspendable, untradeable for progress. Album completion is an *unexpected* reward.
3. **Kid-authored modules — the strongest lever available.** A five-item builder: take a photo, record your voice asking a question, add three answers. *"Make a quiz for your brother."* Generation effect + relatedness + autonomy at once, and kids out-author adults. Marked `verified:false`, awards steps, **never updates θ**.
4. **The Homework Boss** — the weekly map storm (§8.2).
5. **The family board, measured in the right unit.** Not points: **"new things learned this week"**. A metric on which the 4-year-old routinely beats the 10-year-old, because the youngest has the most new things available. Deliberate, and the most important line in this section.
6. **The gallery.** Traces and creative work accumulate, exportable as an image.
7. **Cheer taps.** Four emoji, one message type, ~20 bytes, disproportionate relatedness payoff.
8. **Module of the week.** A curated pack in the repo; a reason to open the app on a homework-free day.
9. **The fridge QR.** A printed reference QR (`{id, version, url, hash}`, ~120 bytes) is a physical artefact in the house. Physical artefacts beat notifications.

**Deliberately not built:** daily-streak pressure, loot boxes, energy timers, purchases, cross-family leaderboards, guilt-trip notifications. Every one raises short-term engagement and is the overjustification effect in a costume.

---

## 11. Storage layout

```
quiz/device.v1                 {deviceId, campaignId, paired:[deviceId...]}   (not namespaced)
quiz/log.v1.<n>                the family event log, chunked ~200KB per key   ← SOURCE OF TRUTH
quiz/vv.v1                     version vector {deviceId: highestSeq}
quiz/users.v1                  [{id, name, band, avatar, pinHash, createdAt}]
quiz/activeUser.v1
quiz/derived.v1.<userId>       CACHE of ItemState/SkillState — rebuildable
quiz/missions.v1               mission definitions (crew, skills, horizon, skin)
quiz/mission-state.v1          CACHE of map / readiness state — rebuildable
quiz/modules.v1                installed module refs + parent approval
quiz/settings.v1.<userId>      band override, audio, motion, theme
quiz/gallery.v1.<userId>       trace strokes (Int16 arrays), capped
quiz/roomServer.v1             Cloudflare Worker URL                          (Phase 9)
```

**Derived shapes, recomputed by the fold — never merged, never transmitted:**

```js
// ItemState — keys abbreviated deliberately; ~70 bytes serialised.
{ b:2,        // box
  dt:41,      // dueTurn (session scope, absolute turn index)
  ds:5,       // dueSession (cross scope)
  dh:1757..., // dueAfter epoch ms (cross scope floor)
  l:1,        // lapses
  r:2,        // last rung reached
  ft:false,   // first-try correct
  a:false,    // ever assisted
  rec:true,   // recovery bonus already paid (anti-farm)
  n:5, t:1757... }

// SkillState — one per skill id AND per ancestor prefix.
{ th:4.2, n:34, c:28, st:3,
  ema:0.79,   // EMA of correctness, alpha 0.2 — drives prerequisite backoff
  rec:6,      // recovered count — feeds the "turned into knows" counter
  t:1757... }
```

**Budgets.** Event log: ~55 bytes/event, ~500 events/week for a 3-child family → ~1.4 MB/6 months raw, compacted per §3.3.5. Derived caches: 5,000 items ≈ 350 KB. Total comfortably inside a 5 MB quota with compaction running. Preserve `store.js`'s defensive-read discipline exactly — a wiped, full or blocked storage must never take the game down, and here it genuinely cannot, because the log rebuilds every cache.

---

## 12. Build phases

Each phase is independently shippable. Do not start the next until the current is green.

### Phase 1 — Pure core, headless (no UI at all)
`js/sync/{hlc,event,fold,merge}.js`, `js/content/{bands,skills,validate,rng,templates}.js`, `js/learn/{ability,scheduler,session,remediation}.js`, `js/track/model.js`, `js/mission/model.js`.

**Event sourcing must land here.** It cannot be retrofitted — every piece of state must be derived from day one or the replication design is dead.

*Done when:* `npm test` green, `npm run check` green, and `scripts/simulate.mjs` runs a synthetic learner through 500 items producing sane box distributions and θ curves; and `scripts/synctest.mjs` shows two simulated devices converging.

### Phase 2 — Single player, hot seat, six item types
`index.html`, `main.js`, screens (home/profiles/play/results), `items/*`, `store.js`, `sync/log.js`, `users.js`, the bundled `core` pack, service worker.
*Done when:* a real child plays a 10-minute session end-to-end on a phone, gets things wrong, is taught, recovers, and the follow-ups actually come back.

### Phase 3 — The race
`track/render.js` + `themes.js`, `race` theme, checkpoints, celebrations, the end-of-session "what you learned" card.
*Done when:* single-player racing feels good and the recovery moment lands.

### Phase 4 — Missions: the Expedition
`mission/{model,render}.js`, `mission/regions.js`, `screens/map.js`, shimmering landmarks, the weekly tide, postcards, crew roles.

Build the **Mission model generically** (§8.0) even though only the `story` kind ships here — `kind`, `skills`, `targetTheta`, `horizon` and `skin` all exist from the start, with `horizon: null`. Retrofitting a horizon into a hardcoded expedition would mean rewriting the scheduler.

*Done when:* your kids ask to open the app on a day with no homework, and a two-week gap feels welcoming rather than shaming.

### Phase 5 — Multiplayer + replication
Port `coordinator.js` (extended with steps/checkpoints/shared items/cheers), `p2p.js`, `lan.js`, `local.js`, `mpscreen.js`, `lan-server.mjs`. Add `arena.js` big-screen host, `tug` theme, `sync/{gossip,pairing}.js`, module transfer on join.
*Done when:* `scripts/mptest.mjs` drives two real browsers through a real WebRTC match **and their logs converge**; and a laptop + three phones works on your home WiFi.

### Phase 6 — Trace and drawing
`items/trace.js` + `trace-score.js`, band-scaled tolerances, stroke storage, the gallery.
*Done when:* a 3-year-old can trace an A and be told they got it, and a 7-year-old cannot pass by scribbling.

### Phase 7 — Content pipeline at scale
`docs/AUTHORING-PROMPT.md`, `scripts/validate-modules.mjs`, CI workflow, parent-preview, the "this question is broken" flag, the parent report screen.
*Done when:* photo of homework → deployed playable module in under 2 minutes.

### Phase 8 — Meta-game
Album/cards, family board, kid-authored builder, the year-end map poster export.

### Phase 9 — Remote play + the sync mailbox (Cloudflare)
`worker/src/index.js` — a Durable Object per room, 4-digit codes, WebSocket relay. **Reuses `net/lan.js` unchanged**; only the URL differs.

The Worker also becomes an **event mailbox, not a source of truth**: paired devices push events and pull others', so two devices that never physically meet still converge. This is a far better role for it than a room server alone, and it keeps the "no server owns the truth" property intact — the mailbox holds an unordered bag of immutable facts and has no opinion about them.

*Note:* this breaks the "works with no internet" claim for remote matches only. Local modes stay offline-capable.

### Phase 10 — Multi-team, cross-household crews, goal missions
Depends on Phase 9's relay. Three separable pieces, shippable in this order:

1. **`lanes` renderer** — 3+ teams in one session. `TrackModel.teams` is already an arbitrary map, so this is renderer work only.
2. **Cross-household crews** — cousins in two cities on one Mission, converging through the mailbox. Pairing, guest scopes and the no-chat rule must be solid *before* this, not during it (§8.8).
3. **Goal missions** — `horizon` mode in the scheduler (§8.7), the readiness dashboard, the `blueprint` skin, per-mission visibility of θ, and a syllabus→modules authoring prompt.

Goal missions are the point at which the app stops being only a kids' app. Worth treating as a genuine second product with its own playtesting, not a skin.

---

## 13. Verification

**Unit tests** — `node --test`, no framework, named as full English sentences like MazeGame's:

- `hlc.test.js` — "a clock never goes backwards under skew"; "two events from different devices never tie"
- **`fold.test.js` — the most important file in the project:** "two devices that play offline and then merge produce byte-identical derived state, in either merge order"; "applying an event twice changes nothing"; "compaction below the stable horizon preserves the fold exactly"; "an event from a device restored from backup is ignored as a duplicate"
- `merge.test.js` — "a version-vector diff ships exactly the missing events and no others"; "a guest's events never enter the family log"
- `ability.test.js` — "a new skill inherits a prior from its parent rather than cold-starting"; "band clamping never lets a Reception profile exceed difficulty 5"
- `scheduler.test.js` — "a failed item comes back within 2 turns"; "an item correct on first exposure goes straight to a cross-session box"; "gap jitter is deterministic under the same seed"; "no item starves past 4 turns overdue"
- `session.test.js` — "the picker never serves two items from the same skill parent back to back"; "the picker never starves — it falls back to a template"
- `remediation.test.js` — "the entry rung rises when theta is below item difficulty"; "the generate step is always higher-production than the original"; "a child can always exit via assisted success"; "rung 1 never solves the target item"
- `mission.test.js` — "a landmark never un-claims"; "the next landmark is always within 2 legs"; "a solo leg advances the crew's mission"; "the shimmer count never exceeds 3"; "a two-week absence opens more map, never less"; "with 5 days left every mission skill is scheduled for at least one review"; "coverage is weighted over mastery early in a horizon and the reverse near the end"; "a 30%-weight domain receives roughly 30% of practice"; "readiness never reports a predicted score"; "a mission archives rather than deleting when its horizon passes"
- `track.test.js` — "recovery pays more than first-try correct"; "the recovery bonus is paid once per item ever"; "no member exceeds the anti-carry cap"
- `content.test.js` — the validator accepts the reference module and rejects each malformation individually
- `trace.test.js` — "a scribble covering the glyph fails on precision"; "a 3-year-old's wobbly A passes at PN tolerance and fails at G2"
- `coordinator.test.js` — in-memory bus, ported harness: "checkpoint regroup waits for the pack"; "catch-up is capped at 15% of track length"; "a shared item is only chosen from the intersection of eligible pools"

**Integration (Playwright, dev-only, not in `npm test`)** — ported from MazeGame:
- `smoke.mjs` — real browser, real UI, one full session. **Any console error fails the run.**
- `mptest.mjs` — two browser contexts over a real WebRTC data channel, **including a log merge**
- `synctest.mjs` — three simulated devices playing apart and converging in every pairwise meeting order
- `offlinecheck.mjs` — load online, wait for precache, cut the network, assert it still plays
- `simulate.mjs` — headless soak: synthetic learners of each band across every module, asserting no starvation, no infinite remediation, sane box distributions, and a plausible Expedition pace over a simulated school year

**Gates that must stay green:** `npm test`, `npm run check` (ES2018), `npm run validate` (content), the layering grep.

**Human verification, which matters more than any of the above:** sit with each of your kids for one session. Watch for — do they understand the question without help? Does the wrong-answer moment feel bad? Do they notice the follow-ups? Does the youngest feel like they contributed in team mode? Do they ask for another round? And a week later: **do they want to see the map?**

---

## 14. Risks and honest limitations

**Replication — what it does and does not fix:**

- It **does** fix cross-device profile sync, which was the biggest hole in the previous draft, and it makes "any device can host" true rather than aspirational.
- **Two devices that never meet and never use the Phase 9 mailbox never converge.** Real limitation. A family with a device that only ever plays alone gets a divergent view until it meets another. Mitigate by making pairing prominent at setup, and by shipping the mailbox.
- **Clock skew** beyond a few minutes can order events oddly. HLC bounds it but does not eliminate it. The impact is a slightly different θ path, never corruption — but say so.
- **Compaction must actually be implemented**, or a heavy family hits the quota in ~2 years. It is easy to defer and easy to forget.
- **Event sourcing costs ergonomics.** Every state change becomes "emit a fact, re-fold" instead of "mutate". Under the ES2018 rule this is more verbose than it would be elsewhere. It is worth it, but it is a real tax on every feature.
- **Trust scopes are load-bearing.** Getting §3.3.4 wrong leaks a child's learning history to a visiting device. Build pairing before gossip, not after.

**Where the design overreaches:**

- Fifteen item types is too many. **Ship six.** The catalog is a roadmap, not a v1 spec.
- **Remediation is expensive in session time** — 20–60 s a loop. Eight failures in a 15-minute session means half the session is remediation and the race barely moves. The 6-per-session cap is essential and will need hard tuning.
- **Prove-it doubles the cost of a failure** (3–4 item slots). Correct pedagogically, but a session covers less ground than a parent expects. Set expectations in the parent report.
- **The Expedition could become the whole product** and swallow the effort. It is Phase 4 for a reason: the remediation loop has to be good *first*, or the map is decoration on a bad game.
- **Goal missions are a second product wearing the first one's clothes.** The engine genuinely transfers, but the audience, the tone, the content sourcing and the trust bar are all different — an adult who fails a certification after using this will blame the app. Keep it in Phase 10, treat readiness as diagnostic and never predictive, and resist letting it pull the kids' product toward a "study tool" feel.
- **Short horizons force massed practice**, which the spacing literature says is worse. Say so in the UI rather than pretending compressed review equals distributed review.
- **Cross-household play is the first feature that puts a child's device in contact with people outside the house.** Pairing, guest scopes and the no-chat rule must be solid before Phase 10, not during it.
- **Teach Assist may not survive contact with real siblings.** Needs an easy off-switch.

**Where the learning claims must be hedged:**

- **This app has no evidence base.** The *mechanics* have evidence; the *product* does not. The honest claim is *"built from the mechanics with the best evidence, deliberately avoiding the ones with none"* — never *"this will raise your child's reading level"*.
- Realistic ceiling **d ≈ 0.3**, part of it novelty. The Expedition is specifically an attempt to outlast the novelty, and that attempt may fail.
- **Bloom's 2 sigma is folklore. Do not repeat it.** Growth mindset is d≈0.08. Learning styles do not exist — if asked for a "visual learner mode", the answer is no.
- θ from 20–60 observations is noisy. A heuristic, not psychometrics, and never shown to a child as a score.

**Operational:**

- **ES2018 friction** — the HLC, the fold and the scheduler are exactly where you reach for `?.`.
- **localStorage 5 MB** — strokes not PNGs, capped gallery, compaction actually running.
- **iOS audio autoplay** — the parent starts the session, unlocking the context once.
- **Accessibility** — MazeGame's weakest area, and a quiz game is far more text/AT-dependent than a maze. Required from Phase 2, not retrofitted: roles and live regions for feedback, focus management in the remediation modal, `prefers-reduced-motion`, colourblind-safe palettes with **no colour-only correctness signals**, band-specified touch targets, captions for every audio prompt where reading is possible.
- **Safeguarding** — no chat, no free text between devices, local-network joins only, guests get nothing durable. **Never add public matchmaking without revisiting this.**

---

## 15. Deferred — your call, not built unless you say so

- **Peer-graded open-ended drawing** ("draw a cat", voted on by other players). Genuinely the most fun thing available and only ~1 KB per drawing over the wire — but you chose trace-only grading, so it is out. Say the word and it becomes a Phase 8 item.
- **Paste-JSON module intake** in-app. You chose repo-JSON; the paste box is ~80 lines and would let you try a module on the couch before committing it.
- **Load module from URL** — flexible, but a network dependency and a trust question.
- **Confidence tap** ("sure / not sure") to prioritise hypercorrection. Real but modest benefit, friction on every item.
- **Speak-aloud items** — Chrome-only and streams audio to Google. Recommend never.

---

## 16. First actions on approval

1. Create `/Volumes/MacMiniFiles/QuizGame/docs/` and write this plan out in full as `docs/PLAN.md`, plus `ARCHITECTURE.md`, `LEARNING.md`, `CONTENT-FORMAT.md`, `AUTHORING-PROMPT.md`, **`SYNC.md`** (the event log, HLC, gossip and trust scopes in full), **`MISSIONS.md`** (story vs goal missions, horizon scheduling, readiness), `ROADMAP.md`, `skill-registry.json`.
2. `git init`, scaffold `package.json`, `.gitignore`, `.nojekyll`, `README.md`.
3. Port `store.js`, `ui/dom.js`, `users/users.js`, `content/rng.js`, `scripts/check-syntax.js`, `scripts/serve.mjs`, `scripts/deploy.sh` from MazeGame.
4. Begin Phase 1, starting with `sync/hlc.js` and `sync/fold.js` and their tests — because if the fold is not deterministic, nothing above it works.
