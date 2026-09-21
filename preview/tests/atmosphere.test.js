import test from 'node:test';
import assert from 'node:assert/strict';
import { atmosphereFor } from '../src/atmosphere.js';

test('dusk dims the sun, sky and environment together and warms the light', () => {
  const noon = atmosphereFor(13, 'clear'), dusk = atmosphereFor(18.75, 'clear'), dawn = atmosphereFor(7.25, 'clear');
  assert.ok(dusk.sunIntensity < noon.sunIntensity * 0.75);
  assert.ok(dusk.environmentIntensity < noon.environmentIntensity && dusk.backgroundIntensity < noon.backgroundIntensity);
  assert.ok(dusk.fogDensity > noon.fogDensity && dusk.exposure < noon.exposure);
  assert.ok(dusk.sunColor.r > dusk.sunColor.b + 0.2, 'low sun is warm');
  assert.ok(Math.abs(noon.sunColor.r - noon.sunColor.b) < 0.1, 'midday sun stays near white');
  assert.ok(dawn.sunIntensity < noon.sunIntensity && dawn.environmentIntensity < noon.environmentIntensity);
});

test('the hour range keeps every quantity finite, positive and continuous', () => {
  let previous = null;
  for (let hour = 7; hour <= 19; hour += 0.25) for (const weather of ['clear', 'overcast', 'haze']) {
    const atmosphere = atmosphereFor(hour, weather);
    for (const key of ['sunIntensity', 'ambientIntensity', 'environmentIntensity', 'backgroundIntensity', 'fogDensity', 'exposure']) assert.ok(atmosphere[key] > 0 && Number.isFinite(atmosphere[key]), `${key} at ${hour} ${weather}`);
    if (previous && weather === 'clear') assert.ok(Math.abs(atmosphere.sunIntensity - previous.sunIntensity) < 0.6, `sun steps smoothly at ${hour}`);
    if (weather === 'clear') previous = atmosphere;
  }
  assert.ok(atmosphereFor(13, 'overcast').sunIntensity < atmosphereFor(13, 'clear').sunIntensity / 3);
  assert.ok(atmosphereFor(13, 'haze').fogDensity > atmosphereFor(13, 'clear').fogDensity * 2);
});
