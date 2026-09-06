# What is missing

Written after the first playable went live at https://mgevary.github.io/QuizGame/.
Ordered by how much each gap costs against the brief: educational, fun,
visually interactive, with team dynamics.

---

## 1. There is no multiplayer at all — the biggest gap

The brief is a **multiplayer** game with versus and team modes. What is live is
single-player. Everything underneath is ready for it and none of it is wired:

| Exists | Missing |
|---|---|
| `net/coordinator.js` designed, `track/model.js` has teams, anti-carry cap, checkpoints, tug maths, all unit-tested | `net/coordinator.js` itself, `p2p.js`, `lan.js`, `local.js`, `mpscreen.js`, `arena.js` |
| QR/deflate vendor libraries are already in `js/vendor/` | the QR handshake screen |
| The wire protocol is specified in ARCHITECTURE.md | any transport |

**Order to build it, cheapest first:**

1. **Hot seat** (`net/local.js` + `screens/hotseat.js`). One device, pass it
   round. No networking at all, and it is the only mode that works for a
   toddler with no device of their own. It also exercises the coordinator from
   the simplest possible direction.
2. **Big-screen host** (`screens/arena.js` + `scripts/lan-server.mjs`). The
   family case: a laptop shows the race, phones are private question screens.
   Room codes, no QR scanning.
3. **Phone-to-phone** (`p2p.js`). The offline, no-laptop fallback.

Until at least hot seat exists, the team mechanics that are already written and
tested — shared distance, the anti-carry cap, the Teach Assist — are dead code.

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

## 6. Replication is half-built

`fold.js` and `merge.js` are done and the convergence test passes. Missing:
`sync/gossip.js`, `sync/pairing.js`, and the trust scopes. Until those exist,
the claim in the README that any device can resume is true only in principle.

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
- Three gates that actually block a bad change: 98 unit tests, a parse and
  layering check, a content validator, plus a browser smoke test that fails if
  the teach loop does not run and a live check against the deployed site.
