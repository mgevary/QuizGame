# The whole experience, judged against the apps that do this best

What Duolingo, Peloton, HQ Trivia, Kahoot and Jackbox actually get right, what
they get wrong, and what Quiz Quest should take from each — walked through the
full journey from first open to the next morning.

One frame before the list. Those apps optimise for **engagement**. This one
has a stricter brief: the learning research it is built on says several of the
most effective engagement mechanics actively damage the wish to learn
([LEARNING.md §16](LEARNING.md)). So every borrowed idea below is marked
**adopt**, **adapt** or **reject**, and the reason is always the same
question: *does this make a child want to come back, or make them afraid to
stop?*

---

## What each reference app actually teaches

**Duolingo.** The best-instrumented learning product in the world, and the
most honest case study in gamification's limits. What works: a *path* you can
see yourself on; sessions that are short, bounded and always end on a win; a
mascot with feelings; celebration that is fast and specific; XP as an
informational count rather than a currency; and a rhythm of return built on
the streak. What its own data shows going wrong: [streak-maintenance at the
cost of careful engagement](https://dev.to/pocket_linguist/why-duolingos-gamification-works-and-when-it-doesnt-1d4),
higher abandonment among learners who were only there for the game, and a
[165-day streak lost to a time zone](https://medium.com/@bobbywops/is-duolingo-the-easy-way-to-learn-langu-b58885cddd0d)
becoming the moment someone quits. Duolingo itself now sells streak freezes —
a fix for a wound the mechanic causes.

**Peloton.** The best *shared-effort* design anywhere. What works: a live
leaderboard filtered to *here now*, so you compete with people in the room,
not the world; **personal records** as the headline metric — you against your
own past, never against someone fitter; milestone rides (the 100th, the 500th)
celebrated by name; high-fives that cost one tap and land as a tiny animation;
an instructor who calls you out by name at the moment you need it; and a class
that ends with your **output curve** — a picture of what you just did, not a
score. What to leave: the all-time global leaderboard, and the instructor's
energy scaled to adults who chose to be there.

**HQ Trivia.** The clearest demonstration that *a shared moment* is the
product. What worked: a scheduled show so everyone was there at once; a
[countdown that was itself content](https://blog.producthunt.com/the-magic-of-hq-trivia-504403200688),
with haptics ticking each second; the *reveal* as a beat with its own
animation; a live host with a personality; and a visible count of who is
still in. What to leave entirely: elimination on one wrong answer — the exact
opposite of a game whose thesis is that the wrong answer is the valuable
moment — and cash.

**Kahoot.** The big-screen-plus-phones layout, the podium, the answer-colour
shapes so you can answer from across a room, and music that rises as the
timer runs out. What to leave: speed-weighted scoring, which rewards reading
fluency over knowing.

**Jackbox.** The proof that pass-and-play and phones-as-controllers are one
design, not two. Everyone looks at one screen; private input happens on a
phone; the room laughs together. Also the best onboarding in games: a room
code, a name, and you are in, in under fifteen seconds.

---

## The journey, stage by stage

### 1. First open

**Now.** A form: name, age, pick a racer, Start playing. Functional, and
already better than most, but it is a form.

**Better.** Jackbox's bar: fifteen seconds to playing. The racer *is* the
onboarding — make the first screen the eight racers at full size, tap one,
then "What's your name?" as a single field with the racer reacting to typing,
then age as a row of big numbers rather than a number input. Three taps, no
labels. Age chooses the band silently; the band decides whether the app reads
aloud, and the racer should say so: *"I'll read everything to you."*

- **Adopt** (Duolingo): the first session is *tiny* — eight questions, ends
  on a certain win, shows the end card. Nobody's first experience should be a
  thirty-question session.
- **Adopt** (Jackbox): no account, no email, no PIN by default. A PIN is an
  opt-in a parent adds later.

### 2. Identity

**Now.** Eight SVG racers, a name, a band label. The racers are good.

**Better.** A racer needs to be *yours*. Two cheap moves with outsized effect:
a colour choice (five tints per racer = forty combinations, still one SVG), and
a racer that *reacts* — leans forward on a streak, looks at the answer you
chose, does a small loop on a recovery. Duolingo's owl works because it has
opinions. The racer should have three states drawn in code — idle, thinking,
delighted — and the play screen should use them.

- **Reject** (Duolingo): the mascot guilt-tripping. No sad racer on the home
  screen because you didn't play yesterday. Ever.

### 3. The lobby

**Now — built.** Opening the app *is* opening a game. The first thing on the
screen is a live panel, and it is in one of three states:

- **Your game is open.** When a room server is on the WiFi, the lobby opens a
  room in your name the moment you arrive — no tap — and shows its four-digit
  code big enough to read across the kitchen. Your racer sits in the roster
  next to a dashed "waiting for a friend…" slot. Mode chips underneath, with
  the last mode you played preselected, so the only decision left is *Start*.
- **Ana's game is open.** If someone in the house already has a game open,
  you are shown that instead, with everyone in it and one big *Join Ana's
  game*. Nobody types a code. "Start my own game instead" is a small link.
- **Play together.** With no room server about, the same panel is the
  honest pass-the-device one: your racer, the other profiles on the device as
  ghosts, mode chips, *Pass this device around*, and the QR and code routes
  beside it. A one-line note says how games find each other, with a *How?*
  that explains `npm run lan` and the Settings field for a relay.

The first device to open the app hosts; everyone after sees it and joins. If
the host's game vanishes, the next lobby to notice quietly opens its own.

**When someone joins, it is unmissable.** Their racer pops into the roster
with a green ring, the panel flashes, confetti bursts over it, a chime plays,
the phone buzzes, a green toast slides across the top — *"Sam joined your
game!"* with their racer on it — the tab title changes, and if the tab is in
the background and the person has said yes, a system notification fires. The
*Waiting for players…* button turns into *Start with 2 players*. The joiner's
own screen shows the roster live, announces later arrivals the same way, and
says *"Ana started the game!"* the moment she does.

The week strip and the Expedition path sit under the panel; the four mode
cards remain below as the pass-and-play entry; solo, modules and settings are
last. Settings gained a *Room server* field so a deployed relay makes the
same lobby light up across the internet with no code change.

### 4. Setting up a game

**Now.** Pick players, Start. Fine.

**Better.** Team modes should *show the teams* before you start, with a
one-tap swap so siblings who insist on being together can be. Show each
player's band as a coloured pip and say why the split is the way it is:
*"Balanced by age."* Then a **single shared countdown** — see next.

### 5. The start moment

**Now.** Nothing. The first handover card appears.

**Better.** This is HQ's whole lesson. Three seconds, full screen: the track,
every racer at the line, a **3–2–1** that ticks with a haptic pulse and a
rising tone, the finish flag waving. The countdown is the moment everyone
stops talking and looks at the screen. It costs a few hundred lines and it is
the single largest "this is a game" upgrade available.

- **Adopt** (HQ): the countdown, the haptics, the audible tick.
- **Adopt** (Kahoot): music enters on "go".

### 6. The question

**Now.** A card: prompt, options, a speaker, a flag link. Clean.

**Better.**

- **Reveal, don't just mark.** HQ made the reveal a beat: options lock, half a
  second of held breath, then the right one lights and the bar fills. Right
  now a tap flips instantly. A 400ms lock-then-reveal makes every answer feel
  like a moment rather than a click. Do it for correct answers too.
- **Answer shapes** (Kahoot): each option gets a shape as well as a position
  — square, circle, triangle, diamond — drawn as a small mark on the left. On
  a big screen a child on the sofa can say "the triangle one".
- **A soft progress pulse, not a timer.** No countdown on the question for
  bands below G3; a gentle ring that fills over twenty seconds for older
  bands, purely as pacing. Kahoot's rising music is right for a party and
  wrong for a five-year-old.
- **Streak indicator on the card**: a small row of dots for the last five
  answers, filled green for right, amber for "turned around". Informational,
  not a score. Peloton shows your last few outputs the same way.

### 7. The wrong answer

**Now.** This is the app's best part and it is already unusual: named error,
teach card at an ability-chosen rung, mandatory generate step, prove-it,
assisted exit. Keep all of it.

**Better — the framing, not the mechanic.**

- **The racer goes to the pit, visibly, with a small animation** — it pulls
  in, a spanner badge appears, the track dims. Right now the pit is a badge
  on the canvas. Make it a *scene*: 600ms, camera nudges to the racer, then
  the teach card slides up from it. The child should understand *where they
  are* without reading anything.
- **The teach card needs a voice.** Peloton's instructor calls you by name at
  the hard part. The card should open with the racer, looking at the child,
  and the first line should be spoken in a consistent, warm register for every
  band: *"Not that one. Here's the trick."* Copy for every rung kind should be
  written once, by hand, in one voice — currently it varies by module.
- **Show the pit-stop as a value, on screen**: *"Pit stops today: 3 · turned
  around: 2."* The child should be able to see that the pit is where the
  points come from.
- **Reject** (Duolingo): hearts. Losing a life for a wrong answer is the
  precise opposite of this app's thesis.
- **Reject** (HQ): elimination. Obviously.

### 8. Getting it right

**Now.** A badge burst, the racer eases forward.

**Better.** Peloton's rule: celebrate *specifically*. Not "correct" but *what*
was correct:

- First-try: a short chime, the racer leans forward, +1 drifts up from the
  racer on the track.
- **Recovery** — the single most important moment in the game — gets the
  biggest celebration and it should be *legible*: the racer loops, the track
  flashes, and the card says the thing by name: *"You got 7×8 wrong on
  Tuesday. You just nailed it."* Duolingo's "you're on fire" is generic;
  this can be true.
- **Personal records** (Peloton): *"That's your best run of right answers."*
  *"Most turned-around in one game."* Against yourself only.
- Haptics on every correct answer (short), heavier on recovery.

### 9. The checkpoint

**Now.** A card: "Checkpoint 2", counts, avatars, Keep going.

**Better.** This is the Peloton milestone moment and the HQ "who's still in"
moment combined. Two seconds of *scene*: the camera sweeps the track, every
racer crosses the dashed line, a chime, then the card. On the card:

- **The rope or the bar, big**, with the delta since the last checkpoint.
- A **"turned around" ticker** for the group.
- Cheer buttons here, not on the handover — this is when everyone is looking.
- **Adopt** (Peloton): a shout-out by name. *"Ana pulled the rope 3 times this
  leg."* Pick one thing per checkpoint, rotate through players.

### 10. The finish

**Now.** A results card: turned-around list, team bar or race podium, Play
again.

**Better.** Peloton ends every class with your output curve. This should end
with **the run** — a replay of the track in five seconds, racers moving from
start to finish along their real paths, pit stops flashing amber, recoveries
flashing green. Then the card. A child will watch that replay every time, and
it tells the true story of the game without a single number.

- The **headline stays "things turned around"**, never the winner. Right.
- **Adopt** (Peloton): personal records section, per player.
- **Adopt** (Peloton): a shareable image — the replay's final frame with
  names and "3 turned around" — for the family group chat. This is the only
  viral loop the app needs and it is one canvas `toDataURL`.
- **Adapt** (Kahoot podium): in race mode show the podium; in team modes show
  the two teams side by side with their bars, never a per-child rank.

### 11. Coming back tomorrow

**Now.** Nothing pulls anyone back. The Expedition — the mechanic designed for
exactly this — has no screen. This is the biggest gap in the product.

**The streak question, settled.** Duolingo's streak roughly doubles daily
retention and its own users describe losing one as the reason they quit. The
research is unambiguous that a *loss-framed* commitment device converts play
into obligation. So: **adapt, never adopt.**

- **Accumulate, never expire.** Peloton counts *weeks* with activity and never
  takes one away. Show "this week" as seven dots and "best week: 5 days". A
  missed day leaves a gap; it removes nothing.
- **The weekly tide** ([MISSIONS.md §3](MISSIONS.md)): new territory opens on
  a calendar, played or not. Coming back after a fortnight away is *better* —
  more map — not worse. This is the deliberate inversion of the streak and it
  should be built before anything else in this document.
- **Shimmering places**: the three landmarks with reviews due, glowing on the
  map. A pull that is an invitation. Cap at three so it never reads as a debt.
- **Adopt** (Duolingo): the *path*. Even before the full Expedition, a single
  horizontal path on the lobby with the last five sessions as nodes and the
  next one lit is enough to say "you are somewhere."
- **Reject**: notifications that guilt. The only notification worth sending
  is *"a new island appeared"* — the tide — and it should be off by default.

### 12. The parent's view

**Now.** A report table behind Settings.

**Better.** Peloton's class summary, for a parent: *what did my child work on
tonight, what did they turn around, what is coming back tomorrow.* One screen,
three lines per child, and a **"play it yourself"** button on any module they
have not verified. The parent is the second player at every screen; this is
the one screen that is theirs.

### 13. Sound

**Now.** Silence, apart from read-aloud. For a two-year-old sound is half of
feedback; for everyone it is most of what makes a game feel *produced*.

**Build a small sound set, in code**, with the Web Audio API — no files:

| Moment | Sound |
|---|---|
| Countdown tick | short click, pitch rising per second |
| Go | a two-note rise |
| Correct | a soft chime, one note |
| Recovery | a three-note rise |
| Pit stop | a low, warm tone — not a buzzer |
| Checkpoint | a short fanfare |
| Finish | a longer one |
| Cheer | a pop |

Plus a music bed that is *optional and off by default*, generated
procedurally so it never repeats and costs nothing to ship. Never a wrong
buzzer. Never a sad sound.

### 14. Haptics

Free on every phone via `navigator.vibrate` (not iOS Safari — accept it).
Countdown ticks, correct answer (10ms), recovery (10-30-10), checkpoint
(30-30). HQ made the countdown physical; that is the whole trick.

### 15. Motion and the visual system

The recent pass — one palette, drawn illustrations, single-weight icons,
restrained indigo — is the right direction. What it still lacks is
**hierarchy of motion**. Three tiers, and nothing else moves:

1. **Ambient**: scenery parallax at 5%, racer idle bob. Always on, subtle.
2. **Response**: option lock, reveal, +1 drift, rope pull. 200–400ms, eased.
3. **Moment**: countdown, pit-stop scene, recovery loop, checkpoint sweep,
   finish replay. 1–3s, the only time the whole screen moves.

`prefers-reduced-motion` collapses tiers 1 and 3 and keeps tier 2 at 100ms.

Type: one display size for the question, one for headings, one body. The
question is the biggest text on any screen. Right now the handover name is
larger than the question; it should not be.

---

## Gamification, one table

| Mechanic | Source | Verdict | Why |
|---|---|---|---|
| Daily streak with loss | Duolingo | **Reject** | Loss framing converts play to obligation; users quit at the break |
| Week-of-activity dots, best week | Peloton | **Adopt** | Accumulation only; nothing is taken away |
| Streak freeze | Duolingo | n/a | A fix for a wound we are not inflicting |
| Hearts / lives | Duolingo | **Reject** | Punishes the wrong answer, which is the valuable event |
| Elimination | HQ | **Reject** | Same |
| XP as an informational count | Duolingo | **Adapt** | "Things you know" and "turned around" are the counts; no exchange rate, no currency |
| Boosts / power-ups | Duolingo | **Adopt — built** | See below: earned by ANSWERING, not by being right |
| Coins as a spendable currency | Duolingo | **Reject** | A currency invites an exchange rate, and an exchange rate is the poisoned form |
| Leagues / global leaderboard | Duolingo, Peloton | **Reject** for children | Cross-family comparison; overjustification |
| Here-now leaderboard | Peloton | **Adopt** | The room you are in, this game only |
| Personal records | Peloton | **Adopt** | You versus your own past — the comparison you can always win |
| Milestone celebrations by name | Peloton | **Adopt** | 100th question, 10th turned-around, first recovery |
| High-fives | Peloton | **Adopt** | Already built as reactions; move them to the checkpoint |
| Instructor shout-out | Peloton | **Adapt** | The racer speaks; the checkpoint names one player |
| Live scheduled show | HQ | **Adapt** | "Tonight's game" card; the countdown as an event |
| Countdown with haptics | HQ | **Adopt** | The single biggest "this is a game" upgrade |
| Reveal beat | HQ | **Adopt** | Lock, breathe, reveal |
| Cash prizes | HQ | **Reject** | Obviously |
| Speed scoring | Kahoot | **Reject** | Rewards reading fluency over knowing; penalises the youngest |
| Answer shapes | Kahoot | **Adopt** | Say "the triangle" from the sofa |
| Podium | Kahoot | **Adapt** | Race mode only; teams show bars, never per-child rank |
| Big screen + phones | Kahoot, Jackbox | **Adopt** | Already the Phase 5 arena design |
| Room code onboarding | Jackbox | **Adopt** | Name, racer, in — under fifteen seconds |
| Cosmetic unlocks at surprise milestones | many | **Adopt** | Unexpected rewards do not undermine; a fifth racer colour at the 50th recovery |
| Loot boxes, energy, purchases | many | **Reject** | Every one is the overjustification effect in a costume |

---

## Boosts — built, and why they are shaped this way

Twenty-five questions in a row is boring however good the questions are, and a
bored child stops. Boosts break a session into stretches of about five, each
ending in something happening. That is a **pacing** fix first and a reward second.

The shape that makes them defensible:

- **The meter fills from ANSWERING, not from being right.** A wrong answer
  moves it exactly as far as a right one.
- **Turning a mistake around fills it faster** — two, against one. So the
  child having a hard night earns boosts *sooner* than the one breezing
  through. That is the right way round pedagogically and, as it happens, the
  more fun way round.
- **Boosts only ever touch the race.** None change what a question is judged
  against, none touch the ability estimate, none change what comes back
  tomorrow. There is a test asserting no boost carries a difficulty, box or
  theta field.
- **The game picks. No menu, nothing to hold.** The first version offered a
  choice of three and a tray to spend them from later. In play, a six-year-old
  could not choose and a ten-year-old agonised, and held boosts mostly went
  unspent. Now the meter fills, one boost arrives, it takes effect at once,
  and the card says in one big highlighted sentence exactly what happened
  ("Your next 3 answers count double.") with a plain-words line under it.
  At pre-reading bands that line is spoken. A surprise is more fun than a
  decision, and it is one less thing between the child and the next question.
- **A running boost is not dealt again.** While a Surge is live the pick
  skips Turbo and Surge, so doubles cannot quietly stack.
- **Narrow-it waits for a question that can take it.** It is armed until a
  question with three or more options comes up, and that question carries a
  tag saying "One wrong answer gone" — never wasted on a tracing question.
- **No currency.** Coins invite an exchange rate ("10 coins per correct
  answer"), and an announced exchange rate is precisely the form the
  motivation research says converts play into work. A boost is a thing that
  happens, not a thing you are paid.

Five exist: **Leap** (jump two now), **Turbo** (next answer doubles),
**Surge** (next three double), **Narrow it** (removes one wrong option from
the next question), and **Team pull** (everyone on your team moves one — only
dealt when there is a team). *Swap* was dropped: a "different question" that
takes effect before you have seen the question is not a boost anyone can
understand, and it brushed against the schedule.

## What to build, in order

Each of these is a day or less and each one is felt by a child immediately.

All ten are built:

0. ~~**Boosts.**~~ Earned by answering, not by being right.
1. ~~**The countdown.**~~ 3–2–1 with a tick, a haptic pulse and a rising tone.
2. ~~**The reveal beat.**~~ Lock, breathe, light the answer.
3. ~~**Sound set in code.**~~ Web Audio, no files, no buzzer; recovery is the brightest.
4. ~~**Pit-stop scene.**~~ The track dims; the teach card arrives from somewhere.
5. ~~**Recovery, named.**~~ "Turned around!" on the moment; named on the end card.
6. ~~**The finish replay.**~~ The real race, run again in five seconds, pit stops and all.
7. ~~**Tonight's game card.**~~ Last mode, last players, one tap.
8. ~~**Week dots and personal records.**~~ Seven dots, best week, records against your own past.
9. ~~**The racer's three faces.**~~ Thinking on the teach card, delighted on a right answer.
10. ~~**The path and the Expedition.**~~ The map, claimed places, the weekly tide, shimmering reviews.

Also from the lists above: answer shapes (Kahoot), a music bed at six percent
with a control reachable mid-game, and reactions moved to the handover.

## The visual pass, and what it was for

Looking at every screen as a four-year-old would showed the honest problem:
the first version was *clean* but *dead*. Navy on navy on navy, a track that
was a static painting, pictures at a fifth of the size of their tiles, a third
of every screen empty, and the continuous reward — the meter — a six-pixel
line. It read as a grown-up's productivity app.

What changed, in order of how much a child notices:

1. **The world is alive.** Stars drift and twinkle, the scenery scrolls on its
   own and faster when the leader moves, racers bob, the rocket's exhaust
   flickers, the flag waves, a `+1` floats up from the racer when distance is
   applied. The countdown is drawn *on* the track with the racers at the line.
2. **The sky takes the colour of the region the family has reached** — so the
   twentieth game does not look like the first, and the Expedition shows up
   inside every session, not only on the map.
3. **A warmer palette.** Deep indigo with a violet glow, not near-black; the
   game's own hues are allowed to be bright against it.
4. **Answer tiles are colour-coded by position** — red, blue, yellow, green —
   with a shape as well, so a child can say "the red one" from the sofa and
   right/wrong is never colour alone. Picture tiles are the picture.
5. **The question card is the hero** and fills the screen; teach cards and
   pickers sit at their own height.
6. **A meter you cannot miss**: fourteen pixels, glowing, with a spark cap that
   pulses when a boost is close. What is armed shows as a labelled pill. Five streak
   dots on every card show the last answers — right, turned around, not yet.
7. **Confetti**, small on a right answer, full on a recovery, a checkpoint, a
   boost and the finish. A celebration that is the same every time is not one.
8. **Pre-readers no longer see "This question looks wrong"** — text they
   cannot read is noise. A parent can flag any item from the report.

### Found by playing it on a phone

Two things no desktop test caught, both reported from a real finger:

- **"The same selection sticks."** On a touch screen a tapped element keeps
  `:hover` until the next tap, and WebKit re-applies it to whatever ends up
  under that point after the DOM changes. The next question arrived at the
  same scroll position, so the option under the finger lit up as if chosen.
  Hover styling is now pointer-only, and every new card resets the scroll.
- **"The new question appears without a screen reset."** It did — the page
  stayed scrolled to wherever the last tap was. Every card now scrolls to the
  top on mount, the answered card slides away before the next one slides in,
  and the sound sheet floats over the game instead of pushing it down.

`scripts/mobiletest.mjs` plays a session on an emulated iPhone with touch
events and fails on a stuck scroll, a hover residue, horizontal overflow, or
a control below the fold.

What remains from this document: the shareable finish image, the checkpoint
shout-out by name, and the parent's summary screen redesign.

Ten items. The first six are the difference between a quiz with a track and a
game a child asks for; the last four are the difference between a game they
play once and one they come back to.
