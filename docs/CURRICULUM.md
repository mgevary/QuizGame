# The module curriculum

What exists, and everything that should. Grade anchors are Common Core
([ELA](https://www.thecorestandards.org/ELA-Literacy/RF/K/),
[Math](https://www.thecorestandards.org/Math/)), with the England National
Curriculum year in brackets where it differs.

**The alignment rule.** A module declares the bands it was *written for*. That
list is what a child gets by default — a module for younger children is never
offered, and a harder one is offered but off. So getting the band right is not
cosmetic: it decides what a child is asked tonight.

The mistake this document exists to prevent: letter–sound correspondence is
**RF.K.3a, a Kindergarten standard**. By Grade 1 the expectation has moved to
digraphs, silent-e and decoding two-syllable words (RF.1.3). Offering letter
sounds as a Grade 1 default is a year behind, and a six-year-old notices.

---

## Where each band stands today

| Band | Age | Default modules | Items | Verdict |
|---|---|---|---|---|
| PN | 2–3 | firstwords, counting | 38 | thin — one sitting |
| N | 3–4 | + letters | 64 | thin |
| R | 4–5 | + math.k | 68 | thin |
| K | 5–6 | letters, math.k, reading.k | 118 | usable |
| G1 | 6–7 | math.g1, reading.g1 | 78 | **no phonics module — the biggest hole** |
| G2 | 7–8 | math.g2, reading.g2 | 65 | usable |
| G3 | 8–9 | math.g3, reading.g3 | 52 | thin |
| G4 | 9–10 | math.g45, reading.g3 | 52 | thin |
| G5 | 10–11 | math.g45 | 4 | **almost nothing** |
| G6 | 11–14 | math.g45 | 4 | **almost nothing** |

Template modules undercount: each `template` item is one generator producing
unlimited questions, so `core.math.g1`'s "6 items" is really six infinite
wells. Enumerated modules (reading, letters) are finite and their counts are real.

---

## Priority order

Judged on how many children it unblocks per hour of authoring.

1. **`core.phonics.g1`** — the only band with a *missing* strand rather than a
   thin one. RF.1.3: digraphs, silent-e, vowel teams.
2. **G5–G6 anything.** Two bands with four generator items between them.
3. **PN/N depth.** A toddler exhausts 38 items in two sittings, and they are
   the band most likely to want the same game again tomorrow.
4. **Spelling by year.** The single highest-value custom use: a photo of a
   spelling list becomes a module in a minute.
5. **Science and world.** No coverage at all yet, and the strands exist.

---

## Literacy — `lit`

### Phonological awareness — `lit.phon` (PN–K)
| Module | Bands | Content | Types |
|---|---|---|---|
| `core.phon.rhyme` | N,R | Which two rhyme? | tap-image, listen |
| `core.phon.syllables` | R,K | Clap the beats in a word | count, listen |
| `core.phon.firstsound` | R,K | What sound does it start with? | listen, mcq |
| `core.phon.blend` | K | /c/-/a/-/t/ → cat | listen, assemble |

### Letters — `lit.alpha` (N–K) — **exists**
`core.letters` covers all 26 sounds plus tracing, each letter its own skill so
b/d and p/q sit on independent review clocks. **Still to add:** lowercase
recognition, upper↔lower matching, alphabetical order.

### Phonics — `lit.phonics` (K–G2) — **the priority gap**
| Module | Bands | CCSS | Content |
|---|---|---|---|
| `core.phonics.cvc` | K | RF.K.3b | cat, pin, hop — short vowels |
| **`core.phonics.g1`** | **G1** | **RF.1.3a–c** | **digraphs (sh, ch, th, wh), silent-e, vowel teams** |
| `core.phonics.blends` | G1 | RF.1.3 | st-, bl-, -nd, -mp |
| `core.phonics.syllables` | G1,G2 | RF.1.3d–e | two-syllable decoding |
| `core.phonics.g2` | G2 | RF.2.3 | prefixes, suffixes, irregular words |

### Sight words — `lit.sight` (K–G2)
`core.sight.k` (the, of, to, you, she, my, is, are, do, does — RF.K.3c),
`core.sight.g1`, `core.sight.g2`. Each word its own skill id, which is exactly
what spaced repetition is for.

### Vocabulary — `lit.vocab` (PN–G6) — **partly exists**
`core.firstwords` (24 objects) exists. Add: `core.vocab.actions` (verbs),
`core.vocab.opposites`, `core.vocab.feelings`, `core.vocab.g2` … `core.vocab.g6`
(tier-2 academic words), `core.vocab.prefixes`.

### Comprehension — `lit.read` (K–G6) — **exists K–G4**
`core.reading.k/g1/g2/g3` exist, 268 items, literal / inference / sequence
each a separate skill. **Missing:** G5, G6, and the non-fiction strand —
main idea, author's purpose, text features, compare two accounts.

### Spelling — `lit.spell` (G1–G6)
`core.spell.g1` … `core.spell.g6` by pattern. Plus the custom path: a weekly
list under `x.spelling.wkNN` with a declared parent of `lit.spell`.

### Grammar — `lit.gram` (G1–G6)
Nouns/verbs (G1), plurals and tenses (G2), adjectives and adverbs (G2),
sentence types and punctuation (G2–G3), pronouns (G3), conjunctions (G3),
clauses (G4), active/passive (G5), speech punctuation (G5).

---

## Numeracy — `num`

### Counting — `num.count` (PN–R) — **exists**
`core.counting` covers 1–10 with tap-to-count. **Add:** `core.count.to20`,
`core.count.skip` (2s, 5s, 10s — K.CC.1), `core.count.ordinal`.

### Number facts — **exists, grade-split**
`core.math.k` (within 10, K.OA.5), `core.math.g1` (within 20 + regrouping,
1.OA.6), `core.math.g2` (within 100, 2.NBT), `core.math.g3` (×÷ within 100,
3.OA.7), `core.math.g45` (multi-digit, 4.NBT).

**Times tables deserve their own modules.** `core.times.2` … `core.times.12`,
each fact its own skill id (`num.mul.facts.7.8`), because 7×8 and 7×3 are not
the same thing to remember and should not share a review clock.

### Place value — `num.place` (G1–G4)
`core.place.g1` (tens and ones to 120), `core.place.g2` (hundreds),
`core.place.g3` (rounding), `core.place.g4` (to a million, comparing).
**Needs a `place-value` generator.**

### Fractions — `num.frac` (G3–G6) — **nothing yet**
`core.frac.g3` (unit fractions, number line — 3.NF), `core.frac.g4`
(equivalence, comparing), `core.frac.g5` (add/subtract unlike denominators),
`core.frac.g6` (multiply and divide). **Needs `fraction-compare` and
`fraction-of` generators, and a `numberline` item type.**

### Decimals and percent — `num.dec`, `num.pct` (G4–G6)
Tenths and hundredths, place value, four operations, percent of an amount,
fraction↔decimal↔percent conversion.

### Measurement — `num.meas` (R–G5)
Longer/shorter (R), non-standard units (K), cm and m (G1), grams and kilograms
(G2), capacity (G2), perimeter (G3), area (G3), volume (G5), unit conversion (G4).

### Time — `num.time` (R–G3)
Day/night and routines (R), o'clock and half past (G1), quarter past/to (G2),
five minutes (G2), digital and 24-hour (G3), elapsed time (G3).

### Money — `num.money` (R–G4)
Recognising coins (R), making amounts (G1), change (G2), decimal notation (G3),
budgeting word problems (G4).

### Geometry — `num.geo` (PN–G6)
2D shapes (PN–R), 3D solids (K), sides and corners (G1), symmetry (G2),
right angles (G3), angle types (G4), coordinates (G4), circles (G6),
transformations (G6).

### Data — `num.data` (G1–G6)
Pictograms (G1), bar charts (G2), tables (G2), line graphs (G4), mean/median/
mode (G5), pie charts (G6), simple probability (G6).

### Algebra — `num.alg` (R–G6) — **partly exists**
Sequences and missing numbers exist as generators. Add: input/output machines
(G3), expressions (G5), simple equations (G6), coordinate rules (G6).

---

## Science — `sci` (nothing yet)

| Strand | Modules |
|---|---|
| `sci.life` | living/non-living (R), animal groups (K), habitats (G1), life cycles (G2), food chains (G3), plant parts (G2), adaptation (G4), classification (G5) |
| `sci.body` | body parts (PN–R), the senses (R), teeth (G2), skeleton (G3), digestion (G4), circulation (G5) |
| `sci.earth` | weather (R), seasons (K), rocks (G3), the water cycle (G4), volcanoes (G5) |
| `sci.phys` | push and pull (K), materials (G1), floating and sinking (G2), light and shadow (G3), sound (G4), magnets (G3), electricity (G4), forces (G5) |
| `sci.space` | day and night (G1), the planets (G2), moon phases (G5), the solar system (G5) |
| `sci.method` | predict and observe (G2), fair tests (G3), reading results (G4) |

---

## World — `wld` (nothing yet)

`wld.geo`: continents and oceans (G1), maps and compass (G2), countries and
capitals (G3–G5), rivers and mountains (G4), climate zones (G5).
`wld.hist`: then and now (K), historic figures (G2), ancient civilisations
(G4), local history (G3).
`wld.civ`: rules and fairness (G1), community helpers (K), voting (G4).
`wld.culture`: festivals, food, flags (G1–G4).
`wld.lang.<iso>`: first words in French, Spanish, Hebrew (any band) — the
`listen` and `tap-image` types already handle this with no new work.

---

## Logic — `log` (nothing yet)

Patterns (PN–G1), sorting and odd-one-out (N–G2), sequencing (R–G2), spatial
reasoning and mirror images (G1–G3), simple deduction grids (G3–G5),
algorithms and debugging (G3–G6).

---

## Social-emotional and practical — `sel`, `life` (nothing yet)

Naming feelings (PN–R), reading faces (R–G1), sharing and turn-taking (R–G1),
calming strategies (G1–G3), road safety (R–G2), stranger safety (R–G2),
online safety (G3–G6), healthy food (K–G2), keeping time (G1–G3).

---

## What the engine still needs

Several modules above cannot be written until the engine supports them.
Ordered by how many modules each unblocks:

| Needed | Unblocks |
|---|---|
| `numberline` item type | fractions, place value, rounding, measurement — dozens of modules |
| `order` / sequencing type | life cycles, historic timelines, story order, number order |
| `sort` into buckets | classification, sorting, odd-one-out, materials |
| `match` pairs | vocabulary, capitals, upper↔lower case, opposites |
| `cloze` with a word bank | grammar, spelling in context, comprehension |
| `hotspot` on a picture | body parts, plant parts, maps, diagrams |
| `place-value`, `round`, `fraction-compare`, `fraction-of` generators | all of G3–G6 maths |
| `short` typed answer (G2+) | spelling, recall, anything open |

The six item types that exist (`mcq`, `tap-image`, `listen`, `assemble`,
`count`, `trace`) cover ages 2–8 well and G3+ poorly. That is the same shape
as the band table above, and it is not a coincidence: **the older bands are
thin because the interactions older children need have not been built yet.**

---

## Authoring order that gets the most for the least

1. `core.phonics.g1` — closes the one missing strand.
2. `core.times.2`…`12` — pure template work, no new engine, and the single
   most-drilled thing in primary maths.
3. `core.sight.k/g1/g2` — enumerated, quick to write, per-word skills make
   spaced repetition shine.
4. `numberline` type, then `core.frac.g3`, `core.place.g1–4`.
5. `order` and `sort` types, then the science strand, which is mostly
   classification and sequencing.
6. G5–G6 reading comprehension.
