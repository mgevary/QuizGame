# What is missing

Written after the first playable went live at https://mgevary.github.io/QuizGame/.
Ordered by how much each gap costs against the brief: educational, fun,
visually interactive, with team dynamics.

---

## 1. Multiplayer — built, on WiFi, with no server on the internet

Three ways to play across devices, all verified end to end:

| Route | Needs | Verified by |
|---|---|---|
| Pass and play | one device | `scripts/teamtest.mjs` |
| Room server on the WiFi (`npm run lan`) | a laptop on the network | `scripts/mptest.mjs` — two real browsers, one real server |
| Phone to phone by QR (`net/p2p.js`) | nothing at all; works with the internet off | manual — WebRTC needs two real devices |

With the room server up, the lobby hosts a room by itself the moment it
opens, lists everyone else's, joins with one tap, and announces arrivals with
a toast, a chime, a buzz and (opt-in) a system notification.

The room server and the browser import the **same** `js/net/coordinator.js`,
so the rules cannot drift. The Cloudflare relay in `worker/` speaks the same
protocol and is written but **not deployed**; when it is, `net/lan.js` needs
only a different URL and the lobby lights up across the internet.

**Honest caveats.** Some routers isolate WiFi clients from each other (guest
networks especially), and then neither phone-to-phone nor the room server can
connect — that is the router, not the app, and the relay is the fix. The QR
handshake is two-way and genuinely fiddly for more than two phones; the room
server is the better family setup whenever a laptop is on.

## 2. The mission has a screen now

`screens/map.js` renders the Expedition: claimed landmarks named for the
skill earned there, gold when mastered, shimmering when a review is due, the
weekly tide opening regions on the calendar. The lobby carries the path and
the week dots. What is still missing: tapping a shimmering place should start
a check-up leg on *that* skill rather than a general session, and there is no
region-arrival moment yet.

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

## 6. Replication is wired

`sync/gossip.js` runs on every connection — room or phone-to-phone — and
`sync/pairing.js` gives a family a code to share. Devices with the same code
swap logs whenever they meet in a game; a guest's device receives nothing
durable, asserted by test. What is missing is the *mailbox* path: two family
devices that never meet still never converge until `worker/` is deployed.

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

## 10. Sound — built

Eight synthesised sounds with no buzzer, eight instrumental tracks at a
six-percent default, and a volume control reachable mid-game.

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
