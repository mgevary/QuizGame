# Missions — the durable arc

The race is the **session**. A **Mission** is the **campaign**, and it is the answer to
"why open this again tomorrow?"

This matters more than it sounds. The scheduler puts durable learning in boxes 4–6, whose
intervals are 20 hours, 3 days and 10 days. **Those reviews only happen if you come back on
a different day.** Return is not a business metric here; it is the learning mechanism.

---

## 1. One engine, two kinds of goal

A Mission is a crew, a set of skills, an optional deadline, and a skin.

```js
Mission = {
  id, title,
  kind: 'story' | 'goal',
  crew: ['u_ana', 'u_sam'],                                 // profiles, possibly across devices
  skills: ['lit.phonics.*', 'num.add.*'] | ['aws.saa.*'],   // globs over skill ids
  targetTheta: 6.5,                                         // the ability the mission requires
  horizon: null | '2027-03-03',                             // exam date, or null for open-ended
  skin: 'expedition' | 'ascent' | 'blueprint',
  weeklyTide: true                                          // story missions open new map on a calendar
}
```

| | **Story mission** (kids) | **Goal mission** (teens / adults) |
|---|---|---|
| Objective | *Reach the Sunken City* | *Pass AWS Solutions Architect on 3 March* |
| Skills | whatever modules are installed | the exam blueprint's domains |
| Horizon | none — it unfolds | a real date, which changes the scheduler (§4) |
| Readout | a map with claimed territory | a readiness dashboard: coverage, mastery, days left |
| Skin | `expedition` | `blueprint` (a certification wall) or `ascent` (a climb) |
| Crew | a family | a study group, a couple prepping together, a classroom |
| θ visible? | **no** | **yes** |

**Everything below the skin is identical** — the same fold, the same scheduler, the same
ability model, the same replication, the same team mechanics. A goal mission is a story
mission with a date and a different renderer.

That is the whole reason the generalization is worth making: it roughly doubles the
addressable use of the app for one extra data structure and one scheduler mode.

---

## 2. The Expedition — the default story mission

The family is one crew on a long voyage across a map that reveals itself region by region.

| Unit | Size | Cadence |
|---|---|---|
| **Leg** | one session (10–20 min); race distance converts to map distance | per play |
| **Landmark** | reached every ~1.5 legs. Small celebration + a postcard | 2–3 / week |
| **Region** | ~8 landmarks, a themed area (*Coral Shallows*, *The Ember Waste*) | ~1–2 weeks |
| **The Map** | ~24 regions ≈ a school year. Printable at the end | the artefact |

### Territory equals knowledge

Every landmark is *claimed by a skill cluster the family demonstrated there*, and labelled
that way: **Magic-E Cove**, **Sevens Ridge**, **The Bones of a Plant**.

The map is not a progress bar wearing a costume. It is **a visible, accumulating record of
what your kids actually know**, and that is the most motivating artefact available to this
design.

### Pacing

```js
legDistance      = crewSteps * 0.9        // ~35 items per player per session
landmarkDistance = 45                     // ~1.5 legs for a two-child crew
regionLandmarks  = 8                      // ~12 legs ~ 1.5 weeks at 4 sessions/week
mapRegions       = 24                     // ~ a school year
```

`mission/regions.js` holds the region definitions as a plain data array — name, palette,
landmark count, unlock offset — the way `levels.js` holds Maze's 30-level curve. Adding a
region is one line.

---

## 3. Return hooks — every one of them guilt-free

The obvious way to drive return is a streak. It is also the single most reliable way to
convert play into obligation and trigger the overjustification effect. So every hook here is
built on **anticipation or accumulation, never on loss**.

1. **Nothing ever decays.** A claimed landmark stays claimed forever. No wilting garden, no
   lost streak, no expiring anything. **Nothing is ever taken away.**

2. **Shimmering places = due reviews.** A landmark whose skills have box-4/5 reviews due
   glows gently. Tapping it starts a short **check-up leg** (5–8 items, 3–4 minutes). Passing
   turns the landmark **gold** — permanent, box 6.
   - **Cap the shimmer count at 3.** Anki's motivation-killer is opening the app to
     "247 cards due". Three shimmering places is an invitation; a debt pile is a reason to
     quit. Overflow is simply not displayed and surfaces later.
   - This is spaced repetition rendered as *territory maintenance*, and it is what ties the
     arc directly to the learning model.

3. **The weekly tide — the anti-streak.** A new region opens on a calendar cadence
   (say Monday morning), **whether or not you played**. So **coming back after two weeks away
   is a better experience, not a worse one**: there is more map to see, not a pile of guilt.
   This is the deliberate inversion of the streak and the most important decision in this
   document.

4. **The next landmark is always close.** The map auto-paces so the next landmark is 1–2 legs
   away. Never show a bar that takes a month to fill.

5. **Solo legs count.** A child playing alone advances the *crew's* journey. This removes
   "we need everyone in the room" as a blocker — the biggest practical barrier to any family
   game. Their leg merges the next time devices meet.

6. **"While you were away."** On opening after a gap: postcards from siblings' solo legs, new
   islands that appeared because you added a module, the region the tide opened. Real social
   evidence, not manufactured FOMO.

7. **Crew roles.** Navigator, Engineer, Lookout, Cook — a small cosmetic function, rotating
   each region. An autonomy lever and a relatedness lever for the cost of a picker screen.

8. **The Homework Boss** — a weekly **storm** on the map, assembled locally from *this
   family's* failed-and-recovered items across all children and all modules. Zero authoring,
   perfectly targeted, and literally the spaced-repetition queue wearing a costume.

9. **The year-end poster.** The map exports as a single image: a year of learning, on the
   wall. The thing parents send to grandparents.

---

## 4. Goal missions — real exams and certifications

The identical engine, pointed at something with a date on it: an SAT, a GCSE, an AP paper, a
driving theory test, AWS/Azure certs, a nursing board, a language exam.

### A skill map drawn from the exam blueprint

Every certification publishes a domain breakdown with weights. That maps directly onto the
skill tree as a custom strand:

```jsonc
"mission": {
  "kind": "goal", "title": "AWS Solutions Architect Associate", "horizon": "2027-03-03",
  "domains": [
    { "skill": "aws.saa.secure",    "weight": 0.30, "targetTheta": 7 },
    { "skill": "aws.saa.resilient", "weight": 0.26, "targetTheta": 7 },
    { "skill": "aws.saa.perf",      "weight": 0.24, "targetTheta": 6 },
    { "skill": "aws.saa.cost",      "weight": 0.20, "targetTheta": 6 }
  ]
}
```

The same LLM authoring path that turns a homework photo into a module turns a syllabus into a
set of them — and this is a *better* fit for AI authoring than children's content, because
the source material is public, structured and dense.

### A readiness estimate instead of a map

```js
domainReadiness = 0.5 * coverage      // fraction of domain skills ever met
                + 0.5 * mastery;      // fraction at box >= 4 AND theta >= targetTheta
readiness = sum(weight_d * domainReadiness_d);
```

Displayed as a per-domain bar chart with the weakest domain called out, plus **days remaining**
and **skills not yet touched**.

**Never a predicted score.** We have no calibration data and claiming one would be dishonest.
The label is *"how much of the blueprint you've shown you know"*, not *"you will pass"*.

### Adults may see their own numbers

Children never see θ: it invites gaming and exactly the ability-level self-comparison that
Kluger & DeNisi's feedback work warns against. An adult who has voluntarily chosen a
certification is in a different situation — they need the diagnostic, and hiding it is
patronising.

So θ, box distribution and readiness are **visible on goal missions and hidden on story
missions**. A per-mission flag, not a global setting.

### Study-group crews

Team mechanics transfer unchanged: shared readiness, per-member contribution, the anti-carry
cap (so one strong member doesn't mask a weak one), and the Teach Assist — which for adults is
straightforwardly the protégé effect and the most defensible mechanic in the app.

### What is deliberately *not* different

**The remediation loop.** Adults benefit from being made to re-generate an answer after being
taught at least as much as children do. The "read the explanation, tap OK" pattern that every
professional cert-prep tool ships is exactly the mistake this app exists to avoid.

---

## 5. Horizon-aware scheduling — the one real engine change

An open-ended mission optimises for durable learning with no deadline. A goal mission knows
the retention interval, which is the ideal case for spacing research: Cepeda et al. (2008)
found the optimal gap is roughly **10–20% of the target retention interval**. When the target
is *known*, that stops being a heuristic and becomes a calculation.

`learn/scheduler.js` gains a `horizon` mode with three behaviours.

### 5.1 Interval compression near the date

Cap every cross-session gap so each mission skill gets at least one review before the exam:

```js
var daysLeft  = daysUntil(mission.horizon);
var maxGapDays = Math.max(1, daysLeft * 0.20);
gapDays = Math.min(gapDays, maxGapDays);
```

With 60 days left, box 6's 10-day gap is untouched. With 5 days left it compresses to 1 day,
so nothing goes unreviewed into the exam.

### 5.2 Coverage then mastery

Early in the horizon the picker over-weights *unseen* mission skills — you cannot revise what
you have never met. Past roughly 60% of the horizon it flips to over-weighting *weak* skills.
One blended weight, no mode switch the user can feel:

```js
var t = 1 - daysLeft / horizonDays;          // 0 at the start, 1 at the exam
var freshWeight = 1 - t, reviewWeight = t;
```

### 5.3 Domain weighting

Item selection is biased by blueprint weight, so a 30% domain gets roughly 30% of the
practice. Obvious — and every serious cert-prep tool gets it wrong by drilling whatever has
the most content.

### 5.4 After the horizon

The mission **archives rather than deleting**. Skills stay in the schedule at long intervals,
because "passed the exam" and "still knows it" are different things and only one of them is
worth having.

### 5.5 The honest caveat

With a very short horizon — days — interval compression pushes the schedule toward massed
practice, which the spacing literature says is *worse* for retention. It is still the right
call, because cramming beats not covering the material at all. But the app should say so
plainly rather than pretending a week of compressed review equals two months of spacing.

---

## 6. Composition with the race

**A mission is always co-op, even when the session is versus.** The race decides who won
*today*; the crew's *combined* distance is what moves the ship.

So losing a race still advances the journey, and the crew is permanently on the same side.
This is the reconciliation of the two things usually in tension: kids want to compete,
families want to be on the same team. **Versus at the session scale, co-op at the campaign
scale.**

---

## 7. Multi-team and cross-household crews

v1 supports two teams (the `tug` renderer) or a free-for-all up to five. Once the Worker
exists and devices can converge without meeting:

- **3+ teams in one session.** `TrackModel.teams` is already an arbitrary map, so this is a
  renderer (`lanes`), not a model change.
- **Cross-household crews.** Cousins in two cities on one Mission. This is the case that
  actually needs the relay — both for the match and for the log mailbox.
- **A league.** Several crews on the same Mission, comparing progress.

### The league tension, named rather than papered over

Cross-family leaderboards are ruled out for children on overjustification grounds, and that
rule is correct. So:

- **Children's story missions: no league. Ever.** Comparison stays inside the room they are
  physically in.
- **Crews you deliberately paired with** (cousins, a co-op group) may compare, but the unit
  is **"new things learned this week"**, not points — chosen because it is a metric the
  youngest child can win.
- **Adult goal missions may have a real leaderboard.** An adult who chose a certification has
  already supplied their own extrinsic goal, so the overjustification risk is largely spent.
  Opt-in, among a named group, never global.

**Safeguarding note:** cross-household play is the first feature that puts a child's device in
contact with people outside the house. Pairing, guest scopes and the no-chat rule must all be
solid *before* this ships, not during it.

---

## 8. It is all derived

Mission position, claimed landmarks, shimmer state and readiness are a **pure fold over the
event log** — never stored as authoritative. Consequences that fall out for free:

- Two devices that played apart converge automatically when they meet; there is no merge
  logic for the map.
- Any device can render the mission and host the next leg.
- A corrupted cache is a non-event — recompute.
- **Rebalancing the pacing constants later retroactively re-renders the whole history
  correctly**, because nothing was baked in.
