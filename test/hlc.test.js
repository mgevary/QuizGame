import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zero, tick, observe, compare, toKey, fromKey } from '../js/sync/hlc.js';

test('a clock never goes backwards, even when wall time does', () => {
  let c = tick(zero('a'), 1000, 'a');
  c = tick(c, 500, 'a');          // wall clock jumped back
  assert.equal(c[0], 1000);
  assert.equal(c[1], 1);
});

test('two events in the same millisecond on one device are ordered by counter', () => {
  const a = tick(zero('a'), 1000, 'a');
  const b = tick(a, 1000, 'a');
  assert.ok(compare(a, b) < 0);
});

test('two events from different devices never tie', () => {
  const a = tick(zero('a'), 1000, 'a');
  const b = tick(zero('b'), 1000, 'b');
  assert.notEqual(compare(a, b), 0);
  assert.equal(compare(a, b), -compare(b, a));
});

test('observing a remote clock makes the next local event sort after it', () => {
  const remote = tick(zero('b'), 9000, 'b');
  const local = observe(zero('a'), remote, 1000, 'a');   // our wall clock is way behind
  assert.ok(compare(local, remote) > 0);
});

test('keys round-trip', () => {
  const c = [1757088000123, 7, 'd3f2'];
  assert.deepEqual(fromKey(toKey(c)), c);
});
