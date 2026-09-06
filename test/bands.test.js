import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandForAge, bandAllowsType, clampTheta, wordCount, bandAtLeast } from '../js/content/bands.js';

test('ages map to bands, preferring the older band on a boundary', () => {
  assert.equal(bandForAge(2), 'PN');
  assert.equal(bandForAge(3), 'N');
  assert.equal(bandForAge(5), 'K');
  assert.equal(bandForAge(7), 'G2');
  assert.equal(bandForAge(12), 'G6');
  assert.equal(bandForAge(40), 'A');
});

test('a pre-nursery child is never offered typed or tile answers', () => {
  assert.ok(bandAllowsType('PN', 'tap-image'));
  assert.ok(!bandAllowsType('PN', 'assemble'));
  assert.ok(!bandAllowsType('PN', 'mcq'));
  assert.ok(bandAllowsType('G4', 'anything-at-all'));
});

test('theta is clamped to the band range so a Reception profile cannot exceed difficulty 5', () => {
  assert.equal(clampTheta('R', 9), 5);
  assert.equal(clampTheta('R', 0), 1);
});

test('word counting handles empty and whitespace', () => {
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('  which  one  '), 2);
});

test('band ordering', () => {
  assert.ok(bandAtLeast('G2', 'R'));
  assert.ok(!bandAtLeast('PN', 'N'));
});
