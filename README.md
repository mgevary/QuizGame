# Quiz Quest

A multiplayer learning game for families — built as a **zero-dependency static web app**:
no build step, no server, no framework. It plays entirely on-device and works with **no internet at all** after the
first visit, and does **multiplayer over local WiFi** with no server on the
internet: pass one device round, run a room server on a laptop, or connect two
phones by QR with the internet switched off. With the room server on, opening
the app opens a game: the first device hosts, every other device sees it and
joins with one tap, and the host is told by name when someone arrives.

It is modelled on the architecture of its sibling project, [Maze](https://github.com/mgevary/MazeGame).

## What makes it different

Most quiz apps show a red X and move on. **This one treats a wrong answer as the most
valuable event in the session.** When a child gets something wrong:

1. They are told **exactly** what went wrong — not "incorrect", but *"'cak' is missing the magic e"*.
2. They are taught it, entering a hint ladder at a rung chosen by how much they already know.
3. They must **re-produce** the answer — build it from tiles, not tap "OK".
4. They get a **different** question on the same skill to prove it.
5. That item comes back — a few questions later, then tomorrow, then in three days.

**Recovering a mistake moves your racer further than getting it right first time.** That
is deliberate, and it is the whole philosophy.

## The three layers

| Layer | What it is | Timescale |
|---|---|---|
| **The question** | ask → judge → teach → generate → prove → schedule | seconds |
| **The race** | everyone races on their own devices; correct answers move you forward | 10–20 minutes |
| **The mission** | a crew works toward a shared goal that all the learning feeds | months |

For kids the mission is an **Expedition** — a map that grows over months, where every place
claimed is a thing they actually know. For a teenager or an adult it is the same engine
pointed at a real exam date, with a readiness readout instead of a map.

## Fair across ages

A 4-year-old and a 10-year-old can race each other. Every player is served questions at
**their own** ~85% success point, so identifying the letter B and working out 7×8 move the
racer the same distance. There is no visible handicap, because kids notice handicaps and
resent them.

Ages supported: **2 (pre-nursery) through 14**. Pre-readers get audio and pictures with no
text at all.

## Adding content

Modules are plain JSON in `content/modules/`. The intended workflow is:

```
photo of tonight's homework  →  an LLM + docs/AUTHORING-PROMPT.md  →  a module  →  npm run deploy
```

That loop is meant to take about a minute. See [docs/CONTENT-FORMAT.md](docs/CONTENT-FORMAT.md).

## Development

Everything is vanilla ES modules. The only dependencies are for testing.

```
npm install
npm test            # unit tests — sync, learning core, content, track
npm run check       # Safari 12 syntax/API compatibility scan
npm run validate    # validate every module in content/
npm run serve       # local server on :8321 for device testing
npm run lan         # room server on :8330 — games open themselves and find each other; codes still work

node scripts/smoke.mjs        # drives a real solo session in a real browser
node scripts/mobiletest.mjs   # the same on an emulated iPhone, with a finger — fails on a stuck scroll or a sticky highlight
node scripts/mptest.mjs       # two browsers, one room server, one real game
node scripts/teamtest.mjs     # a real two-player pass-and-play game
node scripts/offlinecheck.mjs # boots and plays with the network cut
node scripts/livecheck.mjs    # the same against the deployed site
node scripts/screenshot.mjs   # visual walkthrough into shots/
```

`npm run sim` plays a whole simulated term for every age band and fails on
starvation, runaway remediation or an ability estimate that drifts.
`npm run synctest` proves four devices with skewed clocks converge
byte-for-byte in any merge order.

**Safari 12 rule:** shipped JS is ES2018 only — no optional chaining, no `??`, no class
fields. `npm run check` enforces this; keep it green. Old hand-me-down iPads are exactly
the device a child gets.

Full architecture in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The complete build plan,
including every technical decision and its reasoning, is in [docs/PLAN.md](docs/PLAN.md).

## Honest claims

The **mechanics** in this app have good evidence behind them — retrieval practice, spaced
repetition, immediate task-level feedback, the generation effect. **The product does not.**
Serious-games meta-analyses land around d ≈ 0.3, and part of that is novelty.

Three things we will not repeat:

- **Bloom's "2 sigma"** is folklore. The original studies were small and short; modern
  mastery-learning meta-analyses land near d ≈ 0.5.
- **Growth mindset** effects are small (d ≈ 0.08). We use process-worded praise because the
  *feedback* literature demands it, not because of mindset.
- **Learning styles do not exist.** There is no "visual learner" mode and there never will
  be. We offer audio and pictures because a 3-year-old cannot read, and because dual coding
  helps everyone — not because some children are auditory learners.

See [docs/LEARNING.md](docs/LEARNING.md) for the full research basis with honest evidence
grades, including which findings are contested.

## Privacy

No accounts, no analytics, no network calls to anywhere. All state is on-device. Devices in
a family are **paired** once and then replicate their learning history to each other directly;
a friend who joins a match receives the match and nothing durable. There is no chat and no
free text between devices.

## License

MIT.
