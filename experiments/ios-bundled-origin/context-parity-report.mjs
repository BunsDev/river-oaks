import assert from 'node:assert/strict';

// Validate the observation contract before drawing a context comparison.
// This qualifies the controlled trial only, not the client or a native host.
export function validateContextTrial(record, witness, { enabled, policyHash }) {
  assert.equal(record.error, undefined);
  assert.equal(record.mode, 'context-parity');
  assert.equal(record.cspEnabled, enabled);
  assert.equal(record.sourcePolicySHA256, policyHash);
  assert.equal(record.registeredMessageHandlers, 0);
  assert.equal(record.navigationCount, 1);
  assert.deepEqual(Object.keys(record.worlds).sort(), ['isolated', 'page']);
  const run = record.worlds.page.checks.runID;
  assert.equal(typeof run, 'string'); assert.ok(run.length > 0 && run.length <= 64);
  const result = {};
  for (const role of ['page', 'isolated']) {
    const checks = record.worlds[role].checks;
    assert.equal(checks.runID, run); assert.equal(checks.role, role);
    assert.equal(checks.harnessHandlerPresent, false);
    const requests = witness.filter(item => {
      const url = new URL(item.path, 'http://127.0.0.1');
      return item.method === 'GET' && url.pathname === '/witness/get' && url.searchParams.get('context') === role && url.searchParams.get('run') === run;
    });
    assert.ok(['reply', 'timeout', 'worker-error', 'construction-error', 'unavailable'].includes(checks.worker.outcome));
    assert.equal(checks.worker.nonceValidated, checks.worker.outcome === 'reply');
    if (checks.fetch.outcome === 'response') {
      assert.equal(checks.fetch.status, 200); assert.equal(requests.length, 1);
    } else {
      assert.equal(checks.fetch.outcome, 'error'); assert.equal(requests.length, 0);
    }
    if (!enabled) assert.equal(checks.fetch.outcome, 'response', 'both no-CSP controls must reach the witness');
    const cspRejectionQualified = enabled && role === 'page' && checks.fetch.outcome === 'error'
      && ['TypeError', 'SecurityError'].includes(checks.fetch.errorName)
      && record.worlds[role].violations.some(event => event.directive === 'connect-src' && event.canaryOrigin === true);
    if (enabled && role === 'page' && checks.fetch.outcome === 'error') assert.ok(cspRejectionQualified, 'Page failure lacks matching CSP evidence or is an inconclusive timeout');
    result[role] = { cspRejectionQualified, fetch: checks.fetch.outcome === 'response' ? 'response' : 'no-response', worker: checks.worker.outcome, witnessOrigins: requests.map(item => item.origin ?? null) };
  }
  return result;
}
