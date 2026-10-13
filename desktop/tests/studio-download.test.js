import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDownloadAllowed } from '../studio-download.js';

const origin = 'https://typesafe.place';
const region = { url: `blob:${origin}/47bac92d-a14a-4048-aeea-ec67e2e1ad29`, initiator: origin,
  filename: 'world-studio-region.json', mime: 'application/json', bytes: 32000, userGesture: true };

test('allows only bounded user-triggered studio JSON blobs from the game origin', () => {
  assert.equal(studioDownloadAllowed(region, origin), true);
  assert.equal(studioDownloadAllowed({ ...region, bytes: 128 * 1024 }, origin), true);
  const local = 'http://127.0.0.1:5174';
  assert.equal(studioDownloadAllowed({ ...region, url: `blob:${local}/123`, initiator: local }, local), true);
});

test('rejects network, foreign-frame, malformed and non-studio downloads', () => {
  for (const change of [
    { url: `${origin}/world-studio-region.json` }, { url: 'blob:https://evil.test/a' },
    { url: 'invalid' }, { url: 'blob:null/a' },
    { initiator: 'https://evil.test' }, { initiator: 'null' }, { initiator: '' },
    { initiator: 'https://typesafe.place.evil.test' },
    { filename: '../world-studio-region.json' }, { filename: 'region.json' },
    { filename: 'world-studio-region.json.exe' }, { mime: 'text/html' }, { mime: 'text/json' },
    { bytes: 0 }, { bytes: -1 }, { bytes: 128 * 1024 + 1 }, { bytes: NaN },
    { bytes: Infinity }, { bytes: 1.5 }, { bytes: '100' }, { userGesture: false },
  ]) assert.equal(studioDownloadAllowed({ ...region, ...change }, origin), false, JSON.stringify(change));
  assert.equal(studioDownloadAllowed(region, 'https://typesafe.place:8443'), false);
});

test('furnished spaces use their exact JSON filename under the same download boundary',()=>{
  assert.equal(studioDownloadAllowed({...region,filename:'world-studio-space.json'},origin),true);
  for(const filename of ['../world-studio-space.json','world-studio-space.json.exe','space.json'])assert.equal(studioDownloadAllowed({...region,filename},origin),false);
});
