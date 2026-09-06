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
  for (const b of ['G2', 'G3', 'G4', 'G5', 'G6']) {
    assert.equal(moduleFit(byId['core.math.school'], b), 'exact', 'maths should be exact at ' + b);
  }
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

test('an eight-year-old defaults to maths and grade-appropriate reading only', () => {
  const d = fits('G3', 'exact').sort();
  assert.ok(d.includes('core.math.school'));
  assert.ok(d.includes('core.reading.g3'));
  assert.ok(!d.includes('core.letters'));
});
