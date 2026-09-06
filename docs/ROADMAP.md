# Roadmap

Each phase is independently shippable. Do not start the next until the current is green.
Reasoning for every item is in [PLAN.md](PLAN.md).

## Phase 1 — Pure core, headless ⟵ current

No UI. `js/sync/{hlc,event,fold,merge}.js`, `js/content/{bands,skills,validate,rng,templates}.js`,
`js/learn/{ability,scheduler,session,remediation}.js`, `js/track/model.js`, `js/mission/model.js`.

**Event sourcing must land here.** It cannot be retrofitted — every piece of state must be
derived from day one or the replication design is dead.

*Done when:* `npm test` and `npm run check` are green; `scripts/simulate.mjs` runs a synthetic
learner through 500 items with sane box distributions and θ curves; `scripts/synctest.mjs`
shows two simulated devices converging.

## Phase 2 — Single player, hot seat, six item types

`index.html`, `main.js`, screens (home / profiles / play / results), `items/*`, `store.js`,
`sync/log.js`, `users.js`, the bundled `core` pack, service worker.

*Done when:* a real child plays a 10-minute session end-to-end on a phone, gets things wrong,
is taught, recovers, and the follow-ups actually come back.

## Phase 3 — The race

`track/render.js` + `themes.js`, `race` theme, checkpoints, celebrations, the end-of-session
"what you learned" card.

*Done when:* single-player racing feels good and the recovery moment lands.

## Phase 4 — Missions: the Expedition

`mission/{model,render,regions}.js`, `screens/map.js`, shimmering landmarks, the weekly tide,
postcards, crew roles. Build the Mission model generically — `kind`, `skills`, `targetTheta`,
`horizon`, `skin` — even though only `story` ships here.

*Done when:* your kids ask to open the app on a day with no homework, and a two-week gap
feels welcoming rather than shaming.

## Phase 5 — Multiplayer + replication

Port `coordinator.js` (extended), `p2p.js`, `lan.js`, `local.js`, `mpscreen.js`,
`lan-server.mjs`. Add `arena.js` big-screen host, `tug` theme, `sync/{gossip,pairing}.js`,
module transfer on join.

*Done when:* `scripts/mptest.mjs` drives two real browsers through a real WebRTC match **and
their logs converge**; a laptop + three phones works on home WiFi.

## Phase 6 — Trace and drawing

`items/trace.js` + `trace-score.js`, band-scaled tolerances, stroke storage, the gallery.

*Done when:* a 3-year-old can trace an A and be told they got it, and a 7-year-old cannot
pass by scribbling.

## Phase 7 — Content pipeline at scale

`scripts/validate-modules.mjs`, CI workflow, parent-preview, the "this question is broken"
flag, the parent report screen.

*Done when:* photo of homework → deployed playable module in under 2 minutes.

## Phase 8 — Meta-game

Album/cards, family board, kid-authored builder, the year-end map poster export.

## Phase 9 — Remote play + the sync mailbox (Cloudflare)

`worker/` — a Durable Object per room, 4-digit codes, WebSocket relay, **and an event mailbox**
so paired devices converge without meeting. Reuses `net/lan.js` unchanged.

## Phase 10 — Multi-team, cross-household crews, goal missions

1. `lanes` renderer — 3+ teams. Renderer only.
2. Cross-household crews through the mailbox. Pairing, guest scopes and the no-chat rule must
   be solid *before* this.
3. Goal missions — `horizon` mode, readiness dashboard, `blueprint` skin, per-mission θ
   visibility, syllabus → modules authoring.

Goal missions are the point at which the app stops being only a kids' app. Treat as a genuine
second product with its own playtesting.

---

## Deferred — not built unless asked

- Peer-graded open-ended drawing ("draw a cat", voted on by other players)
- Paste-JSON module intake in-app
- Load module from URL
- Confidence tap ("sure / not sure")
- Speak-aloud items (Chrome-only; streams audio to Google — recommend never)
