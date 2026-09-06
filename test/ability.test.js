import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expected, observe, thetaFor, priorFor, isStruggling } from '../js/learn/ability.js';

test('expected success is 50% at equal difficulty and ~91% two points below', () => {
  assert.ok(Math.abs(expected(5, 5) - 0.5) < 1e-9);
  assert.ok(Math.abs(expected(5, 3) - 0.909) < 0.01);
});

test('theta converges upward for a learner who keeps succeeding', () => {
  const skills = {};
  for (let i = 0; i < 20; i++) observe(skills, 'num.add.within10', 4, 'first', 'G1');
  assert.ok(skills['num.add.within10'].th > 5.0, 'theta was ' + skills['num.add.within10'].th);
});

test('a new skill inherits a prior from its parent rather than cold-starting', () => {
  const skills = {};
  for (let i = 0; i < 20; i++) observe(skills, 'lit.spell.wk1', 6, 'first', 'G3');
  const parentTheta = skills['lit.spell'].th;
  const prior = priorFor(skills, 'lit.spell.wk12', 'G3');
  assert.ok(prior > 3.0 && prior <= parentTheta, 'prior ' + prior + ' vs parent ' + parentTheta);
});

test('a custom skill inherits through its declared parent', () => {
  const skills = {};
  const parents = { 'x.spelling': 'lit.spell' };
  for (let i = 0; i < 20; i++) observe(skills, 'lit.spell.wk1', 6, 'first', 'G3');
  const cold = priorFor({}, 'x.spelling.wk12.because', 'G3', parents);
  const warm = priorFor(skills, 'x.spelling.wk12.because', 'G3', parents);
  assert.ok(warm > cold);
});

test('band clamping never lets a Reception profile exceed difficulty 5', () => {
  const skills = {};
  for (let i = 0; i < 60; i++) observe(skills, 'num.count.to10', 5, 'first', 'R');
  assert.ok(skills['num.count.to10'].th <= 5);
});

test('correct after remediation moves theta less than first-try correct', () => {
  const a = {}, b = {};
  observe(a, 'num.add.within10', 5, 'first', 'G1');
  observe(b, 'num.add.within10', 5, 'remediated', 'G1');
  assert.ok(a['num.add.within10'].th > b['num.add.within10'].th);
});

test('a skill is struggling only after enough failures to mean it', () => {
  const skills = {};
  for (let i = 0; i < 3; i++) observe(skills, 'num.mul.facts.7', 6, 'wrong', 'G3');
  assert.ok(!isStruggling(skills, 'num.mul.facts.7'));
  for (let i = 0; i < 6; i++) observe(skills, 'num.mul.facts.7', 6, 'wrong', 'G3');
  assert.ok(isStruggling(skills, 'num.mul.facts.7'));
});

test('thetaFor falls back to the band start with no history', () => {
  assert.equal(thetaFor({}, 'sci.life.plant', 'K'), 3.5);
});
