# Authoring prompt

Copy everything between the lines into any capable LLM, attach the photo (or paste the text)
of the homework, syllabus, spelling list, or whatever you have, and it will emit a module.
Save the result as `content/modules/<id>.json`, add a line to `content/index.json`, run
`npm run validate`, then `npm run deploy`.

The whole loop should take about a minute. If it takes ten, something in this prompt needs
fixing — file an issue.

---

```
You are writing a learning module for Quiz Quest, a family quiz game. I will give you source
material (a photo of homework, a spelling list, a syllabus, a topic). Produce ONE complete
JSON module following the schema below, and nothing else — no prose before or after.

THE MOST IMPORTANT RULES

1. When a child gets a question wrong, the game teaches them and makes them re-produce the
   answer. Your job is to make that teaching GOOD. Every wrong option must carry a
   "misconception" slug naming the wrong idea that would lead to it, and the remediation
   ladder must address those ideas specifically.

2. The "example" rung of a ladder must be a worked example of an ANALOGOUS item — never the
   target item. If your worked example contains the answer, the child copies it and learns
   nothing. For "cake", show "cap → cape". Never show "cake".

3. The "generate" step must be a HIGHER-PRODUCTION interaction than the original. If the
   original is multiple choice, generate must be "assemble" (build from tiles). Recognition
   must not substitute for recall.

4. Skill ids are the unit of scheduling. If two things should be reviewed on independent
   clocks, they must be separate ids. Letter B and letter D are different skills
   (lit.alpha.sound.upper.b, lit.alpha.sound.upper.d). 7×8 is its own skill
   (num.mul.facts.7). Do not lump.

5. Write 2 variants per item (hidden items, "variantOf" set) at the same skill with a
   different surface — different picture, different word, different numbers. These are used
   to check the child actually learned the skill rather than memorising the answer.

6. Age band determines modality, not difficulty:
     PN (2–3): no text at all. Audio + image only. Types: tap-image, listen, count, trace.
     N  (3–4): ≤3 words. Add mcq with image options.
     R  (4–5): ≤6 words. Add assemble (CVC words), trace (letters), template.
     K  (5–6): ≤15 words. mcq with text options.
     G1 (6–7): ≤30 words.   G2 (7–8): ≤60 words.   G3 (8–9): ≤80 words.
     G4–G6 (9–14): up to 200 words.   A: adult.
   Set "tts": true on every prompt so the game can read it aloud.

7. Difficulty is 1–10: 1 = pre-nursery trivial, 3 = reception, 5 = grade 2, 7 = grade 5,
   10 = middle-school hard. Be honest; most homework items cluster within ±1 of the child's
   grade.

8. Feedback text is about the TASK, never the child. Never "Wrong!", never "Great job!".
   Name the specific error: "'cak' is missing the magic e." Keep it warm and short.

9. No executable code. No HTML. Plain strings only. Media as file names only (I will supply
   the files); if you have no media, omit the "media" field entirely rather than inventing
   paths.

10. Prefer the module-level "remediationDefaults" for a skill shared by many items, and add
    item-level "remediation" only where a specific misconception needs its own handling.

THE SCHEMA

{
  "schema": "quizquest.module/1",
  "id": "<family>.<topic>.<slug>",            // e.g. "milton.spelling.wk12". Lowercase, dots.
  "version": 1,
  "title": "<short human title>",
  "subtitle": "<where this came from>",
  "author": { "name": "<who asked>", "kind": "ai-assisted", "model": "<your model name>" },
  "license": "CC-BY-4.0",
  "source": "<describe the source material>",
  "bands": ["<band>", ...],
  "locale": "en-GB" | "en-US" | ...,
  "skills": ["<every skill id used>"],
  "parents": { "<x.prefix>": "<registered skill>" },   // REQUIRED for every x.* prefix
  "prereqs": { "<skill>": ["<prerequisite skill>"] },   // optional
  "alignment": { "ccss": [], "engnc": [], "other": [] }, // optional, free text
  "estimatedMinutes": <n>,
  "defaults": { "type": "mcq", "difficulty": <n>, "band": "<band>", "skill": "<skill>" },
  "remediationDefaults": {
    "<skill>": {
      "ladder": [
        { "kind": "nudge",   "text": "<one-line redirect>" },
        { "kind": "example", "text": "<analogous worked example — NOT the answer>" },
        { "kind": "rule",    "text": "<the rule, plainly>" }
      ]
    }
  },
  "items": [
    {
      "id": "i1",
      "type": "mcq" | "tap-image" | "listen" | "assemble" | "count" | "trace" | "template",
      "skill": "<skill id>",
      "difficulty": <1..10>,
      "band": "<minimum band>",
      "prompt": { "text": "<question>", "tts": true },
      "media": { "image": "<file>.png", "alt": "<description>" },   // optional
      "options": [                                                   // mcq / tap-image / listen
        { "v": "<text>", "correct": true },
        { "v": "<text>", "misconception": "<slug>" },
        { "v": "<text>", "misconception": "<slug>" }
      ],
      "shuffle": true,
      "remediation": {                                               // optional if defaults cover it
        "onMisconception": { "<slug>": { "enterRung": <0..3>, "text": "<optional specific note>" } },
        "ladder": [ ...same shape as above, optionally with a 4th { "kind": "reveal" } rung... ],
        "generate": { "type": "assemble", "prompt": { "text": "Build the word", "tts": true },
                      "tiles": ["<letters incl. 2 distractors>"], "answer": "<answer>" },
        "proveIt": { "ref": "i1v1" }
      },
      "variants": ["i1v1", "i1v2"],
      "why": {                                                       // on ~1 in 6 items
        "question": "<why is that the answer?>",
        "options": [ { "v": "<real reason>", "correct": true }, { "v": "<plausible wrong reason>" }, { "v": "I just knew it" } ]
      }
    },
    { "id": "i1v1", "variantOf": "i1", "hidden": true, ... },
    { "id": "i1v2", "variantOf": "i1", "hidden": true, ... }
  ]
}

TYPE-SPECIFIC BODIES

  assemble:  "tiles": ["c","a","k","e","i","p"], "answer": "cake"      // include 1–3 distractor tiles
  count:     "n": 3, "item": "🍎", "choices": [2,3,4]                   // omit choices for tap-to-count
  trace:     "glyph": "A"                                              // single character
  template:  "gen": "add"|"sub"|"mul"|"div"|"compare"|"count"|"sequence"|"missing-number"|
                    "letter-recognize"|"spell-from-list",
             "params": { "a": [lo,hi], "b": [lo,hi], "constraint": "carry"|"no-carry"|"borrow"|
                         "no-borrow"|"exact-ten"|"within-10"|"within-20"|"within-100", "choices": 4 }

REGISTERED STRANDS (use these; anything else goes under x.* with a declared parent)

  lit.{phon,alpha,phonics,sight,vocab,read,spell,gram,write}
  num.{count,numeral,compare,subitize,add,sub,mul,div,place,frac,dec,pct,meas,time,money,geo,data,alg}
  sci.{life,earth,phys,space,body,method}
  wld.{geo,hist,civ,culture,lang.<iso>}
  log.{pattern,seq,class,spatial,puzzle,code}
  art.{draw,color,music,craft}
  sel.{emotion,friend,safety,self}
  life.{body,food,money,time,road}
  x.<anything>   — must declare a parent, e.g. "parents": { "x.spelling": "lit.spell" }

WHAT I WANT

  Source material: [attach photo / paste text here]
  Child's band: [e.g. G2]
  Locale: [e.g. en-GB]
  Family namespace for the id: [e.g. milton]
  Anything else: [e.g. "she confuses b and d", "make it about dinosaurs"]

Output the JSON only.
```

---

## For goal missions (exams and certifications)

Replace the "WHAT I WANT" block with:

```
  Source material: [paste the exam blueprint / syllabus / domain list]
  Band: A
  Locale: [e.g. en-US]
  Namespace: [e.g. aws.saa]
  Exam date: [YYYY-MM-DD]
  Produce one module per blueprint domain, each with 25–40 items, and include this block in
  each:
    "mission": { "id": "<namespace>.<year>", "kind": "goal", "title": "<exam name>",
                 "horizon": "<date>", "domains": [ { "skill": "<ns>.<domain>", "weight": <0..1>, "targetTheta": <n> } ... ] }
  Weights must match the published blueprint and sum to 1.
```

Adults get the same remediation loop as children. Do not shortcut it — "read the explanation,
tap OK" is exactly the pattern this app exists to replace.
