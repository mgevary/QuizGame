import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSkillId, ancestors, lineage, familyKey, resolveParent, matchesGlob } from '../js/content/skills.js';

test('well-formed ids validate and malformed ones say why', () => {
  assert.equal(validateSkillId('num.add.within10'), null);
  assert.equal(validateSkillId('lit.alpha.sound.upper.b'), null);
  assert.equal(validateSkillId('x.spelling.wk12.because'), null);
  assert.match(validateSkillId('Num.add'), /bad segment/);
  assert.match(validateSkillId('num.subtraction'), /unknown topic/);
  assert.match(validateSkillId('zzz.add'), /unknown strand/);
  assert.match(validateSkillId('num'), /at least/);
});

test('ancestors are nearest first and exclude the id itself', () => {
  assert.deepEqual(ancestors('num.add.within10'), ['num.add', 'num']);
  assert.deepEqual(lineage('num.add.within10'), ['num.add.within10', 'num.add', 'num']);
});

test('siblings share a family key; cousins do not', () => {
  assert.equal(familyKey('num.add.within10'), familyKey('num.add.within20'));
  assert.notEqual(familyKey('num.add.within10'), familyKey('num.sub.within10'));
});

test('a custom skill resolves its parent by longest matching prefix', () => {
  const parents = { 'x.spelling': 'lit.spell', 'x.spelling.hard': 'lit.phonics' };
  assert.equal(resolveParent('x.spelling.wk12.because', parents), 'lit.spell');
  assert.equal(resolveParent('x.spelling.hard.thing', parents), 'lit.phonics');
  assert.equal(resolveParent('num.add', parents), null);
});

test('mission globs match a subtree', () => {
  assert.ok(matchesGlob('lit.phonics.*', 'lit.phonics.silent-e'));
  assert.ok(matchesGlob('lit.phonics.*', 'lit.phonics'));
  assert.ok(!matchesGlob('lit.phonics.*', 'lit.phon.rhyme'));
});
