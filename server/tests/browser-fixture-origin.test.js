import test from 'node:test';
import assert from 'node:assert/strict';
import { browserFixtureOrigin } from './browser-fixture-origin.js';

test('fixture origin preserves existing HTTP default and accepts only explicit HTTPS loopback override', () => {
  assert.equal(browserFixtureOrigin({ host: '127.0.0.1', port: 5180 }), 'http://127.0.0.1:5180');
  assert.equal(browserFixtureOrigin({ host: '192.168.1.3', port: 5180 }), 'http://192.168.1.3:5180');
  for (const value of ['https://127.0.0.1:52145', 'https://127.0.0.1:52145/']) assert.equal(browserFixtureOrigin({ host: '127.0.0.1', port: 5180, publicOrigin: value }), 'https://127.0.0.1:52145');
  for (const publicOrigin of ['', 'https://example.com:52145', 'https://localhost:52145', 'http://127.0.0.1:52145', 'https://127.0.0.1', 'https://127.0.0.1:0', 'https://127.0.0.1:65536', 'https://user@127.0.0.1:52145', 'https://127.0.0.1:52145/path', 'https://127.0.0.1:52145/?x=1', 'https://127.0.0.1:52145/#x', ' https://127.0.0.1:52145', 'https://127.1:52145', 1]) assert.throws(() => browserFixtureOrigin({ host: '127.0.0.1', port: 5180, publicOrigin }), /HTTPS loopback/);
  assert.throws(() => browserFixtureOrigin({ host: '192.168.1.3', port: 5180, publicOrigin: 'https://127.0.0.1:52145' }), /HTTPS loopback/);
});
