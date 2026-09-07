# Content format reference

Modules are plain JSON files in `content/modules/`, listed in `content/index.json`. This is
the complete schema. The validator in `js/content/validate.js` (also run by
`npm run validate` and in CI) is the executable version of this document.

**Design priorities, in order:**

1. An LLM emits a valid module from a photo of homework in one shot, with no tooling.
2. A human hand-writes a 5-item module in a text editor in 10 minutes.
3. Remediation content is **optional at every level**, with three tiers of fallback.
4. Media is **referenced, never inlined**. No base64 in JSON.
5. **No executable code in content, ever.**

---

## 1. Module

```jsonc
{
  "schema": "quizquest.module/1",            // required, exactly this string
  "id": "milton.spelling.wk12",              // required. Globally unique, reverse-dns-ish.
                                             //   [a-z0-9][a-z0-9.-]* — dots separate namespaces
  "version": 3,                              // required integer. Bump on any change.
  "title": "Spelling — week 12 (magic e)",   // required
  "subtitle": "From Tuesday's homework sheet",
  "updated": "2026-09-06",                   // ISO date
  "author":  { "name": "Dad", "kind": "human" | "ai-assisted" | "ai", "model": "claude-opus-5" },
  "license": "CC-BY-4.0",
  "source":  "photo of school homework sheet, 2026-09-05",

  "bands":  ["G2", "G3"],                    // required. Which age bands this suits (see §6)
  "locale": "en-GB",                         // BCP-47. Drives TTS voice and spelling
  "strands": ["lit"],                        // derived from skills if omitted
  "skills":  ["lit.phonics.silent-e", "x.spelling.wk12"],   // every skill used by any item
  "parents": { "x.spelling": "lit.spell" },  // REQUIRED for every x.* skill prefix used
  "prereqs": { "lit.phonics.silent-e": ["lit.phonics.cvc"] },   // optional, keep shallow
  "alignment": { "ccss": ["L.2.2.D"], "engnc": ["Y3 spelling"], "other": [] },  // free text, not validated

  "estimatedMinutes": 8,
  "media": { "baseUrl": "./media/milton-spelling-wk12/" },   // all media paths resolve against this
  "defaults": {                              // applied to every item lacking the field
    "type": "mcq", "difficulty": 4, "band": "G2", "skill": "x.spelling.wk12"
  },

  "remediationDefaults": { /* §4, tier 2 */ },
  "items": [ /* §2 */ ],
  "sets": [                                  // optional curated orderings
    { "id": "warmup", "title": "Warm up", "items": ["i1", "i2", "i3"] }
  ],
  "mission": { /* §7, optional — for goal missions */ }
}
```

---

## 2. Item — common fields

```jsonc
{
  "id": "i7",                    // required, unique within the module
  "type": "mcq",                 // required (or from defaults). See §3
  "skill": "lit.phonics.silent-e",   // required (or from defaults). See §5
  "difficulty": 4,               // 1..10. 1 = pre-nursery trivial, 10 = middle-school hard
  "band": "G2",                  // minimum band. Gates modality, not difficulty
  "rep": "concrete" | "iconic" | "abstract",   // concreteness-fading stage, numeracy only
  "hidden": false,               // true = never served fresh; only as prove-it / follow-up
  "variantOf": "i7",             // marks this item as a near-transfer variant of another

  "prompt": {
    "text": "Which spelling is correct?",
    "audio": "q7.mp3",           // recorded file, preferred
    "tts": true                  // allow speech synthesis as a fallback
  },
  "media": {                     // optional on EVERY type — "look at this and answer"
    "image": "cake.png",
    "alt": "a birthday cake with candles"    // required if image present
  },

  "passage": "Ned met Dan. Dan had a pet hen.",   // reading comprehension: a short text shown
                                 // above the prompt, on the same highlighted panel. Keep it to
                                 // a few sentences — it is the thing being read, not a page
  "story": "Jen Gets a Pet",     // the story a passage belongs to; shown as a small label above it

  "remediation": { /* §4, tier 1 */ },
  "variants": ["i7v1", "i7v2"],  // ids of hidden items at the same skill
  "followUp": { "minGapTurns": 5, "prefer": ["i7v1"] },
  "why": {                       // optional elaborative-interrogation prompt, ~1 in 6 items
    "question": "Why does it need the e?",
    "options": [
      { "v": "It makes the a say its name", "correct": true },
      { "v": "Because every word ends in e" },
      { "v": "I just knew it" }
    ]
  }
}
```

**Text limits by band** (validated): the prompt's word count must be within the band's
`maxWords` (§6). For PN and N that is 0 — the prompt must be carried by audio and image alone.

---

## 3. Item types

Only **gradable** types update the learner's ability estimate and the spaced-repetition
schedule. This is enforced in code.

### 3.1 v1 types

#### `mcq` — multiple choice (gradable)
```jsonc
{ "type": "mcq",
  "options": [
    { "v": "cake", "correct": true },
    { "v": "caik", "misconception": "vowel-team-for-silent-e" },
    { "v": "cak",  "misconception": "omits-silent-e" },
    { "v": "kake", "misconception": "hard-c-spelled-k" }
  ],
  "shuffle": true }
```
- 2–4 options. Each may carry `v` (text), `image` + `alt`, or `audio`.
- Exactly one `correct: true`.
- **`misconception` on every wrong option is the highest-value field in the format.** It is
  a short slug naming *the wrong idea that would lead to this choice*, and it lets the teach
  card address that idea specifically. Reuse the same slug across items for the same
  misconception.

#### `tap-image` — pick the picture (gradable, PN+)
```jsonc
{ "type": "tap-image",
  "prompt": { "audio": "which-is-the-cat.mp3", "tts": true, "text": "Which one is the cat?" },
  "options": [
    { "image": "cat.png", "alt": "a cat", "correct": true },
    { "image": "dog.png", "alt": "a dog" },
    { "image": "cow.png", "alt": "a cow" }
  ] }
```
- 2–4 options, every one an image. Rendered at the band's minimum touch size.

#### `listen` — hear it, pick it (gradable, PN+)
```jsonc
{ "type": "listen",
  "prompt": { "audio": "buh.mp3", "tts": "b", "text": "Which letter makes this sound?" },
  "options": [ { "v": "b", "correct": true }, { "v": "d" }, { "v": "p" } ] }
```
- Like `mcq`, but the prompt is *primarily* audio and there is a big replay button.

#### `assemble` — build it from tiles (gradable, R+)
```jsonc
{ "type": "assemble",
  "prompt": { "text": "Build the word", "audio": "build-cake.mp3" },
  "media": { "image": "cake.png", "alt": "a cake" },
  "tiles": ["c", "a", "k", "e", "i", "p"],     // includes distractor tiles
  "answer": "cake" }
```
- `answer` must be constructible from `tiles`. Tiles may be letters, digits, or words.
- **The best generation format for spelling.** Use it as the `generate` step for failed `mcq`s.

#### `count` — tap to count (gradable, PN+)
```jsonc
{ "type": "count",
  "prompt": { "audio": "how-many-apples.mp3", "tts": true, "text": "How many apples?" },
  "n": 3, "item": "🍎",           // emoji or an image path
  "choices": [2, 3, 4] }          // optional; if omitted, the child taps objects and the count reads aloud
```

#### `trace` — trace a glyph or shape (gradable, PN+)
```jsonc
{ "type": "trace",
  "prompt": { "audio": "trace-the-a.mp3", "tts": true, "text": "Trace the letter A" },
  "glyph": "A",                                        // engine derives the path from its font
  "path": "M 10 90 L 50 10 L 90 90 M 25 60 L 75 60",   // OR an explicit SVG path (normalised 0..100)
  "strokeOrder": [ [10,90], [50,10], [25,60] ],        // optional start points per stroke
  "tolerance": "band" }                                // or a number 0..1 to override
```
- Provide `glyph` **or** `path`. Scoring is coverage + precision with band-scaled tolerance;
  formation is a badge, never a fail, and only assessed G1+.

#### `template` — procedurally generated (gradable, R+)
```jsonc
{ "type": "template",
  "skill": "num.add.within20.regroup",
  "gen": "add",
  "params": { "a": [4, 9], "b": [4, 9], "constraint": "carry", "choices": 4 } }
```
- `gen` must be one of the **whitelisted** generators: `add`, `sub`, `mul`, `div`,
  `compare`, `count`, `sequence`, `missing-number`, `letter-recognize`, `spell-from-list`.
- `constraint` is an **enum** per generator, never an expression: `carry`, `no-carry`,
  `borrow`, `no-borrow`, `exact-ten`, `within-10`, `within-20`, `within-100`.
- Unknown `gen` or `constraint` → the item is skipped at load with a validation error.
- Templates are seeded from the match, so every device generates the same problem.

### 3.2 Planned types (not in v1; the validator rejects them until implemented)

`order`, `match`, `sort`, `cloze`, `numberline`, `odd`, `pattern`, `estimate`, `hotspot`,
`short`. Their shapes are sketched in [PLAN.md §6.3](PLAN.md).

---

## 4. Remediation

Three tiers. The engine uses the most specific one available.

### Tier 1 — item-level `remediation`
```jsonc
"remediation": {
  "onMisconception": {                    // optional: jump to the rung that addresses THIS wrong idea
    "omits-silent-e":          { "enterRung": 1 },
    "vowel-team-for-silent-e": { "enterRung": 2 },
    "hard-c-spelled-k":        { "enterRung": 2, "text": "'c' before a, o, u says /k/." }
  },
  "ladder": [                             // 1..4 rungs, ascending support. Kinds in order:
    { "kind": "nudge",   "text": "Listen: /kayk/. Does the a say its own name?", "audio": "h1.mp3" },
    { "kind": "example", "text": "cap → cape. The e is silent and makes the a say A.", "image": "cap-cape.png" },
    { "kind": "rule",    "text": "Magic e makes the vowel say its name.", "image": "magic-e-rule.png", "audio": "h3.mp3" },
    { "kind": "reveal",  "text": "It's cake — c, a, k, e. The e is silent." }
  ],
  "generate": {                           // the MANDATORY production step. Any gradable item body.
    "type": "assemble",
    "prompt": { "text": "Build the word", "audio": "g1.mp3" },
    "tiles": ["c","a","k","e","i","p","k"], "answer": "cake"
  },
  "proveIt": { "ref": "i7v1" }            // a DIFFERENT item at the same skill
}
```

**Rules the validator enforces:**
- Rung kinds must appear in the order `nudge` < `example` < `rule` < `reveal`; any may be
  omitted.
- **An `example` rung must not contain the target answer.** If the worked example solves the
  exact item, the generate step becomes copying and the generation effect is destroyed. The
  validator checks the `example` text does not contain the correct option's `v`.
- `generate.type` must be gradable and must be a *higher-production* type than the original
  (`mcq` → `assemble`/`cloze`; `tap-image` → `listen`; `count` → `count` without choices).
- `proveIt.ref` must resolve to an item with the same `skill`.

### Tier 2 — module-level `remediationDefaults[skillId]`
Same shape as tier 1 minus `onMisconception` and `proveIt`. One ladder covers every item at
that skill. **This is the sweet spot for hand-authoring.**

### Tier 3 — engine generic
If nothing is authored: `nudge: "Have another careful look."` → `reveal: "The answer is X."`
→ generic generate (the original re-asked with options reshuffled and the chosen wrong option
retained, so elimination doesn't work). Degraded, but the loop still runs.

**A module with zero remediation is valid and playable.** Never make good remediation a
precondition for shipping content.

---

## 5. Skill ids

Format: `<strand>.<topic>.<skill>[.<param>...]`

- Lowercase. Segments match `[a-z0-9][a-z0-9-]*`. 2–6 segments. ≤64 characters.
- The strand must be registered in [skill-registry.json](skill-registry.json), or be `x`.
- **Leaf granularity = scheduling granularity.** If letter B and letter D should be reviewed
  on independent clocks, they must be separate ids (`lit.alpha.sound.upper.b`).
- Prefix matching is semantic: `num.add` is an ancestor of `num.add.within10`. The ability
  estimate is stored at every ancestor, so new skills inherit a prior.
- **Two modules using the same leaf id share one schedule.** A skill mastered in the school
  module is not re-drilled by a homemade one.
- **Every `x.*` prefix must declare a parent** in the module's `parents` map.

Examples:
```
num.add.within10          num.mul.facts.7           lit.alpha.sound.upper.b
lit.phonics.cvc.short-a   x.spelling.wk12.because   wld.lang.fr.greeting
```

---

## 6. Bands

| Band | Age | maxWords | Audio | Types allowed |
|---|---|---|---|---|
| `PN` | 2–3 | 0 | required | tap-image, listen, count, trace |
| `N` | 3–4 | 3 | required | + mcq (image options only) |
| `R` | 4–5 | 6 | required | + assemble, trace (letters), template |
| `K` | 5–6 | 15 | default on | + mcq (text options) |
| `G1` | 6–7 | 30 | optional | all v1 |
| `G2` | 7–8 | 60 | optional | all v1 |
| `G3` | 8–9 | 80 | off | all v1 |
| `G4` | 9–10 | 120 | off | all |
| `G5` | 10–11 | 150 | off | all |
| `G6` | 11–14 | 200 | off | all |
| `A` | adult | — | off | all |

A module's `bands` array lists every band it suits. An item's `band` is its *minimum*.

---

## 7. Mission block (goal missions)

Optional. Declares that this module (or set of modules sharing the same `mission.id`) targets
a real exam.

```jsonc
"mission": {
  "id": "aws.saa.2027",
  "kind": "goal",
  "title": "AWS Solutions Architect Associate",
  "horizon": "2027-03-03",
  "domains": [
    { "skill": "aws.saa.secure",    "weight": 0.30, "targetTheta": 7 },
    { "skill": "aws.saa.resilient", "weight": 0.26, "targetTheta": 7 },
    { "skill": "aws.saa.perf",      "weight": 0.24, "targetTheta": 6 },
    { "skill": "aws.saa.cost",      "weight": 0.20, "targetTheta": 6 }
  ]
}
```
Weights must sum to 1.0 ± 0.01. See [MISSIONS.md](MISSIONS.md).

---

## 8. Manifest — `content/index.json`

```jsonc
{
  "schema": "quizquest.index/1",
  "updated": "2026-09-06",
  "modules": [
    { "id": "core.letters.upper", "title": "Uppercase letters",
      "url": "modules/core-letters-upper.json",
      "bands": ["PN","N","R"], "strands": ["lit"], "items": 26, "version": 4,
      "bytes": 21400, "hasAudio": true, "verified": true }
  ],
  "packs": [
    { "id": "core", "title": "Starter pack",
      "modules": ["core.letters.upper", "core.count.10", "core.shapes"],
      "precache": true }
  ]
}
```

- `verified: true` means a human has played the module through. **Only verified modules may
  update the ability estimate**; unverified ones award track steps only.
- Packs with `precache: true` are bundled by the service worker so a first-run device with
  no network is playable.
- `scripts/validate-modules.mjs` regenerates `items`, `bytes` and `hasAudio` — don't
  hand-edit those.

---

## 9. Media

- Paths resolve against the module's `media.baseUrl`.
- Images: PNG or WebP, ≤ 200 KB each, ≤ 800 px on the long side. `alt` is required.
- Audio: MP3 or M4A, ≤ 100 KB per prompt. Mono, 22 kHz is plenty for speech.
- **The bundled core PN–R pack must ship recorded audio.** TTS is a fallback for
  user-authored modules, not a substitute for pre-readers.
- Media is **never** transferred between devices — only referenced. A module shared without
  its media degrades to text + TTS.

---

## 10. What the validator checks

- schema string, required fields, id formats
- every skill matches the regex; strand is registered or `x`; every `x.*` prefix has a parent
- every item has exactly one resolvable correct answer
- `answer` is constructible from `tiles`
- every referenced media file exists on disk and is within size limits; every image has `alt`
- every `proveIt.ref` and `variants[]` id resolves, to an item with the same skill
- no duplicate item ids
- prompt word count within the item's band `maxWords`
- ladder rung order; `example` rungs do not contain the answer; `generate` is higher-production
- `gen` and `constraint` are whitelisted
- mission domain weights sum to 1

**Validation catches structure, never semantics.** An AI-written module can pass every check
and still have a wrong answer. Play it yourself first.
