// Hosted CI runs the IPIC screening journey on Mesa under Xvfb (Val, 2026-10-18), as the shared and
// security journeys do; locally it keeps headless SwiftShader. The switch is RIVER_OAKS_SCREENING_SOFTWARE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { screeningLaunchOptions } from '../e2e/ipic-screening-launch.js';

test('locally the screening browsers stay headless on SwiftShader', () => {
  const options = screeningLaunchOptions({}, 'darwin');
  assert.equal(options.headless, true);
  assert.deepEqual(options.args, ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']);
});

test('with RIVER_OAKS_SCREENING_SOFTWARE on Linux they run headed on Mesa (ANGLE over GL), for Xvfb', () => {
  const options = screeningLaunchOptions({ RIVER_OAKS_SCREENING_SOFTWARE: '1' }, 'linux');
  assert.equal(options.headless, false);
  assert.deepEqual(options.args, ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist']);
});

test('the Mesa path refuses to run anywhere but Linux', () => {
  assert.throws(() => screeningLaunchOptions({ RIVER_OAKS_SCREENING_SOFTWARE: '1' }, 'darwin'), /Linux/);
});
