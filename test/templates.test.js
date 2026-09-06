import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, GENERATORS, isGenerator } from '../js/content/templates.js';
import { makeRng } from '../js/content/rng.js';

const t = (gen, params, seed = 3) => generate({ id: 't', gen, params, skill: 'num.add.within20', difficulty: 4, band: 'G1' }, makeRng(seed));

test('the same seed generates the same problem on every device', () => {
  assert.deepEqual(t('add', { a: [1, 9], b: [1, 9] }), t('add', { a: [1, 9], b: [1, 9] }));
});

test('every generator produces exactly one correct option and no duplicates', () => {
  for (const gen of GENERATORS) {
    for (let seed = 1; seed < 30; seed++) {
      const body = generate({ id: 't', gen, params: { words: ['cat', 'dog'], choices: 4 }, skill: 'num.add', difficulty: 3, band: 'G1' }, makeRng(seed));
      assert.ok(body, gen + ' returned null');
      if (body.options) {
        assert.equal(body.options.filter(o => o.correct).length, 1, gen + ' seed ' + seed);
        const vs = body.options.map(o => o.v);
        assert.equal(new Set(vs).size, vs.length, gen + ' has duplicate options at seed ' + seed);
      }
    }
  }
});

test('the carry constraint is honoured and subtraction never goes negative', () => {
  for (let seed = 1; seed < 40; seed++) {
    const b = t('add', { a: [4, 9], b: [4, 9], constraint: 'carry' }, seed);
    const [x, y] = b.prompt.text.match(/\d+/g).map(Number);
    assert.ok((x % 10) + (y % 10) >= 10, b.prompt.text);
    const s = t('sub', { a: [1, 20], b: [1, 9] }, seed);
    const [p, q] = s.prompt.text.match(/\d+/g).map(Number);
    assert.ok(p >= q, s.prompt.text);
  }
});

test('division is always exact', () => {
  for (let seed = 1; seed < 40; seed++) {
    const b = t('div', {}, seed);
    const [x, d] = b.prompt.text.match(/\d+/g).map(Number);
    assert.equal(x % d, 0);
  }
});

test('spell-from-list builds an assemble item whose answer is constructible from its tiles', () => {
  const b = t('spell-from-list', { words: ['cake'] });
  assert.equal(b.type, 'assemble');
  const tiles = b.tiles.slice();
  for (const ch of b.answer) { const i = tiles.indexOf(ch); assert.ok(i !== -1); tiles.splice(i, 1); }
});

test('unknown generators are rejected', () => {
  assert.ok(!isGenerator('eval'));
  assert.equal(generate({ id: 't', gen: 'eval', skill: 'num.add', difficulty: 1, band: 'K' }, makeRng(1)), null);
});
