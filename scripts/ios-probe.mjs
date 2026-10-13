import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { distribution } from '../preview/audit/metrics.js';

// RAF telemetry is diagnostic support only. This command never passes the
// physical-device architecture gate or guesses a workload from a frame count.
export function summarizeProbe(records) {
  if (!Array.isArray(records) || records[0]?.event !== 'start') throw new Error('Missing recording start');
  const start = records[0], gaps = new Set(['game-render-loop/GPU timing unavailable', 'WebContent/GPU memory unavailable', 'workload and hosted source revision require separate evidence']);
  const frames = [], navigations = new Set(), thermalStates = new Set();
  let readySamples = 0, webContentTerminations = 0, valid = true;
  for (const record of records) {
    if (!record || typeof record.event !== 'string') throw new Error('Malformed recording event');
    if (Number.isInteger(record.thermalState)) thermalStates.add(record.thermalState);
    if (record.event === 'web-content-terminated') {
      webContentTerminations++; valid = false; gaps.add('WebContent terminated; stability gate failed');
    }
    if (!['sample', 'final-sample'].includes(record.event)) continue;
    const page = record.page;
    if (!page || !Array.isArray(page.intervalsMs) || page.intervalsMs.some(ms => !Number.isFinite(ms) || ms <= 0)) throw new Error('Invalid frame samples');
    if (page.overflow || page.invalid) { valid = false; gaps.add('invalid or overflowing samples'); }
    if (page.ready) readySamples++;
    if (typeof record.navigationID === 'string') navigations.add(record.navigationID);
    for (const ms of page.intervalsMs) frames.push(ms);
  }
  const blockedAssetGroups = start.blockedAssetGroups ?? [];
  if (!Array.isArray(blockedAssetGroups) || blockedAssetGroups.some(group => !['characters', 'landscape', 'materials', 'standard-rigs', 'special-rigs'].includes(group))) throw new Error('Invalid isolation metadata');
  if (blockedAssetGroups.length) { valid = false; gaps.add('asset-isolation trial; reduced content is not representative'); }
  const stop = records.at(-1);
  const recordingFinalized = stop.event === 'stop' && stop.finalDrainComplete === true;
  if (!recordingFinalized) gaps.add('recording not cleanly finalized');
  if (start.configuration !== 'Release') { valid = false; gaps.add('non-Release build'); }
  if (!/^[0-9a-f]{40}$/.test(start.sourceSHA ?? '')) { valid = false; gaps.add('missing probe source revision'); }
  if (start.sourceDirty !== 'false') gaps.add('uncommitted probe changes; retain source patch and app hash');
  const seconds = frames.reduce((sum, ms) => sum + ms, 0) / 1000;
  if (!frames.length) gaps.add('no playable-scene timing');
  if (seconds < 1200) gaps.add('less than 20 minutes of foreground timing');
  if (navigations.size > 1) gaps.add('multiple navigations; inspect each workload separately');
  return { schema: 'typesafe.ios-probe-summary.v1', sourceSHA: start.sourceSHA, configuration: start.configuration,
    scope: 'Browser animation-frame scheduling for ready scene windows; not rendered-frame or release acceptance.',
    records: records.length, readySamples, webContentTerminations, blockedAssetGroups, navigations: navigations.size, foregroundSampledSeconds: seconds,
    frameIntervals: frames.length ? distribution(frames) : null, thermalStates: [...thermalStates].sort(),
    recordingFinalized, valid, architectureAccepted: false, gaps: [...gaps] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/ios-probe.mjs <probe.jsonl>');
  const text = await readFile(process.argv[2], 'utf8');
  const records = text.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  console.log(JSON.stringify(summarizeProbe(records), null, 2));
}
