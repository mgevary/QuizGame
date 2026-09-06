import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, glyphStrokes, resample, distanceToStrokes } from '../js/items/trace-score.js';
import { BAND_INFO } from '../js/content/bands.js';

const band = (b) => ({ radius: BAND_INFO[b].traceTolerance, passCoverage: BAND_INFO[b].tracePass[0], passPrecision: BAND_INFO[b].tracePass[1] });
const A = glyphStrokes('A');

/** Trace the glyph with a given wobble, as a child's hand would. */
function traceWith(strokes, wobble, seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 48271) % 2147483647; return (s / 2147483647 - 0.5) * 2; };
  return strokes.map(st => resample(st, 30).map(p => [p[0] + rnd() * wobble, p[1] + rnd() * wobble]));
}

test('a clean trace passes at every band', () => {
  const drawn = traceWith(A, 1);
  for (const b of ['PN', 'N', 'R', 'K', 'G2']) {
    assert.ok(score(drawn, A, band(b)).pass, 'failed at ' + b);
  }
});

test('a scribble that covers the glyph fails on precision', () => {
  // A dense back-and-forth scribble filling the whole box: it touches every
  // part of the letter, so coverage is high, but most of its ink is nowhere
  // near the letter.
  const scribble = [[]];
  for (let i = 0; i <= 400; i++) scribble[0].push([(i * 7) % 100, (i * 23) % 100]);
  const r = score(scribble, A, band('G2'));
  assert.ok(r.coverage > 0.8, 'coverage was ' + r.coverage);
  assert.ok(r.precision < 0.6, 'precision was ' + r.precision);
  assert.ok(!r.pass);
});

test("a three-year-old's wobbly A passes at pre-nursery tolerance and fails at grade 2", () => {
  const wobbly = traceWith(A, 20, 7);   // ~20% of glyph height: a real 3-year-old
  assert.ok(score(wobbly, A, band('PN')).pass, 'should pass at PN');
  assert.ok(!score(wobbly, A, band('G2')).pass, 'should not pass at G2');
});

test('half a letter fails on coverage even if every stroke is accurate', () => {
  const half = [resample(A[0], 30)];
  const r = score(half, A, band('K'));
  assert.ok(r.precision > 0.8);
  assert.ok(r.coverage < 0.82);
  assert.ok(!r.pass);
});

test('stroke order is only judged when asked, and never blocks a pass', () => {
  const reversed = A.map(st => resample(st, 30).slice().reverse());
  const lenient = score(reversed, A, { ...band('PN') });
  const strict = score(reversed, A, { ...band('G2'), checkOrder: true });
  assert.ok(lenient.pass, 'a young child drawing it backwards still passes');
  assert.equal(strict.formation, false, 'but formation is reported for older children');
});

test('every letter and digit has a glyph', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    assert.ok(glyphStrokes(ch), 'missing ' + ch);
    assert.ok(glyphStrokes(ch).length >= 1);
  }
  assert.equal(glyphStrokes('%'), null);
});

test('an empty drawing scores zero rather than throwing', () => {
  assert.equal(score([], A, band('K')).score, 0);
});
