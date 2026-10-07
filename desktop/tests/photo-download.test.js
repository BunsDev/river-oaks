import test from 'node:test';
import assert from 'node:assert/strict';
import { photoDownloadAllowed } from '../photo-download.js';

const origin = 'https://typesafe.place';
const photo = { url: `blob:${origin}/47bac92d-a14a-4048-aeea-ec67e2e1ad29`, initiator: origin,
  filename: 'river-oaks-2026-10-07T01-13-00-000Z.png', mime: 'image/png', bytes: 32000, userGesture: true };
test('only user-triggered photo PNGs from the exact game origin are downloadable', () => {
  assert.equal(photoDownloadAllowed(photo, origin), true);
  for (const change of [
    { url: `${origin}/payload.png` }, { url: 'blob:https://evil.test/a' },
    { initiator: 'https://evil.test' }, { initiator: 'null' }, { initiator: '' },
    { filename: '../photo.png' }, { filename: 'river-oaks.exe' }, { mime: 'text/html' },
    { bytes: 0 }, { bytes: -1 }, { bytes: 21 * 1024 * 1024 }, { bytes: NaN }, { userGesture: false },
  ]) assert.equal(photoDownloadAllowed({ ...photo, ...change }, origin), false, JSON.stringify(change));
  const local = 'http://127.0.0.1:5174';
  assert.equal(photoDownloadAllowed({ ...photo, url: `blob:${local}/123`, initiator: local }, local), true);
  assert.equal(photoDownloadAllowed({ ...photo, url: `blob:${local}/123`, initiator: local }, 'http://127.0.0.1:5175'), false);
});
