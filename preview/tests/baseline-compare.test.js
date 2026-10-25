import assert from 'node:assert/strict';
import test from 'node:test';
import { compareBaselines } from '../audit/baseline-compare.js';

const sample = (players, meanMs, cpuP95, p95, calls = 1700) => ({ players, frameSummary: { meanMs, missedTwoRefreshes: 0 },
  cpuSubmission: { p50Ms: cpuP95 / 2, p95Ms: cpuP95 }, frame: { p95Ms: p95 }, after: { render: { calls }, memory: { geometries: 530, textures: 162 } } });
// Without reconnectBackoff or reconnects the report has the shape written before those
// options existed; options: {} has the shape written since, without the new fields.
const report = ({ head = 'base', vsync, two = [33, 14, 33.4], reconnectMs = 1000, status = 'passed', reconnectBackoff, reconnects, options } = {}) => ({ status, head, ...vsync ? { vsync } : {},
  ...options || reconnectBackoff || reconnects ? { options: { ...options, ...reconnectBackoff ? { reconnectBackoff } : {}, ...reconnects ? { reconnects } : {} } } : {},
  profiles: [{ name: 'desktop', reconnectMs, ...reconnectBackoff ? { reconnectBackoff } : {}, ...reconnects ? { reconnectSamplesMs: Array(reconnects).fill(reconnectMs) } : {}, samples: [sample(1, 16.7, 11, 16.7), sample(1, 16.7, 12, 16.7), sample(1, 16.7, 13, 16.7),
    ...[0, 1, 2].map(() => sample(2, ...two))] }] });
const row = (result, workload, metric) => result.rows.find(item => item.workload === workload && item.metric === metric);

test('a refresh-step p95 change is reported but does not fail the budget', () => {
  const result = compareBaselines([report()], [report({ head: 'main', two: [33.5, 14.2, 50] })]);
  assert.equal(row(result, 'desktop/2p', 'frameP95Ms').decision, 'informational');
  assert.equal(row(result, 'desktop/2p', 'frameP95Ms').change, .497);
  assert.equal(row(result, 'desktop/2p', 'frameMeanMs').decision, 'within');
  assert.deepEqual(result.over, []);
  assert.deepEqual(result.heads, { base: ['base'], candidate: ['main'] });
});

test('uncapped frame p95 is budgeted like the frame mean', () => {
  const off = two => report({ vsync: 'off', two });
  const within = compareBaselines([off([24, 38, 45.4])], [off([25, 41, 47.9])]);
  assert.deepEqual([row(within, 'desktop/2p', 'frameP95Ms').decision, row(within, 'desktop/2p', 'frameP95Ms').budget], ['within', .1]);
  const over = compareBaselines([off([24, 38, 45.4])], [off([25, 41, 52])]);
  assert.deepEqual(over.over, ['desktop/2p frameP95Ms']);
});

test('continuous frame, CPU and reconnect regressions fail their own budgets', () => {
  const result = compareBaselines([report()], [report({ two: [37, 15.6, 50], reconnectMs: 1250 })]);
  assert.deepEqual(result.over, ['desktop/2p frameMeanMs', 'desktop/2p cpuSubmissionP95Ms', 'desktop/reconnect reconnectMs']);
  assert.equal(row(result, 'desktop/reconnect', 'reconnectMs').budget, .2);
  assert.equal(row(result, 'desktop/1p', 'cpuSubmissionP95Ms').base, 12, 'per-report median across samples');
});

test('each arm averages its paired rounds', () => {
  const result = compareBaselines([report({ two: [30, 14, 33.4] }), report({ two: [36, 14, 50] })], [report({ two: [33, 14, 50] })]);
  assert.equal(row(result, 'desktop/2p', 'frameMeanMs').base, 33);
  assert.equal(row(result, 'desktop/2p', 'frameMeanMs').change, 0);
});

test('mixed vsync settings, failed reports and empty arms are refused', () => {
  assert.throws(() => compareBaselines([report()], [report({ vsync: 'off' })]), /same vsync/);
  assert.throws(() => compareBaselines([report({ status: 'failed' })], [report()]), /Only passed/);
  assert.throws(() => compareBaselines([], [report()]), /at least one/);
});

test('reconnect rows decide only between matched rejoin settings', () => {
  // Older reports, with or without an options block, took one rejoin that waited out the backoff.
  const older = compareBaselines([report()], [report({ options: { vsync: 'on' }, reconnectBackoff: 'keep', reconnects: 1 })]);
  assert.deepEqual([row(older, 'desktop/reconnect', 'reconnectMs').settings, row(older, 'desktop/reconnect', 'reconnectMs').decision], ['keep×1', 'within']);
  const matched = compareBaselines([report({ reconnects: 5, reconnectMs: 900 })], [report({ reconnects: 5, reconnectMs: 1200 })]);
  assert.deepEqual([row(matched, 'desktop/reconnect', 'reconnectMs').settings, row(matched, 'desktop/reconnect', 'reconnectMs').decision], ['keep×5', 'over']);
  const skipped = compareBaselines([report({ reconnectBackoff: 'skip', reconnects: 5, reconnectMs: 250 })], [report({ reconnectBackoff: 'skip', reconnects: 5, reconnectMs: 260 })]);
  assert.equal(row(skipped, 'desktop/reconnect', 'reconnectMs').decision, 'within');
});

test('mismatched rejoin settings leave the reconnect row undecided and the rest compared', () => {
  for (const [base, candidate] of [[report(), report({ reconnects: 5, reconnectMs: 2000 })], [report({ reconnects: 5 }), report({ reconnectBackoff: 'skip', reconnects: 5, reconnectMs: 2000 })],
    [[report({ reconnects: 5 }), report({ reconnects: 3 })], [report({ reconnects: 5, reconnectMs: 2000 })]]]) {
    const result = compareBaselines([base].flat(), [candidate].flat());
    const reconnect = row(result, 'desktop/reconnect', 'reconnectMs');
    assert.equal(reconnect.decision, 'unmatched');
    assert.equal(reconnect.budget, undefined);
    assert.deepEqual(result.unmatched, ['desktop/reconnect reconnectMs']);
    assert.deepEqual(result.over, []);
    assert.equal(row(result, 'desktop/2p', 'frameMeanMs').decision, 'within');
  }
});
