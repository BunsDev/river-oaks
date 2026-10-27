import test from 'node:test';
import assert from 'node:assert/strict';
import { ISOLATION_HEADERS, isolatedFixturePlugin, isolatesFixture } from './isolated-fixture.js';

test('only fixture pages asking for isolation are isolated', () => {
  assert.equal(isolatesFixture('/e2e/fixtures/character-fidelity.html?isolate=1'), true);
  assert.equal(isolatesFixture('/e2e/fixtures/character-fidelity.html?x=2&isolate=1'), true);
  for (const url of ['/e2e/fixtures/character-fidelity.html', '/e2e/fixtures/character-fidelity.html?isolate=0', '/?isolate=1',
    '/src/main.js?isolate=1', '/e2e/fixtures/../index.html?isolate=1', '/e2e/fixtures/nested/page.html?isolate=1'])
    assert.equal(isolatesFixture(url), false, url);
});

test('the fixture middleware sets COOP and COEP before Vite serves the page', () => {
  let middleware;
  isolatedFixturePlugin().configureServer({middlewares: {use: handler => { middleware = handler; }}});
  const serve = url => {
    const headers = {}; let passed = false;
    middleware({url}, {setHeader: (name, value) => { headers[name] = value; }}, () => { passed = true; });
    return {headers, passed};
  };
  const isolated = serve('/e2e/fixtures/character-fidelity.html?isolate=1');
  assert.deepEqual(isolated, {headers: {...ISOLATION_HEADERS}, passed: true});
  assert.deepEqual(serve('/e2e/fixtures/character-fidelity.html'), {headers: {}, passed: true});
});
