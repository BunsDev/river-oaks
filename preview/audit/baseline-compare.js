// Paired comparison of world-expansion-baseline reports, for example two ABBA
// rounds of base and candidate taken under one held browser lock:
//   node preview/audit/baseline-compare.js --base=a1.json,a2.json --candidate=b1.json,b2.json --output=compare.json
// Each arm's value is the mean over its reports of the per-report median across
// samples. Budgets apply to continuous metrics. Frame p95 is decided on only when
// uncapped (vsync off); vsync-locked p95 is reported but not decided on, because it
// moves in whole refresh steps.
import { readFile, writeFile } from 'node:fs/promises';

const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = value => Math.round(value * 1000) / 1000;

export const BUDGETS = Object.freeze({ frame: .10, cpu: .10, reconnect: .20 });

// Metric name, budget kind (null = informational) and reader for one sample.
const SAMPLE_METRICS = [
  ['frameMeanMs', 'frame', sample => sample.frameSummary?.meanMs],
  ['cpuSubmissionP95Ms', 'cpu', sample => sample.cpuSubmission?.p95Ms],
  ['cpuSubmissionP50Ms', null, sample => sample.cpuSubmission?.p50Ms],
  ['frameP95Ms', null, sample => sample.frame?.p95Ms],
  ['missedTwoRefreshes', null, sample => sample.frameSummary?.missedTwoRefreshes],
  ['drawCalls', null, sample => sample.after?.render?.calls],
  ['geometries', null, sample => sample.after?.memory?.geometries],
  ['textures', null, sample => sample.after?.memory?.textures],
];

function workloads(report) {
  if (report?.status !== 'passed' || !Array.isArray(report.profiles)) throw new Error('Only passed baseline reports can be compared');
  const result = new Map();
  for (const profile of report.profiles) {
    for (const players of [1, 2]) {
      const samples = profile.samples.filter(sample => sample.players === players);
      if (!samples.length) continue;
      const values = {};
      for (const [name, , read] of SAMPLE_METRICS) {
        const list = samples.map(read);
        if (list.every(Number.isFinite)) values[name] = median(list);
      }
      result.set(`${profile.name}/${players}p`, values);
    }
    if (Number.isFinite(profile.reconnectMs)) result.set(`${profile.name}/reconnect`, { reconnectMs: profile.reconnectMs });
  }
  return { vsync: report.vsync ?? 'on', reconnect: `${report.options?.reconnectBackoff ?? 'keep'}`, head: report.head, result };
}

export function compareBaselines(base, candidate) {
  if (!base.length || !candidate.length) throw new Error('Each arm needs at least one report');
  const arms = [base, candidate].map(reports => reports.map(workloads));
  const vsync = new Set(arms.flat().map(item => item.vsync));
  if (vsync.size !== 1) throw new Error('Compare reports taken with the same vsync setting');
  // A rejoin that waits out the client's random backoff and one that skips it measure different things.
  if (new Set(arms.flat().map(item => item.reconnect)).size !== 1) throw new Error('Compare reports taken with the same reconnect-backoff setting');
  const keys = [...arms[0][0].result.keys()].filter(key => arms.flat().every(item => item.result.has(key)));
  const uncapped = [...vsync][0] === 'off';
  const kinds = { ...Object.fromEntries(SAMPLE_METRICS.map(([name, kind]) => [name, kind])), reconnectMs: 'reconnect', ...uncapped ? { frameP95Ms: 'frame' } : {} };
  const rows = [];
  for (const key of keys) {
    const names = Object.keys(arms[0][0].result.get(key)).filter(name => arms.flat().every(item => Number.isFinite(item.result.get(key)[name])));
    for (const name of names) {
      const [baseValue, candidateValue] = arms.map(reports => mean(reports.map(item => item.result.get(key)[name])));
      const change = baseValue ? candidateValue / baseValue - 1 : 0;
      const kind = kinds[name];
      // A vsync-locked frame mean is capped at the refresh rate; only uncapped
      // runs (or two-player runs below the cap) carry frame-cost information.
      const budget = kind ? BUDGETS[kind] : null;
      rows.push({ workload: key, metric: name, base: round(baseValue), candidate: round(candidateValue), change: round(change),
        ...budget === null ? { decision: 'informational' } : { budget, decision: change <= budget ? 'within' : 'over' } });
    }
  }
  return { vsync: [...vsync][0], reconnectBackoff: arms[0][0].reconnect, heads: { base: [...new Set(arms[0].map(item => item.head))], candidate: [...new Set(arms[1].map(item => item.head))] },
    reports: { base: base.length, candidate: candidate.length }, rows,
    over: rows.filter(row => row.decision === 'over').map(row => `${row.workload} ${row.metric}`) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const match = /^--(base|candidate|output)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Invalid option: ${arg}`);
    return [match[1], match[2]];
  }));
  if (!args.base || !args.candidate) throw new Error('Use --base=a.json[,b.json] --candidate=c.json[,d.json] [--output=file]');
  const read = async list => Promise.all(list.split(',').map(async file => JSON.parse(await readFile(file, 'utf8'))));
  const result = compareBaselines(await read(args.base), await read(args.candidate));
  if (args.output) await writeFile(args.output, JSON.stringify(result, null, 2) + '\n');
  for (const row of result.rows) if (row.decision !== 'informational' || row.metric === 'frameP95Ms')
    console.log(`${row.workload.padEnd(22)} ${row.metric.padEnd(20)} ${String(row.base).padStart(9)} → ${String(row.candidate).padEnd(9)} ${(row.change * 100).toFixed(1).padStart(6)}%  ${row.decision}`);
  console.log(result.over.length ? `Over budget: ${result.over.join(', ')}` : 'All budgeted metrics within allowance.');
}
