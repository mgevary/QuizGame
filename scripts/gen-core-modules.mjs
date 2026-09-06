/**
 * gen-core-modules.mjs — writes the bundled starter pack.
 *
 * Two deliberate constraints shape these modules:
 *  1. ZERO binary assets. Pictures are emoji, drawn as text at whatever size
 *     the band needs. That keeps the first-run download tiny, works offline
 *     from the first second, survives being shared between devices with no
 *     media transfer, and scales to any screen.
 *  2. Every item that can be got wrong carries a teach ladder and a generate
 *     step, because an item without remediation is a quiz question, not a
 *     learning one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'content', 'modules');
const write = (m) => {
  fs.writeFileSync(path.join(OUT, m.id.replace(/\./g, '-') + '.json'), JSON.stringify(m, null, 1) + '\n');
  console.log('wrote', m.id, (m.items || []).length, 'items');
};

/* ── 1. First words and pictures (pre-nursery upward) ────────────────── */
// Pre-readers cannot read the question, so the prompt carries its meaning in
// audio; the emoji carries the rest. maxWords for PN is 0 for exactly this
// reason — the text below is for the grown-up sitting alongside.
// Named illustrations from js/ui/pictures.js, never emoji: emoji render
// differently on every device and carry a register that undercuts the app.
const PICTURES = [
  ['cat', 'animal'], ['dog', 'animal'], ['cow', 'animal'], ['pig', 'animal'],
  ['duck', 'animal'], ['fish', 'animal'], ['bee', 'animal'], ['frog', 'animal'],
  ['apple', 'food'], ['banana', 'food'], ['bread', 'food'], ['cheese', 'food'],
  ['car', 'thing'], ['bus', 'thing'], ['boat', 'thing'], ['ball', 'thing'],
  ['sun', 'world'], ['moon', 'world'], ['star', 'world'], ['tree', 'world'],
  ['hat', 'thing'], ['shoe', 'thing'], ['cup', 'thing'], ['book', 'thing']
];

function pictureItems() {
  const items = [];
  PICTURES.forEach((p, i) => {
    const [word, group] = p;
    const others = PICTURES.filter(o => o[0] !== word && o[1] === group).slice(0, 2);
    const pool = others.length >= 2 ? others : PICTURES.filter(o => o[0] !== word).slice(0, 2);
    items.push({
      id: 'p' + i,
      type: 'tap-image',
      skill: 'lit.vocab.everyday',
      difficulty: 1,
      band: 'PN',
      prompt: { text: 'Where is the ' + word + '?', tts: 'Where is the ' + word + '?' },
      options: [{ art: word, alt: word, correct: true }].concat(
        pool.map(o => ({ art: o[0], alt: o[0], misconception: 'same-kind-of-thing' }))),
      shuffle: true,
      remediation: {
        ladder: [
          { kind: 'nudge', text: 'Listen again. ' + word + '.', tts: word },
          { kind: 'reveal', text: 'This one is the ' + word + '.', art: word, tts: 'This one is the ' + word }
        ],
        generate: { type: 'tap-image', prompt: { text: 'Now find the ' + word, tts: 'Now find the ' + word },
          options: [{ art: word, alt: word, correct: true }].concat(pool.map(o => ({ art: o[0], alt: o[0] }))) }
      }
    });
  });
  return items;
}

write({
  schema: 'quizquest.module/1',
  id: 'core.firstwords', version: 1,
  title: 'First words',
  subtitle: 'Tap the picture. No reading needed.',
  author: { name: 'Quiz Quest', kind: 'human' }, license: 'MIT', verified: true,
  // Naming everyday objects is a toddler/pre-K vocabulary skill. It is done
  // before school, so it is not a default for a school-age child.
  bands: ['PN', 'N', 'R'], locale: 'en-GB',
  skills: ['lit.vocab.everyday'],
  estimatedMinutes: 5,
  remediationDefaults: { 'lit.vocab.everyday': { ladder: [
    { kind: 'nudge', text: 'Listen to the word again.' },
    { kind: 'rule', text: 'Say the word out loud, then look at each picture.' }
  ] } },
  items: pictureItems()
});

/* ── 2. Counting (pre-nursery upward) ────────────────────────────────── */
// Neutral tokens on purpose: at counting age the shape should not compete
// with the number, and a row of identical marks is what teaches one-to-one
// correspondence.
const COUNT_ART = ['dot', 'square', 'triangle', 'diamond', 'heart', 'flower', 'star', 'apple'];
write({
  schema: 'quizquest.module/1',
  id: 'core.counting', version: 1,
  title: 'Counting',
  subtitle: 'Tap each one as you count.',
  author: { name: 'Quiz Quest', kind: 'human' }, license: 'MIT', verified: true,
  // CCSS K.CC: counting to 10 and comparing quantities is pre-K into the
  // first term of Kindergarten. By the end of K the expectation is counting
  // to 100 and adding within 5, which lives in core.math.k.
  bands: ['PN', 'N', 'R'], locale: 'en-GB',
  skills: ['num.count.to5', 'num.count.to10', 'num.compare.more'],
  estimatedMinutes: 5,
  remediationDefaults: {
    'num.count.to5': { ladder: [
      { kind: 'nudge', text: 'Touch each one and count out loud.' },
      { kind: 'rule', text: 'Count one number for each thing. The last number you say is how many.' }] },
    'num.count.to10': { ladder: [
      { kind: 'nudge', text: 'Touch each one and count out loud.' },
      { kind: 'rule', text: 'Count one number for each thing. The last number you say is how many.' }] }
  },
  items: [].concat(
    // Tap-to-count teaches one-to-one correspondence, which "pick the numeral"
    // does not. The choice list is omitted on purpose for the smallest counts.
    [1, 2, 3, 4, 5].map((n, i) => ({
      id: 'c' + n, type: 'count', skill: 'num.count.to5', difficulty: 1, band: 'PN',
      prompt: { text: 'How many?', tts: 'How many?' }, n, art: COUNT_ART[i]
    })),
    [6, 7, 8, 9, 10].map((n, i) => ({
      id: 'c' + n, type: 'count', skill: 'num.count.to10', difficulty: 2, band: 'N',
      prompt: { text: 'How many?', tts: 'How many?' }, n, art: COUNT_ART[i + 2],
      choices: [n, n - 1, n + 1]
    })),
    [[3, 5], [2, 6], [4, 7], [8, 5]].map((pair, i) => ({
      id: 'm' + i, type: 'mcq', skill: 'num.compare.more', difficulty: 2, band: 'N',
      prompt: { text: 'Which is more?', tts: 'Which is more?' },
      options: [{ v: String(Math.max(...pair)), correct: true },
                { v: String(Math.min(...pair)), misconception: 'less-is-more' }],
      shuffle: true
    }))
  )
});

/* ── 3. Letters (reception upward) ───────────────────────────────────── */
// Every letter is its OWN skill id. B and D are exactly the pair a child
// confuses, so they must sit on independent review clocks and the picker must
// be able to keep them apart. Lumping them as "lit.alpha" would defeat both.
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const LETTER_WORD = { a: 'apple', b: 'ball', c: 'cat', d: 'dog', e: 'egg', f: 'fish',
  g: 'goat', h: 'hat', i: 'ice', j: 'jam', k: 'kite', l: 'leaf', m: 'moon',
  n: 'nest', o: 'orange', p: 'pig', q: 'queen', r: 'rain', s: 'sun', t: 'tree',
  u: 'umbrella', v: 'van', w: 'water', x: 'box', y: 'yo-yo', z: 'zebra' };
const CONFUSABLE = { b: 'd', d: 'b', p: 'q', q: 'p', m: 'n', n: 'm', u: 'v', v: 'u' };

write({
  schema: 'quizquest.module/1',
  id: 'core.letters', version: 1,
  title: 'Letters and sounds',
  subtitle: 'Find the letter, then trace it.',
  author: { name: 'Quiz Quest', kind: 'human' }, license: 'MIT', verified: true,
  // CCSS RF.K.1d and RF.K.3a: letter names and one-to-one letter-sound
  // correspondence are KINDERGARTEN expectations. By Grade 1 the standard has
  // moved on to digraphs, silent-e and decoding two-syllable words
  // (RF.1.3), so offering letter sounds as a Grade 1 default is a year behind.
  bands: ['N', 'R', 'K'], locale: 'en-GB',
  skills: LETTERS.map(l => 'lit.alpha.sound.' + l),
  estimatedMinutes: 8,
  items: [].concat(
    LETTERS.map((l, i) => {
      // The best distractor for a letter is the letter a child actually
      // mistakes it for, not a random one.
      const near = CONFUSABLE[l] || LETTERS[(i + 5) % 26];
      const far = LETTERS[(i + 13) % 26];
      return {
        id: 'l_' + l, type: 'listen', skill: 'lit.alpha.sound.' + l, difficulty: 2, band: 'R',
        prompt: { text: 'Find the letter that says ' + l, tts: l },
        options: [{ v: l.toUpperCase(), correct: true },
                  { v: near.toUpperCase(), misconception: 'letter-confusion' },
                  { v: far.toUpperCase(), misconception: 'letter-confusion' }],
        shuffle: true,
        variants: ['t_' + l],
        remediation: {
          ladder: [
            { kind: 'nudge', text: 'Listen again: ' + l + '.', tts: l },
            { kind: 'example', text: l.toUpperCase() + ' is for ' + LETTER_WORD[l] + '.', tts: l + ' is for ' + LETTER_WORD[l] },
            { kind: 'reveal', text: 'This is ' + l.toUpperCase() + '.', tts: l }
          ],
          generate: { type: 'trace', prompt: { text: 'Trace the ' + l.toUpperCase(), tts: 'Trace the ' + l }, glyph: l.toUpperCase() },
          proveIt: { ref: 't_' + l }
        }
      };
    }),
    LETTERS.map(l => ({
      id: 't_' + l, type: 'trace', skill: 'lit.alpha.sound.' + l, difficulty: 2, band: 'PN', hidden: true,
      prompt: { text: 'Trace the ' + l.toUpperCase(), tts: 'Trace the letter ' + l }, glyph: l.toUpperCase()
    }))
  )
});

/* ── 4. Number facts, as templates (infinite, seeded) ────────────────── */
const mathModule = (id, title, bands, skills) => ({
  schema: 'quizquest.module/1', id, version: 1, title,
  subtitle: 'Never runs out — every game is new.',
  author: { name: 'Quiz Quest', kind: 'human' }, license: 'MIT', verified: true,
  bands: bands, locale: 'en-GB', skills: skills.map(s => s.skill),
  estimatedMinutes: 8,
  items: skills.map((s, i) => ({
    id: 'g' + i, type: 'template', skill: s.skill, difficulty: s.difficulty, band: s.band || bands[0],
    gen: s.gen, params: s.params,
    remediation: { ladder: s.ladder, generate: { type: 'assemble', digitTiles: true } }
  }))
});

const makeTen = [
  { kind: 'nudge', text: 'Can you make ten first?' },
  { kind: 'example', text: '8 + 5 → 8 + 2 makes 10, then 3 more is 13.' },
  { kind: 'rule', text: 'Break the smaller number so one part fills up to ten. Ten is easy to add to.' }
];
const countBack = [
  { kind: 'nudge', text: 'Start at the big number and count back.' },
  { kind: 'example', text: '13 − 5 → 13, 12, 11, 10, 9, 8.' },
  { kind: 'rule', text: 'Taking away means counting backwards. Start big.' }
];
const skipCount = [
  { kind: 'nudge', text: 'Try skip counting.' },
  { kind: 'example', text: '4 × 3 → 4, 8, 12. Three fours.' },
  { kind: 'rule', text: 'Times means groups. 4 × 3 is three groups of four.' }
];
const missingPart = [
  { kind: 'nudge', text: 'What would you add to get there?' },
  { kind: 'example', text: '7 + ? = 12 -> count on from 7: 8, 9, 10, 11, 12. That is 5.' },
  { kind: 'rule', text: 'A missing add is a take away: the whole minus the part you already have.' }
];
const shareOut = [
  { kind: 'nudge', text: 'How many groups can you share it into?' },
  { kind: 'example', text: '12 ÷ 3 → share 12 into groups of 3: that is 4 groups.' },
  { kind: 'rule', text: 'Dividing is sharing equally. Ask: how many groups of this size fit?' }
];

// Grade-aligned maths. One module per band group, because a module that
// spans K to Grade 6 can only ever be an approximate fit for all of them, and
// the default selection is supposed to be what was written for THIS child.
//
// CCSS anchors:
//   K   K.OA.5   fluently add and subtract within 5
//   G1  1.OA.6   add and subtract within 20; 1.NBT place value to 120
//   G2  2.OA.2 / 2.NBT  within 100, then within 1000
//   G3  3.OA.7  multiply and divide within 100; 3.NF fractions introduced
//   G4  4.NBT   multi-digit multiplication, division with remainders
write(mathModule('core.math.k', 'First numbers', ['R', 'K'], [
  { skill: 'num.add.within10', difficulty: 3, gen: 'add', params: { a: [1, 5], b: [1, 5], constraint: 'within-10', choices: 3 }, ladder: makeTen },
  { skill: 'num.sub.within10', difficulty: 3, gen: 'sub', params: { a: [2, 10], b: [1, 5], constraint: 'no-borrow', choices: 3 }, ladder: countBack },
  { skill: 'num.compare.numbers', difficulty: 2, gen: 'compare', params: { a: [0, 10] }, ladder: [{ kind: 'rule', text: 'The number further along when you count is the bigger one.' }] },
  { skill: 'num.alg.sequence', difficulty: 3, gen: 'sequence', params: { a: [1, 10], step: 1 }, ladder: [{ kind: 'rule', text: 'Find how much it jumps each time, then jump once more.' }] }
]));

write(mathModule('core.math.g1', 'Adding and taking away', ['G1'], [
  { skill: 'num.add.within20', difficulty: 4, gen: 'add', params: { a: [2, 9], b: [2, 9], constraint: 'within-20', choices: 4 }, ladder: makeTen },
  { skill: 'num.add.within20.regroup', difficulty: 5, gen: 'add', params: { a: [4, 9], b: [4, 9], constraint: 'carry', choices: 4 }, ladder: makeTen },
  { skill: 'num.sub.within20', difficulty: 4, gen: 'sub', params: { a: [5, 20], b: [1, 9], constraint: 'no-borrow', choices: 4 }, ladder: countBack },
  { skill: 'num.sub.within20.borrow', difficulty: 5, gen: 'sub', params: { a: [11, 20], b: [3, 9], constraint: 'borrow', choices: 4 }, ladder: countBack },
  { skill: 'num.alg.missing', difficulty: 5, gen: 'missing-number', params: { a: [1, 9], b: [1, 9], choices: 4 }, ladder: missingPart },
  { skill: 'num.alg.sequence', difficulty: 4, gen: 'sequence', params: { a: [2, 30] }, ladder: [{ kind: 'rule', text: 'Find the jump between two numbers, then jump once more.' }] }
]));

write(mathModule('core.math.g2', 'Bigger numbers', ['G2'], [
  { skill: 'num.add.within100', difficulty: 6, gen: 'add', params: { a: [11, 89], b: [11, 89], constraint: 'within-100', choices: 4 }, ladder: makeTen },
  { skill: 'num.sub.within100', difficulty: 6, gen: 'sub', params: { a: [20, 99], b: [11, 49], choices: 4 }, ladder: countBack },
  { skill: 'num.mul.facts.small', difficulty: 5, gen: 'mul', params: { a: [2, 5], b: [2, 5], choices: 4 }, ladder: skipCount },
  { skill: 'num.alg.missing', difficulty: 6, gen: 'missing-number', params: { a: [10, 40], b: [5, 40], choices: 4 }, ladder: missingPart },
  { skill: 'num.alg.sequence', difficulty: 5, gen: 'sequence', params: { a: [5, 90] }, ladder: [{ kind: 'rule', text: 'Find the jump between two numbers, then jump once more.' }] }
]));

write(mathModule('core.math.g3', 'Times and share', ['G3'], [
  { skill: 'num.mul.facts', difficulty: 6, gen: 'mul', params: { a: [2, 9], b: [2, 9], choices: 4 }, ladder: skipCount },
  { skill: 'num.div.facts', difficulty: 7, gen: 'div', params: { a: [2, 9], b: [2, 9], choices: 4 }, ladder: shareOut },
  { skill: 'num.add.within1000', difficulty: 7, gen: 'add', params: { a: [101, 899], b: [101, 899], choices: 4 }, ladder: makeTen },
  { skill: 'num.sub.within1000', difficulty: 7, gen: 'sub', params: { a: [200, 999], b: [101, 499], choices: 4 }, ladder: countBack }
]));

write(mathModule('core.math.g45', 'Number work', ['G4', 'G5', 'G6'], [
  { skill: 'num.mul.multidigit', difficulty: 8, gen: 'mul', params: { a: [11, 25], b: [3, 9], choices: 4 }, ladder: skipCount },
  { skill: 'num.div.multidigit', difficulty: 8, gen: 'div', params: { a: [3, 12], b: [4, 12], choices: 4 }, ladder: shareOut },
  { skill: 'num.add.large', difficulty: 8, gen: 'add', params: { a: [101, 899], b: [101, 899], choices: 4 }, ladder: makeTen },
  { skill: 'num.alg.sequence', difficulty: 8, gen: 'sequence', params: { a: [10, 400] }, ladder: [{ kind: 'rule', text: 'Find the jump between two numbers, then jump once more.' }] }
]));
