#!/usr/bin/env node
// Actual graceful-interruption regression. Signal only this script's own child
// once that child reports creating its own simulator; retain its partial report.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const log = join(root, '.runtime', `context-cancellation-${Date.now()}.log`);
const child = spawn(process.execPath, ['experiments/ios-bundled-origin/context-parity.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let text = '', evidence, simulator, sent = false;
child.stderr.on('data', chunk => appendFileSync(log, chunk));
child.stdout.on('data', chunk => {
  appendFileSync(log, chunk); text += chunk;
  const path = text.match(/^Evidence (.+)$/m)?.[1];
  if (path) evidence = path;
  const owned = text.match(/^Owned simulator ([A-F0-9-]+)$/m)?.[1];
  if (owned && !sent) {
    assert.ok(evidence?.startsWith(join(root, '.runtime', 'context-parity-')));
    const report = JSON.parse(readFileSync(join(evidence, 'report.json'), 'utf8'));
    assert.equal(report.simulator, owned);
    assert.equal(child.exitCode, null);
    simulator = owned;
    sent = child.kill('SIGTERM');
  }
});
const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
assert.equal(sent, true, 'The owned simulator must have existed before interruption');
assert.equal(exit.code, 1);
const report = JSON.parse(readFileSync(join(evidence, 'report.json'), 'utf8'));
assert.equal(report.interrupted, 'SIGTERM');
assert.deepEqual(report.cleanupErrors, []);
const inventory = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', '-j'], { encoding: 'utf8' }));
assert.equal(Object.values(inventory.devices).flat().some(device => device.udid === simulator), false);
const result = { scope: 'SIGTERM of owned diagnostic runner after simulator creation; not forced-kill cleanup', interrupted: report.interrupted, simulatorRemoved: true, childExit: exit, report: join(evidence, 'report.json'), log };
writeFileSync(`${log}.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
