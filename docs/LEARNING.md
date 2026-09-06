# The learning science behind Quiz Quest

For each finding: what it says, how good the evidence actually is, and the concrete mechanic
it buys us. Contested findings are flagged. A design built on folklore fails quietly, so this
document is deliberately blunt about evidence quality.

**The one-paragraph thesis.** Everything in this app is one loop: **ask → judge →
(on failure) teach → make them re-generate → prove it → schedule it to come back**. The two
mechanics with the strongest evidence base in all of learning science — retrieval practice
and distributed practice (Dunlosky et al., 2013, ranked exactly those two as the only
"high utility" techniques out of ten) — are not features here; they are the architecture.
The race is a wrapper that makes a child voluntarily do 40 retrieval attempts in 15 minutes.

---

## 1. Retrieval practice / the testing effect — STRONG. Core mechanic.

**Finding.** Being tested on material produces more durable learning than restudying it for
the same time (Roediger & Karpicke, 2006). Karpicke & Blunt (2011, *Science*) showed
retrieval practice beat concept mapping even when students predicted the opposite.

**Evidence.** Excellent. Rowland (2014) meta-analysis g ≈ 0.50; Adesope, Trevisan &
Sundararajan (2017) g ≈ 0.61 across 272 comparisons. Replicates across ages, materials and
delays. Caveats: the effect is larger with feedback and delayed final tests; Van Gog &
Sweller (2015) argued it shrinks for high-complexity material — contested.

**Mechanic.** The whole game is retrieval. Never present content passively before testing
on it. Even the teach card ends in a retrieval attempt, never a "Got it" button.

## 2. Spacing / distributed practice — STRONG. Core mechanic.

**Finding.** Cepeda, Pashler, Vul, Wixted & Rohrer (2006) meta-analysed 317 experiments:
spaced beats massed, d ≈ 0.4, and the advantage grows with retention interval. Cepeda et al.
(2008): the optimal gap is roughly 10–20% of the target retention interval.

**Evidence.** Excellent — among the most replicated findings in psychology.

**Caveat.** *Expanding* intervals (Landauer & Bjork, 1978) are the popular version, but
Karpicke & Roediger (2007) found equal spacing as good or better. We use expanding intervals
as a reasonable default but do not treat expansion as load-bearing.

**Mechanic.** The two-clock Leitner scheduler. Within-session lag gives the short intervals;
cross-session gives the real durability. **The learning happens between sessions**, which is
why the Mission exists — "come back tomorrow" is a learning requirement, not a business metric.

## 3. Interleaving — MODERATE, domain-dependent.

**Finding.** Mixing problem types beats blocking (Rohrer & Taylor, 2007). Rohrer, Dedrick &
Stershic (2015) found interleaved maths practice roughly doubled delayed-test performance.

**Evidence.** Brunmair & Richter (2019) meta g ≈ 0.42 overall, but **large for inductive
category learning and discrimination, near zero for some domains** (e.g. rote vocabulary).
It works when the hard part is knowing *which* rule applies.

**Mechanic.** The picker never serves two items sharing a skill parent back-to-back unless
one is a box-0 immediate review. But we do *not* interleave a child's very first encounter
with a skill — blocked first exposure, then interleave.

## 4. Desirable difficulties — A FRAMEWORK, not a finding.

Bjork (1994) is an umbrella for spacing, testing, interleaving, generation and varied
practice. The members carry the evidence; the umbrella is a theoretical claim. **Critical
caveat:** difficulties are desirable only when the learner can still succeed. **Mechanic:**
the ~85% success targeting is the guardrail that keeps difficulty desirable.

## 5. Generation effect — GOOD. Core remediation mechanic.

**Finding.** Slamecka & Graf (1978): information you produce yourself is remembered better
than information you read.

**Evidence.** Bertsch, Pesta, Wiscott & McDaniel (2007) meta d ≈ 0.40. Robust for simple
materials; smaller for complex ones.

**Mechanic.** The single most important rule in the remediation loop: **after a teach card,
the child must produce the answer, not acknowledge it.** No "OK" button anywhere in
remediation. A failed MCQ returns as a tile-assembly or cloze so recognition cannot
substitute for recall.

## 6. Elaborative interrogation & self-explanation — MODERATE. Scaffold heavily for kids.

**Finding.** Chi et al. (1989, 1994): learners who explain *why* to themselves learn more.

**Evidence.** Bisra et al. (2018) meta g ≈ 0.55. But free-form self-explanation is out of
reach for under-8s.

**Mechanic.** "Why?" as a **menu, not a text box** — *"Why is it 'cake'? (a) e makes a say
its name (b) c is soft (c) I just knew it."* Roughly 1 in 6 items; more becomes a tax. Also
gives us a misconception signal.

## 7. Worked examples & the expertise reversal effect — STRONG. Drives the hint ladder.

**Finding.** Sweller & Cooper (1985): novices learn more from worked examples than from
solving. Kalyuga et al. (2003): that reverses with expertise — for a competent learner the
worked example is redundant and *harms* performance. Renkl & Atkinson (2003): fade the
example step by step into a problem.

**Evidence.** Strong within cognitive load theory's literature; the interaction replicates well.

**Mechanic.** The **hint ladder is expertise-adaptive**. A child with low θ on the skill
enters at rung 2 (full worked example). A child with high θ who slipped enters at rung 0
(a one-line nudge) and never sees the worked example. Same content, different entry point,
zero extra authoring.

## 8. Cognitive load theory — DESIGN PRINCIPLES GOOD; THEORY CONTESTED.

**Finding.** Working memory is tiny; cut extraneous load ruthlessly. Yields the
split-attention, redundancy and modality effects.

**Evidence.** The applied presentation principles hold up. The three-way load taxonomy is
criticised as unfalsifiable (de Jong, 2010; Kalyuga, 2011). Use the rules; don't cite the
theory as settled.

**Mechanic.** One question per screen. No visible timer during a teach card. No decorative
animation while text is on screen. Audio narration *instead of* on-screen text for the same
content, never both verbatim — this matters enormously for pre-readers. The track dims to a
strip during remediation.

## 9. Mastery learning / Bloom's "2 sigma" — REAL BUT INFLATED.

**Finding.** Bloom (1984) reported one-to-one tutoring plus mastery learning moved students
two standard deviations.

**Evidence.** **2 sigma is folklore.** The original studies were small, short, and used
researcher-built outcome measures. Kulik, Kulik & Bangert-Drowns (1990) meta on mastery
learning d ≈ 0.5. Modern tutoring meta-analyses land nearer 0.3–0.5. Mastery learning works;
it does not work twice as well as everything else.

**Mechanic.** Advance on **mastery, not attempts**: an item is done when it has survived a
spaced review. No over-claiming anywhere in the UI.

## 10. Immediate corrective feedback — STRONG, BUT A THIRD OF FEEDBACK BACKFIRES.

**Finding.** Hattie & Timperley (2007) put feedback among the highest-leverage interventions,
d ≈ 0.7. **But** Kluger & DeNisi (1996) — the most important paper in this document — found
**over a third of feedback interventions reduced performance**: specifically those directed
at the *self* rather than the *task*. Shute (2008) agrees. Pashler et al. (2005): the active
ingredient is *correct-answer* feedback after errors.

**Evidence.** Strong on the mean, huge variance. Hattie's synthesis methodology is itself
criticised (Bergeron & Rivard, 2017); treat 0.7 as directional.

**Mechanic — a hard rule.** Feedback is **immediate, task-level, never person-level**. Never
"You're so smart"; never a red X on the avatar. Copy is about the item: *"'cak' is missing
the magic e."* Correct-answer feedback is mandatory before re-attempt. **No relative feedback
to under-8s** — no "you're in last place".

## 11. Errorful learning & the hypercorrection effect — GOOD. The philosophical core.

**Finding.** Kornell, Hays & Bjork (2009): *failing* to retrieve, then being told the answer,
beats simply studying the answer. Butterfield & Metcalfe (2001): errors made with **high
confidence** are the ones most likely to be corrected and retained. Metcalfe (2017, *Annual
Review of Psychology*) is the synthesis.

**Evidence.** Good, replicated, including in children.

**Mechanic.** **Reframe the wrong answer as the most valuable event in the game.** The
economy pays *more* for recovered items (1.2 steps) than first-try correct ones (1.0). This is
not a lie told to children — it is the actual finding. A "skip" exists but is discouraged,
because an attempted-and-failed retrieval is worth more than an avoided one.

## 12. Dual coding & the multimedia principles — GOOD PRINCIPLES, MOSTLY ADULT LAB DATA.

**Finding.** Paivio: verbal and imaginal codes are separate and additive. Mayer's principles:
modality (narration + picture beats text + picture), coherence, signalling, segmenting.

**Evidence.** Individual principles show d ≈ 0.5–1.0 in lab studies — overwhelmingly with
university students on short retention intervals. Directionally sound; don't quote the effect
sizes at parents.

**Mechanic.** Every item may carry `{text, audio, image}`. For bands PN–R, **audio + image is
required and text is suppressed**. The modality principle coincides exactly with the
accessibility requirement that pre-readers can't read. That coincidence is why this app can
go down to age 2.

## 13. Concreteness fading — MODERATE, mostly early maths.

**Finding.** Goldstone & Son (2005); Fyfe et al. (2014): concrete → semi-concrete → abstract
beats either alone for transfer.

**Evidence.** Best supported in early numeracy. Not a universal law.

**Mechanic.** Numeracy items carry a `rep` field (`concrete` / `iconic` / `abstract`) and the
scheduler fades through them on successive reviews. Shipped only in the bundled core pack
where we control authoring, because it triples authoring cost.

## 14. Zone of proximal development — A FRAMEWORK, operationalised numerically.

Vygotsky (1978) is a frame, not an effect size. What *is* quantitative: Wilson, Shenhav,
Straccia & Cohen (2019, *Nature Communications*), "The Eighty Five Percent Rule for optimal
learning" — for a broad class of learners, learning rate is maximised at ~85% accuracy.

**Mechanic.** The item picker targets expected success of **0.80–0.85** against the player's
current θ. That single number is the operational definition of ZPD in this app, and it is
what makes mixed-age play fair.

## 15. Self-determination theory — GOOD. Shapes the whole reward system.

**Finding.** Deci & Ryan: autonomy, competence and relatedness drive intrinsic motivation.

**Evidence.** Large, generally supportive literature.

**Mechanic.** One lever per need. **Autonomy** — the child picks avatar, track theme, crew
role, and one of three offered topics each round (Patall, Cooper & Robinson 2008 meta on
choice: d ≈ 0.30). **Competence** — the 85% targeting plus per-skill mastery meters.
**Relatedness** — co-op modes, the Teach Assist, cheer taps, the shared map.

## 16. Overjustification — REAL. The trap most edu-games fall into.

**Finding.** Deci, Koestner & Ryan (1999) meta: **expected, tangible, performance-contingent
rewards undermine intrinsic motivation**, d ≈ −0.34 on free-choice persistence. Verbal praise
and *unexpected* rewards do not undermine.

**Evidence.** Contested in magnitude (Cameron & Pierce argued the effect is narrow), but the
specific pattern — expected + tangible + contingent = bad — has held up well enough to design
against.

**Mechanic — hard rules.**
- **Never announce an exchange rate.** No "10 coins per correct answer" — that is precisely
  the poisoned form.
- Rewards are **informational** ("you turned 4 mistakes into knows today"), **unexpected**
  (a surprise cosmetic at an unannounced moment), or **completion-contingent** (the
  end-of-session card is for playing, not winning).
- **No punishing daily streak.** The weekly tide inverts it: coming back after a gap is
  *better*, not worse.
- **No cross-family leaderboards for children. Ever.**

## 17. Growth mindset — SMALL. Free to implement, do not build on it.

**Finding.** Dweck: praising effort/strategy over ability improves persistence.

**Evidence.** **The effects are small.** Sisk et al. (2018) meta d ≈ 0.08 overall, near zero
for most students. Yeager et al. (2019, *Nature*), a well-powered national study, found
~0.1 GPA points, confined to lower-achieving students. The original large claims did not
replicate.

**Mechanic.** It costs nothing to write copy in process terms ("that took three tries and you
got it") rather than ability terms ("you're a maths whiz") — and the same copy is *required*
by the Kluger & DeNisi task-vs-self finding, which has much better evidence. We adopt the
language for the feedback reason and treat any mindset benefit as a bonus we don't count on.

## 18. Flow and dynamic difficulty — DESCRIPTIVE.

Csikszentmihalyi's flow is phenomenology, not a causal learning claim. **Mechanic:** the 85%
rule already does the work. Dynamic difficulty here means the ability estimate, not a hidden
fudge factor on the race.

## 19. Learning styles — A MYTH. Explicitly designed against.

Pashler, McDaniel, Rohrer & Bjork (2008, *Psychological Science in the Public Interest*) and
Willingham, Hughes & Dobolyi (2015): there is essentially no evidence for the meshing
hypothesis — that matching instruction to a learner's preferred modality improves outcomes.

**Mechanic.** **There is no VARK selector in this app and there never will be.** We offer
multiple modalities for *access* (a 3-year-old cannot read) and for *dual-coding* (both
channels help everyone) — not because some children are "auditory learners". If a parent asks
for a "visual learner mode", the answer is no, with a link to Pashler et al.

## 20. The honest ceiling — what educational games actually deliver.

Wouters, van Nimwegen, van Oostendorp & van der Spek (2013, *JEP*) meta-analysed serious
games: d ≈ 0.29 for learning, 0.26 for retention — and, notably, **games were not more
motivating than conventional instruction** in their sample. Clark, Tanner-Smith &
Killingsworth (2016): g ≈ 0.33. Sailer & Homner (2020) on gamification: g ≈ 0.49 cognitive,
0.36 motivational, heterogeneous, mostly short-term, with a real novelty confound.

**Implication.** A well-built version of this app is a ~0.3 SD intervention, not a 2 SD one,
and part of the early effect will be novelty. The Mission is specifically an attempt to
outlast the novelty. Never claim more than this in the README or to a parent.

---

## The mechanics, as a table

| Mechanic | Source | Grade |
|---|---|---|
| Everything is retrieval | Roediger & Karpicke 2006; Adesope 2017 | **Strong** |
| Two-clock spaced repetition | Cepeda 2006 | **Strong** |
| Interleave by skill parent | Rohrer & Taylor 2007; Brunmair & Richter 2019 | Moderate |
| Mandatory generation after teaching | Bertsch 2007 | Good |
| Hint-ladder entry rung by θ | Sweller & Cooper 1985; Kalyuga 2003 | **Strong** |
| Task-level, never person-level feedback | Kluger & DeNisi 1996 | **Strong** |
| Recovery pays more than first-try | Kornell/Hays/Bjork 2009; Metcalfe 2017 | Good |
| Audio + image, no text, for pre-readers | Mayer modality principle | Good (adult data) |
| ~85% success targeting | Wilson et al. 2019 | Good |
| No exchange rate; no streaks; no leaderboards | Deci/Koestner/Ryan 1999 | Good |
| Process-worded praise | required by feedback lit; mindset d≈0.08 | Weak — don't build on it |
| No learning-styles selector | Pashler 2008 | Settled |
| Horizon-aware gaps for goal missions | Cepeda 2008 (10–20% of retention interval) | Good |
