import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { describeScene, frameStats, redact, reportMarkdown, sanitizeUrl } from '../src/debug-report.js';

test('reports never carry addresses, account ids, sign-in tokens or invite codes', () => {
  const text = redact('Failed for jevica@example.com (user_01M40Y914S1H4EJCEHH91DKTAY) with Bearer abc.def-ghi and /auth/callback?code=Xy12&state=zzz invite=RIVER-7788 token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0abcdefghijk');
  for (const leak of ['jevica@example.com', 'user_01M40Y914S1H4EJCEHH91DKTAY', 'abc.def-ghi', 'Xy12', 'zzz', 'RIVER-7788', 'eyJhbGciOiJIUzI1NiJ9']) assert.ok(!text.includes(leak), `${leak} was redacted`);
  assert.match(text, /\[email\]/); assert.match(text, /\[account\]/); assert.match(text, /code=\[redacted\]/);
  // A git commit stays readable: it identifies the build, not a person.
  assert.equal(redact('commit 0ff37429a1b2c3d4e5f60718293a4b5c6d7e8f90'), 'commit 0ff37429a1b2c3d4e5f60718293a4b5c6d7e8f90');
  // Long text is cut at 500 characters (a long run of one character would read as a token).
  assert.match(redact('word '.repeat(140)), /… \(\+200 chars\)$/);
});

test('URLs keep their path and only the query values that are safe to share', () => {
  const base = 'https://typesafe.place/play?world=river-oaks';
  assert.equal(sanitizeUrl('/play?world=moon-garden&debug=1', base), '/play?world=moon-garden&debug=1');
  assert.equal(sanitizeUrl('/auth/callback?code=secret&state=abc', base), '/auth/callback?code=[redacted]&state=[redacted]');
  assert.equal(sanitizeUrl('https://cdn.example.com/a.js?v=2', base), 'https://cdn.example.com/a.js?v=[redacted]');
});

test('frame statistics summarise stutter, not just the average', () => {
  const frames = [...Array(97).fill(16.7), 40, 60, 120];
  const stats = frameStats(frames);
  assert.equal(stats.count, 100); assert.equal(stats.medianMs, 16.7); assert.equal(stats.maxMs, 120);
  assert.equal(stats.over33Ms, 3); assert.equal(stats.over50Ms, 2); assert.ok(stats.p99Ms >= 60);
  assert.ok(stats.fps > 50 && stats.fps < 60);
  assert.deepEqual(frameStats([]), { count: 0 });
});

test('the scene census counts meshes, instances, lights, materials and textures', () => {
  const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 12), new THREE.DirectionalLight(), new THREE.PointLight());
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); hidden.visible = false; scene.add(hidden);
  const census = describeScene(scene);
  assert.equal(census.meshes, 3); assert.equal(census.instancedMeshes, 1); assert.equal(census.instances, 12);
  assert.deepEqual(census.lights, { DirectionalLight: 1, PointLight: 1 }); assert.equal(census.materials, 2); assert.equal(census.textures, 1); assert.equal(census.hidden, 1);
});

test('the copied report leads with a readable summary and leaves the picture out', () => {
  const report = { id: 'r1', createdAt: '2026-10-09T15:00:00.000Z', description: 'Dior went black\nafter entering', app: { version: '0.1.6', commit: '0ff37429a1b2c3d4e5f6', host: 'typesafe.place', path: '/play' },
    environment: { browser: 'Chrome 126', platform: 'macOS', viewport: [1440, 900], devicePixelRatio: 2 }, renderer: { gpu: 'Apple M3 Max', webgl: 2 },
    performance: { frames: { count: 600, fps: 58.1, medianMs: 16.7, p99Ms: 41.2, over50Ms: 1 } }, game: { place: 'Dior', position: [-2780.1, 18.3, 1290.4] },
    errors: [{ type: 'error', message: 'TypeError: x is undefined', count: 3 }], console: [], network: [], screenshot: 'data:image/jpeg;base64,AAAA' };
  const text = reportMarkdown(report);
  assert.match(text, /^# TypeSafe Place problem report/);
  assert.match(text, /> Dior went black\n> after entering/);
  assert.match(text, /\| GPU \| Apple M3 Max \(WebGL 2\) \|/);
  assert.match(text, /58\.1 fps · median 16\.7 ms · p99 41\.2 ms/);
  assert.match(text, /`error` TypeError: x is undefined \(×3\)/);
  assert.ok(!text.includes('AAAA'), 'the picture travels only in the download or the sent report');
  assert.match(text, /```json\n\{/);
});
