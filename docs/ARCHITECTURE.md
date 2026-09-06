# Architecture

The full reasoning for every decision here is in [PLAN.md](PLAN.md). This document is the
map you read before touching the code.

---

## The stack, and why

| Decision | Choice | Why |
|---|---|---|
| Language | Vanilla ES modules, **ES2018 only** | Runs on iOS 12 hand-me-down iPads, which is exactly the device a child gets |
| Framework | **None** | No build step is the whole point; the repo *is* the site |
| Build step | **None** | `git push` deploys. No `npm install` needed to *run* |
| Types | JSDoc comments only | TypeScript needs a compile step |
| Styling | Plain CSS + custom properties on `:root` | No preprocessor, no Tailwind, no CSS-in-JS |
| Rendering — track/map | Canvas 2D | Smooth animation, DPR-aware |
| Rendering — questions | DOM | Text, buttons, images and accessibility all come free |
| Persistence | localStorage, behind a defensive wrapper | A wiped, full or blocked storage must never take the game down |
| Durable model | **Append-only event log + deterministic fold** | See [SYNC.md](SYNC.md) |
| Offline | Service worker precaching the app + the core content pack | |
| Dependencies | `playwright` + `ws`, **devDependencies only** | Tests and the optional LAN server |

### The Safari 12 rule

Shipped JS is ES2018. Banned: `?.`, `??`, logical assignment, class fields, static blocks,
`Array.at`, `String.replaceAll`, `Object.hasOwn`, `flatMap`, `globalThis`, BigInt.
`js/vendor/`, `scripts/` and `test/` are exempt.

`npm run check` enforces it mechanically. Keep it green. Be warned: the hybrid logical
clock, the fold and the scheduler are exactly the code you reflexively write with `?.`.

---

## The layering rule

This is the single most important structural constraint in the project, and it is what
makes the interesting parts testable without a browser.

```
PURE — no DOM, no network, no storage. 100% unit tested.
  js/sync/{hlc,event,fold,merge}.js     the event log and its fold
  js/learn/*                            ability, scheduler, remediation, session
  js/content/{bands,skills,validate,templates,rng}.js
  js/track/model.js
  js/mission/model.js
  js/net/coordinator.js

STORAGE — localStorage only
  js/store.js  js/sync/log.js  js/users/users.js  js/settings/settings.js

DOM — no game rules
  js/items/*  js/track/render.js  js/mission/render.js  js/screens/*  js/ui/*

TRANSPORT — I/O only, no rules
  js/net/{p2p,lan,local}.js  js/sync/gossip.js  js/sync/pairing.js
```

**Nothing in PURE may import anything below it.** `npm run check` greps for violations.

The payoff: tests drive the real scheduler, the real ability model, the real duel
arbitration and the real fold — not mocks.

---

## Module map

```
js/sync/       hlc.js      hybrid logical clock: [wallMs, counter, deviceId]
               event.js    event constructors + validation
               fold.js     events -> ItemState / SkillState / mission state
               merge.js    version vectors, diffing, dedup
               log.js      append / read / compact against localStorage
               gossip.js   the sync-have / sync-events exchange
               pairing.js  family pairing + campaignId + trust scopes

js/content/    bands.js       age-band capability table (modality, item types, tolerances)
               skills.js      skill-id parse/validate/ancestors
               validate.js    module + item schema validator (shared with CI)
               registry.js    load index.json, fetch/cache modules, resolve items
               templates.js   whitelisted procedural generators
               rng.js         seeded Lehmer RNG

js/learn/      ability.js     Elo-like theta, hierarchical ancestor update
               scheduler.js   two-clock Leitner boxes + horizon mode
               session.js     the item picker + session queue
               remediation.js the ASK -> TEACH -> GENERATE -> PROVE state machine

js/items/      index.js       type registry; {node, destroy} contract
               mcq / tapimage / listen / assemble / count / trace
               trace-score.js PURE stroke-vs-path geometry

js/track/      model.js       TrackModel + step maths           [PURE]
               render.js      canvas painter (no rules)
               themes.js      race / tug / relay / lanes

js/mission/    model.js       story + goal missions, readiness  [PURE]
               render.js      map / readiness renderers
               regions.js     the expedition's region data

js/net/        coordinator.js authoritative match rules, no I/O  [PURE]
               p2p.js         WebRTC + QR signalling
               lan.js         WebSocket client (LAN *and* Cloudflare)
               local.js       hot-seat transport (all seats on one device)
               mpscreen.js    connect / lobby UI
```

---

## Networking — one coordinator, four transports

`coordinator.js` is pure and takes an injected io interface. Every transport supplies one.

```js
/** @param {object} io  {broadcast(msg, exceptSeat), sendTo(seat, msg), now(), seats()} */
export function createCoordinator(io) { ... }
```

| Transport | Signalling | Reach | Offline |
|---|---|---|---|
| `local.js` hot seat | none — all seats on one device | one device | yes |
| `p2p.js` WebRTC | QR handshake (offer QR → answer QR) | same WiFi / hotspot | yes |
| `lan.js` + `scripts/lan-server.mjs` | 4-digit room code | same WiFi, a laptop hosts | yes |
| `lan.js` + Cloudflare Durable Object | 4-digit room code | anywhere | no |

**The last two are the same client file.** A Cloudflare Durable Object speaking WebSocket
is functionally identical to `lan-server.mjs`, so remote play needs no new client code —
only a different URL:

```js
// lan.js — resolve the room server once, so the same client speaks to a laptop on the
// LAN and to a Cloudflare Durable Object without branching.
function roomServerUrl() {
  var override = readRaw('quiz/roomServer.v1');   // wss://quiz-rooms.<you>.workers.dev
  if (override) return override;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}
```

### Why big-screen mode needs a room code, not a QR

The QR handshake is a *two-way* scan: the host shows a QR, the joiner scans it, the joiner
shows an answer QR, and the host scans that back. On a TV that is impossible — no camera.
On a laptop it means scanning four phones in sequence.

- Big screen on a **laptop** → `npm run lan`, everyone opens the printed address, joins with
  a 4-digit code. Zero cloud, works offline. **This is the recommended family setup.**
- Big screen on a **TV with no laptop** → the Cloudflare Worker (Phase 9).
- **Two phones, no laptop, no internet** → the QR handshake, which stays the offline fallback.

---

## The wire protocol

Single-letter JSON messages, one per line of intent.

| msg | direction | payload |
|---|---|---|
| `hi` / `hi-ok` | join | `{name, band, avatar, elig, campaignId}` → `{seat, roster}` |
| `roster` | → all | players, colours, bands |
| `start` | → all | `{seed, mode, trackLength, checkpoints, teams, theme}` |
| `step` | client → co → all | `{d, skillHash}` — **question content never goes on the wire** |
| `state` | co → all | `{positions, leg}` at ~4 Hz, authoritative |
| `pit` | client → co → all | `{on}` — *"Ana is fixing something"*, never the content |
| `cp` | co → all | `{index, arrived[]}` checkpoint regroup |
| `cheer` | client → co → all | `{to, emoji}` |
| `shared` / `shared-answer` / `shared-result` | | duels, by item id |
| `finish` / `results` | | `{steps, recovered, firstTry}` / scoreboard |
| `module` | host → joiner | chunked module JSON |
| `sync-have` / `sync-events` | paired ↔ paired | version vectors and event batches |
| `pair-req` / `pair-ok` | | one-time family pairing, parent-gated |

### The determinism caveat

Maze's elegant property is that **only a seed goes on the wire** and every device builds the
identical maze. **That does not fully survive here**, because each player's question sequence
depends on their own private scheduler state, which other devices cannot know.

Two classes of item resolve it:

- **Personal items** — picked locally by that player's scheduler. Only the *outcome* is
  transmitted. Question content never leaves the device, which is also a nice privacy property.
- **Shared items** — duels and buzzer rounds. The coordinator picks from the intersection of
  players' declared eligibility and broadcasts **by item id + seed**; every device already
  has the module.

Eligibility is declared at join as a compact summary, never the whole scheduler state:

```js
elig = { m: ['core.letters.upper','milton.spelling.wk12'], d: [0,3,9,12,4,1,0,0,0,0] }
//        installed module ids                              item count per difficulty 1..10
```

---

## Screens

No router library and no URL routing — the hash is used only for the `#p2p=` join deep link.
`main.js` holds one `current` handle and swaps DOM.

```js
var root = document.getElementById('app');
var current = null;                       // {destroy}
function show(node) { ... }               // static screens
function showMounted(mounter) { ... }     // stateful screens return {destroy}
```

**Mount contract:** every stateful subsystem is `mountX(hostNode, opts) -> {destroy(), ...}`.
Callbacks go down (`mountPlay(host, {onExit, onFinish})`), never events up.

**State management:** none. Module-level state re-read from storage at the top of every
screen function. Persistence is the source of truth; the fold rebuilds it.

---

## Security

- All authored text is inserted with `textContent`, **never `innerHTML`**.
- No `eval`, no `Function`, no `<script>` from content. Template generators are a
  **whitelist**, and `constraint` is an enum, not an expression.
- Strict CSP meta tag. Media only from same-origin or a module's declared `baseUrl`.
- Family devices are **paired** before they exchange any durable state. A guest joining a
  match receives the match and any modules needed to play it, and nothing else.
- No chat, no free text between devices.

---

## House conventions (inherited from Maze, worth keeping)

1. **Every file opens with a block comment stating its job and its boundary** — e.g.
   `coordinator.js`: "authoritative match logic, no I/O".
2. **Comments explain *why*, and name the bug that motivated the code.** This is the
   dominant stylistic signature of the sibling project and it is worth preserving.
3. **Labels and descriptions live in exported constant maps** next to the data, and the UI
   iterates `Object.keys(...)` — so a new setting is one entry in each map, not new markup.
4. **Test names are full English sentences describing behaviour**, not
   `describe/it` fragments.
5. Commit messages are prose sentences.
