import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaPermissionAllowed } from '../runtime.js';

const game = 'https://typesafe.place';

test('only audio media from the game origin in the main frame is allowed', () => {
  assert.equal(mediaPermissionAllowed({ permission: 'media', origin: game, mediaTypes: ['audio'] }, game), true);
  assert.equal(mediaPermissionAllowed({ permission: 'media', origin: 'http://127.0.0.1:5174', mediaTypes: ['audio'] }, 'http://127.0.0.1:5174'), true, 'the loopback development origin works the same way');
  assert.equal(mediaPermissionAllowed({ permission: 'media', origin: game, mediaTypes: ['audio'], mainFrame: true }, game), true);
});

test('video, audio with video, other origins, frames and every other permission are refused', () => {
  for (const request of [
    { permission: 'media', origin: game, mediaTypes: ['video'] },
    { permission: 'media', origin: game, mediaTypes: ['audio', 'video'] },
    { permission: 'media', origin: game, mediaTypes: [] },
    { permission: 'media', origin: game, mediaTypes: undefined },
    { permission: 'media', origin: 'https://evil.test', mediaTypes: ['audio'] },
    { permission: 'media', origin: 'https://typesafe.place.evil.test', mediaTypes: ['audio'] },
    { permission: 'media', origin: 'http://typesafe.place', mediaTypes: ['audio'] },
    { permission: 'media', origin: null, mediaTypes: ['audio'] },
    { permission: 'media', origin: game, mediaTypes: ['audio'], mainFrame: false },
    { permission: 'geolocation', origin: game, mediaTypes: ['audio'] },
    { permission: 'notifications', origin: game },
    { permission: 'display-capture', origin: game, mediaTypes: ['audio'] },
    { permission: 'clipboard-read', origin: game },
  ]) assert.equal(mediaPermissionAllowed(request, game), false, JSON.stringify(request));
  assert.equal(mediaPermissionAllowed(undefined, game), false);
  assert.equal(mediaPermissionAllowed({ permission: 'media', origin: game, mediaTypes: ['audio'] }, undefined), false, 'no game origin, no grant');
});
