import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { distribution } from '../preview/audit/metrics.js';

// RAF telemetry is diagnostic support only. This command never passes the
// physical-device architecture gate or guesses a workload from a frame count.
export function summarizeProbe(records) {
  if (!Array.isArray(records) || records[0]?.event !== 'start') throw new Error('Missing recording start');
  const start = records[0], gaps = new Set(['game-render-loop/GPU timing unavailable', 'WebContent/GPU memory unavailable', 'workload and hosted source revision require separate evidence']);
  const frames = [], navigations = new Set(), thermalStates = new Set();
  const phaseCaptures = []; let phaseCaptureFailures = 0;
  let readySamples = 0, webContentTerminations = 0, valid = true;
  for (const record of records) {
    if (!record || typeof record.event !== 'string') throw new Error('Malformed recording event');
    if (Number.isInteger(record.thermalState)) thermalStates.add(record.thermalState);
    if (record.event === 'web-content-terminated') {
      webContentTerminations++; valid = false; gaps.add('WebContent terminated; stability gate failed');
    }
    if (record.event === 'phase-capture-cancelled' || record.event === 'phase-capture-unavailable' ||
        record.event === 'phase-capture-start' && record.page?.status !== 'started') phaseCaptureFailures++;
    if (record.event === 'phase-capture') {
      if (record.page?.status === 'captured') phaseCaptures.push(summarizePhaseCapture(record.page, phaseCaptures.length));
      else phaseCaptureFailures++;
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
  if (start.serializedDecodes) { valid = false; gaps.add('serialized image decoding experiment; inspect separate control'); }
  if (start.htmlImages) { valid = false; gaps.add('HTML image decoder experiment; inspect separate control'); }
  if (start.renderPhasesEnabled || phaseCaptures.length) { valid = false; gaps.add('render-phase instrumentation; not unprofiled acceptance'); }
  if (phaseCaptures.length) { gaps.delete('game-render-loop/GPU timing unavailable'); gaps.add('GPU completion timing unavailable'); }
  if (phaseCaptureFailures) gaps.add('phase capture failed or interrupted; inspect raw events');
  const stop = records.at(-1);
  const recordingFinalized = stop.event === 'stop' && stop.finalDrainComplete === true;
  if (!recordingFinalized) gaps.add('recording not cleanly finalized');
  if (start.configuration !== 'Release') { valid = false; gaps.add('non-Release build'); }
  if (!/^[0-9a-f]{40}$/.test(start.sourceSHA ?? '')) { valid = false; gaps.add('missing probe source revision'); }
  if (start.sourceDirty !== 'false') gaps.add('uncommitted probe changes; retain source patch and app hash');
  const seconds = frames.reduce((sum, ms) => sum + ms, 0) / 1000;
  if (!frames.length) gaps.add('no RAF playable-scene timing');
  if (seconds < 1200) gaps.add('less than 20 minutes of foreground timing');
  if (navigations.size > 1) gaps.add('multiple navigations; inspect each workload separately');
  return { schema: 'typesafe.ios-probe-summary.v1', sourceSHA: start.sourceSHA, configuration: start.configuration,
    scope: 'RAF scheduling and optional synchronous render phases; not GPU completion or release acceptance.',
    records: records.length, readySamples, webContentTerminations, blockedAssetGroups, navigations: navigations.size, foregroundSampledSeconds: seconds,
    frameIntervals: frames.length ? distribution(frames) : null, thermalStates: [...thermalStates].sort(),
    phaseCaptures, phaseCaptureFailures, recordingFinalized, valid, architectureAccepted: false, gaps: [...gaps] };
}
function summarizePhaseCapture(page, index) {
  const names = ['setup', 'community', 'trees', 'residents', 'interactions', 'players', 'reflections', 'debug', 'pipeline', 'tail'];
  const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 60000;
  if (!finite(page.elapsedMs) || !Array.isArray(page.frames) || !page.frames.length || page.frames.length > 7200) throw new Error('Invalid phase capture');
  for (const frame of page.frames) {
    if (!finite(frame.intervalMs) || frame.intervalMs === 0 || !finite(frame.cpuMs) ||
      names.some(name => !finite(frame.phasesMs?.[name])) ||
      Math.abs(names.reduce((sum, name) => sum + frame.phasesMs[name], 0) - frame.cpuMs) > .001) throw new Error('Invalid phase timing');
  }
  return { index, scope: 'Synchronous elapsed render phases, including instrumentation/blocking/descheduling; not CPU execution or GPU completion.',
    elapsedMs: page.elapsedMs, coveredIntervalMs: page.frames.reduce((sum, frame) => sum + frame.intervalMs, 0),
    intervals: distribution(page.frames.map(frame => frame.intervalMs)), synchronousElapsed: distribution(page.frames.map(frame => frame.cpuMs)),
    phases: Object.fromEntries(names.map(name => [name, distribution(page.frames.map(frame => frame.phasesMs[name]))])) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/ios-probe.mjs <probe.jsonl>');
  const text = await readFile(process.argv[2], 'utf8');
  const records = text.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  console.log(JSON.stringify(summarizeProbe(records), null, 2));
}
