import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(`data:text/javascript,${encodeURIComponent("export async function load(url, context, next) { return url.endsWith('.css') ? {format:'module',source:'',shortCircuit:true} : next(url,context); }")}`, import.meta.url);
const { createLanternWalkClient } = await import('../src/lantern-walk.js');

// The production client must replay the authoritative lighting snapshot when
// streaming replaces a scene, even if no player has changed a lantern meanwhile.
test('a reloaded Commons scene receives the unchanged authoritative lantern state', () => {
  const element = () => ({ hidden: true, isConnected: true, textContent: '', append() {}, querySelector: () => ({ textContent: '' }) });
  const previousDocument = globalThis.document;
  globalThis.document = { querySelector: () => element(), createElement: element };
  const calls = [];
  const scene = id => ({ userData: { setLanterns(lit, complete) { calls.push({ id, lit: [...lit], complete }); } } });
  let current = scene('first');
  const snapshot = { lanterns: [{ id: 'tower', lit: true }, { id: 'court', lit: false }], round: null, best: null };
  const client = createLanternWalkClient({
    getLayout: () => ({ edge: 0, destination: { lanterns: [] } }), getPose: () => null,
    getSnapshot: () => snapshot, getScene: () => current, send: async () => ({ ok: true }),
  });
  try {
    client.update();
    assert.deepEqual(calls, [{ id: 'first', lit: ['tower'], complete: false }]);
    current = null; client.update();
    current = scene('reloaded'); client.update();
    assert.deepEqual(calls.at(-1), { id: 'reloaded', lit: ['tower'], complete: false }, 'new scene must receive the server state after eviction');
    client.update();
    assert.equal(calls.length, 2, 'unchanged state on the same scene must not repeat work every frame');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
