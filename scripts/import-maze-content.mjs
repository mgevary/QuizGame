/**
 * import-maze-content.mjs — turn the sibling Maze project's question banks
 * into Quiz Quest modules.
 *
 * Maze asked a question and moved on. Quiz Quest has to TEACH when a child
 * gets it wrong, so importing is not a copy: every item gains a hint ladder,
 * a generate step that makes the child produce the answer, and a prove-it
 * variant at the same skill. That enrichment is what this script is for.
 *
 * Source is staged in .port/ so the import is reproducible after the sibling
 * repo is deleted. Run: node scripts/import-maze-content.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'content', 'modules');

/* ── read the bank without importing Maze's module graph ─────────────── */
const SRC = path.join(ROOT, '.port/js/minigames/reading-bank.js');
if (!fs.existsSync(SRC)) {
  console.log('Source bank not present (.port/ is a staging copy of the sibling Maze repo).');
  console.log('The imported modules are committed under content/modules/core-reading-*.json;');
  console.log('re-stage .port/ only if you need to regenerate them.');
  process.exit(0);
}
const src = fs.readFileSync(SRC, 'utf8');
const body = src.slice(src.indexOf('READING_BANK'));
const json = body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1);
const BANK = JSON.parse(json.replace(/,\s*(?=[}\]])/g, ''));

const GRADE = {
  K:  { band: 'K',  baseDiff: 2, title: 'Reading — first steps' },
  '1': { band: 'G1', baseDiff: 3, title: 'Reading — grade 1' },
  '2': { band: 'G2', baseDiff: 4, title: 'Reading — grade 2' },
  '3': { band: 'G3', baseDiff: 5, title: 'Reading — grade 3' }
};

/**
 * Literal recall vs inference, guessed from the question stem. Getting this
 * right matters more than it looks: the two are separate skills with separate
 * review clocks, and the teach card for each is completely different.
 */
function skillFor(q, tier) {
  const s = q.toLowerCase();
  if (/^why|how (does|did|do)|what.*(feel|think|mean)/.test(s)) return 'lit.read.inference';
  if (/^when/.test(s)) return 'lit.read.sequence';
  return 'lit.read.literal';
}

const LADDERS = {
  'lit.read.literal': [
    { kind: 'nudge', text: 'Read it once more. The answer is hiding in the words.' },
    { kind: 'example', text: 'If a story says "Milo found a shell", and you are asked what Milo found, point at the word "shell".' },
    { kind: 'rule', text: 'For a "what", "where" or "who" question, find the matching words in the story and read that bit again.' }
  ],
  'lit.read.inference': [
    { kind: 'nudge', text: 'The story does not say it straight out. What does it make you think?' },
    { kind: 'example', text: 'If a story says "Ana pulled on her coat and hat", nobody said it was cold — but you know it was.' },
    { kind: 'rule', text: 'Put together what the story says with what you already know, and you get the answer.' }
  ],
  'lit.read.sequence': [
    { kind: 'nudge', text: 'Look for the time words: when, then, after, on Sunday.' },
    { kind: 'example', text: '"She swims on Thursday" — the time word is "Thursday".' },
    { kind: 'rule', text: 'A "when" question is answered by a time word in the story.' }
  ]
};

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'it', 'is']);

/**
 * The generate step must make the child PRODUCE the answer, not recognise it.
 * A short answer becomes word tiles they rebuild; a long one falls back to the
 * engine's reshuffle, which is weaker but never blocks the loop.
 */
function generateFor(answer) {
  const words = answer.split(/\s+/);
  if (words.length > 4 || answer.length > 26) return null;
  const decoys = ['not', 'never', 'under', 'later', 'blue', 'loud'].filter(d => !words.includes(d)).slice(0, 2);
  return {
    type: 'assemble',
    prompt: { text: 'Build the answer', tts: true },
    tiles: words.concat(decoys).sort(),
    answer: answer,
    wordTiles: true
  };
}

for (const grade of Object.keys(BANK)) {
  const g = GRADE[grade];
  if (!g) continue;
  const rows = BANK[grade];
  const items = [];
  const bySkill = {};

  rows.forEach((r, i) => {
    const skill = skillFor(r.q, r.t);
    (bySkill[skill] = bySkill[skill] || []).push('r' + i);
    const answer = r.a[r.c];
    const item = {
      id: 'r' + i,
      type: 'mcq',
      skill,
      difficulty: Math.min(10, g.baseDiff + Math.round((r.t - 1) * 0.7)),
      band: g.band,
      passage: r.p,
      prompt: { text: r.q, tts: true },
      options: r.a.map((v, k) => k === r.c
        ? { v, correct: true }
        : { v, misconception: 'picked-a-word-from-the-story' }),
      shuffle: true,
      remediation: {}
    };
    const gen = generateFor(answer);
    if (gen) item.remediation.generate = gen;
    // The worked example must be an ANALOGOUS item, never the target. If the
    // shared example happens to contain this item's answer, drop it rather
    // than hand the child the answer before asking them to produce it.
    var lower = answer.toLowerCase();
    item.remediation.ladder = LADDERS[skill]
      .filter(r => !(r.kind === 'example' && r.text.toLowerCase().includes(lower)))
      .concat([{ kind: 'reveal', text: 'The answer is "' + answer + '".' }]);
    if (!Object.keys(item.remediation).length) delete item.remediation;
    items.push(item);
  });

  // Prove-it: a DIFFERENT question at the same skill, so "I remember this one
  // is B" cannot pass. Pair each item with its neighbour in the same skill.
  for (const skill of Object.keys(bySkill)) {
    const ids = bySkill[skill];
    ids.forEach((id, i) => {
      const partner = ids[(i + 1) % ids.length];
      if (partner === id) return;
      const it = items.find(x => x.id === id);
      it.variants = [partner];
      it.remediation = it.remediation || {};
      it.remediation.proveIt = { ref: partner };
    });
  }

  const mod = {
    schema: 'quizquest.module/1',
    id: 'core.reading.' + (grade === 'K' ? 'k' : 'g' + grade),
    version: 1,
    title: g.title,
    subtitle: 'Read a little story, then answer.',
    author: { name: 'Quiz Quest', kind: 'human' },
    verified: true,
    license: 'MIT',
    source: 'ported and enriched from the Maze reading bank',
    bands: [g.band],
    locale: 'en-GB',
    skills: Object.keys(bySkill),
    estimatedMinutes: 8,
    defaults: { type: 'mcq', band: g.band },
    remediationDefaults: Object.fromEntries(Object.keys(LADDERS).map(k => [k, { ladder: LADDERS[k] }])),
    items
  };
  fs.writeFileSync(path.join(OUT, mod.id.replace(/\./g, '-') + '.json'), JSON.stringify(mod, null, 1) + '\n');
  console.log('wrote', mod.id, items.length, 'items');
}
