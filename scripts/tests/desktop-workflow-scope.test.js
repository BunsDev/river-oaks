// The Desktop workflow's scope step picks the platforms a pull request builds on.
// These tests run the step's own script from desktop.yml with a stand-in gh that
// answers the pull request files API from a fixture, so they need bash and jq,
// as the ubuntu-latest runner has.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = readFileSync(new URL('../../.github/workflows/desktop.yml', import.meta.url), 'utf8');
const every = '["windows-latest","ubuntu-latest","macos-latest"]', linux = '["ubuntu-latest"]';

// The `run: |` block of the step with `id: scope`, dedented.
function scopeScript() {
  const lines = workflow.split('\n');
  const step = lines.findIndex(line => line.trim() === '- id: scope');
  const run = lines.findIndex((line, index) => index > step && line.trim() === 'run: |');
  assert.ok(step >= 0 && run > step, 'desktop.yml has a scope step with a run block');
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && line.search(/\S/) <= lines[run].search(/\S/)) break;
    body.push(line);
  }
  const indent = Math.min(...body.filter(line => line.trim()).map(line => line.search(/\S/)));
  return body.map(line => line.slice(indent)).join('\n');
}

// Runs the step for one event and returns its outputs and the API paths gh was asked for.
function scope(t, { event = 'pull_request', files = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'river-desktop-scope-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'files.json'), JSON.stringify(files));
  writeFileSync(join(dir, 'bin', 'gh'), [
    '#!/bin/sh',
    '[ "$1" = api ] || exit 64',
    'echo "$2" >> "$GH_CALLS"',
    'while [ $# -gt 0 ]; do case $1 in --jq) filter=$2; shift 2;; *) shift;; esac; done',
    // Like gh --jq: strings raw, everything else compact JSON.
    'exec jq -rc "$filter" "$GH_FIXTURE"',
    ''
  ].join('\n'));
  chmodSync(join(dir, 'bin', 'gh'), 0o755);
  writeFileSync(join(dir, 'step.sh'), scopeScript());
  const output = join(dir, 'output'), calls = join(dir, 'calls');
  writeFileSync(output, '');
  // GitHub runs bash steps with -e and pipefail.
  execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', join(dir, 'step.sh')], {
    env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, EVENT: event, PR: '681', GITHUB_REPOSITORY: 'BunsDev/river-oaks', GITHUB_OUTPUT: output, GH_FIXTURE: join(dir, 'files.json'), GH_CALLS: calls },
    stdio: 'pipe'
  });
  return {
    ...Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').map(line => line.split(/=(.*)/s, 2))),
    calls: existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : []
  };
}

const patch = (...lines) => ['@@ -1,3 +1,3 @@', ...lines].join('\n');
// From Dependabot #681, which bumped Electron in package.json and the lockfile only.
const electronBump = [
  { filename: 'package.json', patch: patch('     "@electron/packager": "20.3.0",', '-    "electron": "44.9.1",', '+    "electron": "45.0.0",', '     "electron-winstaller": "5.4.4",') },
  { filename: 'pnpm-lock.yaml', patch: patch('       electron:', '-        specifier: 44.9.1', '+        specifier: 45.0.0', ' ', '-  electron@44.9.1:', '+  electron@45.0.0:') }
];

test('an Electron bump in package.json and the lockfile gets every platform and the installers', t => {
  const result = scope(t, { files: electronBump });
  assert.deepEqual(result, { platforms: every, installers: 'true', calls: ['repos/BunsDev/river-oaks/pulls/681/files'] });
});

test('a change to an @electron package, electron-winstaller or Electron\'s install gets every platform', t => {
  for (const [filename, line] of [
    ['pnpm-lock.yaml', "+  '@electron/get@5.2.0':"],
    ['pnpm-lock.yaml', "-      '@electron-internal/extract-zip': 1.0.5"],
    ['pnpm-lock.yaml', '+  electron-winstaller@5.4.5:'],
    ['package.json', '+    "@electron/fuses": "2.1.4",'],
    // Whether pnpm runs Electron's postinstall download.
    ['pnpm-workspace.yaml', '-  - electron']
  ]) assert.equal(scope(t, { files: [{ filename, patch: patch('   other@1.0.0:', line) }] }).platforms, every, `${filename}: ${line}`);
  assert.equal(scope(t, { files: [{ filename: 'pnpm-workspace.yaml', patch: patch('   - electron', '+  zod: 4.6.8') }] }).platforms, linux);
});

test('a dependency bump that leaves Electron alone gets the Linux leg without installers', t => {
  const files = [
    { filename: 'package.json', patch: patch('     "electron": "44.9.1",', '-    "vite": "8.3.5"', '+    "vite": "8.3.6"') },
    // electron-to-chromium is a browserslist dependency, not Electron.
    { filename: 'pnpm-lock.yaml', patch: patch('   electron@44.9.1:', '-  electron-to-chromium@1.5.200:', '+  electron-to-chromium@1.5.201:', '-  vite@8.3.5:', '+  vite@8.3.6:') }
  ];
  assert.deepEqual(scope(t, { files }), { platforms: linux, installers: 'false', calls: ['repos/BunsDev/river-oaks/pulls/681/files'] });
  assert.equal(scope(t, { files: [{ filename: 'shared/town-protocol.js', patch: patch('-electron', '+electron') }] }).platforms, linux, 'only package.json and the lockfile are read for Electron');
});

test('a package.json or lockfile diff too big for GitHub to show gets every platform', t => {
  assert.equal(scope(t, { files: [{ filename: 'package.json', patch: patch('-    "vite": "8.3.5"', '+    "vite": "8.3.6"') }, { filename: 'pnpm-lock.yaml' }] }).platforms, every);
  assert.equal(scope(t, { files: [{ filename: 'package.json' }] }).platforms, every);
});

test('changes to desktop/ or the workflow get every platform; main, tags and dispatches skip the API', t => {
  assert.equal(scope(t, { files: [{ filename: 'desktop/main.js', patch: patch('-a', '+b') }] }).platforms, every);
  assert.equal(scope(t, { files: [{ filename: '.github/workflows/desktop.yml', patch: patch('-a', '+b') }] }).platforms, every);
  assert.equal(scope(t, { files: [{ filename: '.github/workflows/desktop.yml.bak', patch: patch('-a', '+b') }] }).platforms, linux);
  for (const event of ['push', 'workflow_dispatch'])
    assert.deepEqual(scope(t, { event }), { platforms: every, installers: 'true', calls: [] });
});
