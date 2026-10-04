import test from 'node:test';
import assert from 'node:assert/strict';
import { roomPrefixFor, accountPrefixFor, populationKeyFor } from '../world-keys.js';

test('default world keeps its existing Redis keys while other worlds have isolated rooms and landmarks', () => {
  const namespace = 'river-oaks:production:v1';
  assert.equal(roomPrefixFor(namespace, 'river-oaks'), `{${namespace}}`);
  assert.equal(roomPrefixFor(namespace, 'garden-2'), `{${namespace}:world:garden-2}`);
  assert.equal(populationKeyFor(namespace, 'river-oaks'), `{${namespace}}:population`);
  assert.equal(populationKeyFor(namespace, 'garden-2'), `{${namespace}:world:garden-2}:population`);
  assert.equal(accountPrefixFor(namespace, 'river-oaks'), '{river-oaks:production:accounts:v1}');
  assert.equal(accountPrefixFor(namespace, 'garden-2'), '{river-oaks:production:accounts:v1:world:garden-2}');
  assert.notEqual(roomPrefixFor(namespace, 'river-oaks'), roomPrefixFor(namespace, 'garden-2'));
  assert.notEqual(accountPrefixFor(namespace, 'river-oaks'), accountPrefixFor(namespace, 'garden-2'));
  assert.throws(() => roomPrefixFor(namespace, '../garden'));
});
