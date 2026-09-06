# What is missing

Written after the first playable went live at https://mgevary.github.io/QuizGame/.
Ordered by how much each gap costs against the brief: educational, fun,
visually interactive, with team dynamics.

---

## 1. Multiplayer is pass-and-play only — no networked play yet

Pass-and-play is built and is the front door: everyone shares one device and
takes turns, in four modes, with the team mechanics live. That covers a family
round a kitchen table and needs no infrastructure at all.

What is **not** built is play across devices. The pure half is done and tested
— `net/coordinator.js` runs the match with no network in it, driven by
`net/local.js` — but there is no transport that crosses a room:

| Exists | Missing |
|---|---|
| `net/coordinator.js` — the match, no network or DOM, 17 tests | `net/p2p.js`, `net/lan.js`, `net/mpscreen.js`, `screens/arena.js` |
| `net/local.js` — pass-and-play, drives the real coordinator | `scripts/lan-server.mjs`, `scripts/mptest.mjs` |
| `net/discovery.js` — probes for a room server, finds other tabs | any transport that crosses a device boundary |
| QR/deflate vendor libraries already in `js/vendor/` | the QR handshake screen |
| The wire protocol, specified in ARCHITECTURE.md | — |

**Order to build it, cheapest first:**

1. **Big-screen host** (`screens/arena.js` + `scripts/lan-server.mjs`). The
   family case: a laptop shows the race, phones are private question screens.
   Room codes, no QR scanning. `net/discovery.js` already probes for it, so
   the lobby lights up the moment the server exists.
2. **Phone-to-phone** (`p2p.js`). The offline, no-laptop fallback, using the
   QR handshake the vendor libraries are already shipped for.

## 2. The mission has no screen

`mission/model.js` is complete and tested: expedition pacing, claimed
landmarks, shimmering reviews, the weekly tide, goal-mission readiness,
horizon-aware scheduling. **None of it is reachable in the app.**

This is the single biggest gap for *retention*, and retention is not a business
metric here — boxes 4 to 6 only ever fire on a different day, so a child who
never comes back never gets the durable half of the learning. Needs
`screens/map.js` and `mission/render.js`.

## 3. Solo play is not yet a race

There is a track and a racer, but nothing to race. A lone avatar creeping
rightwards is a progress bar with a rocket on it.

Cheapest honest fix: a **pace-setter ghost** derived from the child's own
previous session, so they race themselves rather than a fabricated rival. It is
truthful, it cannot demoralise (it is set by their own past pace), and it needs
no networking.

## 4. Audio is TTS-only, which breaks the youngest band

Pre-nursery and nursery prompts carry their whole meaning in sound, and speech
synthesis is the least dependable primitive in the browser: voice lists load
asynchronously, iOS needs a gesture, and some devices have no offline voice at
all. So the band that depends on audio most is the one most likely to get none.

**The bundled pre-reader pack needs recorded audio files.** Roughly 60 short
clips for `core.firstwords`, `core.counting` and `core.letters`. Everything
else can keep the TTS fallback.

## 5. Tracing is built but nearly unreachable

`trace-score.js` is tested and works — a scribble fails on precision, a
three-year-old's wobbly A passes at their tolerance and fails at grade 2. But
trace items only appear as the generate step of a letter question, so a child
practising letters may never meet one directly.

Fix: make trace a first-class item in `core.letters` rather than a hidden
variant, and add a shapes module.

## 6. Replication has no transport

`hlc.js`, `event.js`, `fold.js`, `merge.js` and `log.js` are done, and
`npm run synctest` drives four devices with skewed clocks to byte-identical
state in any merge order, repeatably, surviving compaction. So the *model* is
proven.

Missing: `sync/gossip.js`, `sync/pairing.js` and the trust scopes — the parts
that actually move events between two devices. Until those exist, every device
holds its own log and nothing ever converges in practice.

**Build pairing before gossip.** Getting the trust scope wrong leaks a child's
learning history to a visiting friend's phone, and that is the one failure here
with a real-world cost.

## 7. Only six item types

`order`, `match`, `sort`, `cloze`, `numberline`, `odd` and `pattern` are all
specified and none are built. Six types is enough to prove the loop and covers
ages two to eight, but the variety is thin over a long session, and several of
those types are much better generate steps than a reshuffled multiple choice.

## 8. Content gaps

- **Reading passages are not length-checked.** The validator counts prompt
  words against the band ceiling but ignores `passage`, so a kindergarten child
  can be handed a thirty-word story. Either count it or set a separate ceiling.
- **Only 24 picture words.** A pre-reader exhausts `core.firstwords` in two
  sessions.
- **Nothing from the sibling project's other minigames.** Its odd-one-out,
  pattern-memory and word-search banks would port well once those item types
  exist.
- **No module a parent made.** The authoring prompt exists and has never been
  used end to end. Until a homework photo has actually become a playable module
  in under two minutes, the central claim of the project is untested.

## 9. Accessibility is unfinished

Real controls and live regions are in place; these are not:

- no focus trap in the teach card, so a keyboard user can tab out of a modal
- tiles cannot be operated by keyboard in a sensible order
- no visible focus styling on the canvas track
- `prefers-reduced-motion` is honoured in CSS but the setting is per-profile
  and does not read the OS preference as its default

## 10. Nothing sounds like anything

No music, no answer chime, no celebration sound. For a two-year-old, sound
*is* half the feedback. The sibling project's approach — one reused `<audio>`
element, tracks cached on demand rather than precached — ports directly.

---

## What is genuinely finished

Worth stating, so the list above is read in proportion:

- The remediation loop, end to end, verified in a real browser: a wrong answer
  produces feedback naming the error, a teach card entered at a rung chosen by
  the child's ability, a mandatory generate step, a prove-it on a different
  question, and an assisted exit nobody can get stuck in.
- The two-clock scheduler, the ability model with hierarchical priors, the
  picker with its interleave constraint and its guarantee never to starve.
- Event-sourced state that survives a reload by being rebuilt from the log.
- 342 validated items across 9 modules, with teach ladders.
- Boosts, earned by answering rather than by being right, so a struggling
  child earns them faster than one breezing through.
- Pass-and-play in four modes, with teams split by age band, the anti-carry
  cap live, and one racer per team on the track.
- Seven gates that block a bad change: 134 unit tests, a parse and layering
  check, a content validator, a browser smoke test that fails if the teach
  loop does not run, a two-player game test, an offline check, a term-long
  learner simulation, a four-device convergence test, and a live check against
  the deployed site.
