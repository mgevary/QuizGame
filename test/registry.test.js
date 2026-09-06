import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { moduleFit } from '../js/content/registry.js';

const index = JSON.parse(fs.readFileSync(new URL('../content/index.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(index.modules.map(m => [m.id, m]));
const fits = (band, kind) => index.modules.filter(m => moduleFit(m, band) === kind).map(m => m.id);

test('a module written for a younger child is never offered to an older one', () => {
  assert.equal(moduleFit(byId['core.firstwords'], 'G3'), 'below');
  assert.equal(moduleFit(byId['core.counting'], 'G1'), 'below');
  assert.ok(!fits('G3', 'exact').includes('core.firstwords'));
  assert.ok(!fits('G3', 'stretch').includes('core.firstwords'));
});

test('a module written for an older child is offered as a stretch, not a default', () => {
  assert.equal(moduleFit(byId['core.reading.g3'], 'G1'), 'stretch');
  assert.ok(fits('G1', 'stretch').includes('core.reading.g3'));
  assert.ok(!fits('G1', 'exact').includes('core.reading.g3'));
});

test('a module claiming a range is exact for every band in it', () => {
  for (const b of ['G4', 'G5', 'G6']) {
    assert.equal(moduleFit(byId['core.math.g45'], b), 'exact', 'maths should be exact at ' + b);
  }
});

// CCSS RF.K.3a puts letter-sound correspondence in Kindergarten; RF.1.3 has
// Grade 1 on digraphs, silent-e and two-syllable words. Offering letter sounds
// as a Grade 1 default is a year behind, and this is the test that says so.
test('letter sounds are a Kindergarten default and not a Grade 1 one', () => {
  assert.equal(moduleFit(byId['core.letters'], 'K'), 'exact');
  assert.equal(moduleFit(byId['core.letters'], 'G1'), 'below');
  assert.ok(!fits('G1', 'exact').includes('core.letters'));
});

test('each school band defaults to maths written for that grade', () => {
  const mathFor = (b) => fits(b, 'exact').filter(id => id.startsWith('core.math.'));
  assert.deepEqual(mathFor('G1'), ['core.math.g1']);
  assert.deepEqual(mathFor('G2'), ['core.math.g2']);
  assert.deepEqual(mathFor('G3'), ['core.math.g3']);
});

test('every band has something to play by default', () => {
  for (const b of ['PN', 'N', 'R', 'K', 'G1', 'G2', 'G3', 'G4', 'G5']) {
    const d = fits(b, 'exact');
    assert.ok(d.length > 0, 'no default modules for band ' + b);
  }
});

test('a pre-nursery child defaults to pictures and counting, and never to reading', () => {
  const d = fits('PN', 'exact');
  assert.deepEqual(d.sort(), ['core.counting', 'core.firstwords']);
});

test('every band from pre-nursery to Grade 5 has maths or literacy by default', () => {
  for (const b of ['PN', 'N', 'R', 'K', 'G1', 'G2', 'G3', 'G4', 'G5']) {
    assert.ok(fits(b, 'exact').length > 0, 'nothing written for ' + b);
  }
});

test('an eight-year-old defaults to maths and grade-appropriate reading only', () => {
  const d = fits('G3', 'exact').sort();
  assert.ok(d.includes('core.math.g3'));
  assert.ok(d.includes('core.reading.g3'));
  assert.ok(!d.includes('core.letters'));
  assert.ok(!d.includes('core.firstwords'));
});
