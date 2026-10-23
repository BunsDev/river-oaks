// Engineering timing comparison only; never a target-device/release verdict.
import { isDeepStrictEqual } from 'node:util';
const median = values => [...values].sort((a,b)=>a-b)[1];
const validNumber = value => Number.isFinite(value) && value > 0;
export function compareTimingBudgets(baseline, candidate) {
  const rows=[], reasons=[];
  for(const [label,report] of [['baseline',baseline],['candidate',candidate]]) {
    if(report?.status!=='passed'||report.sourceStable!==true||report.sampleDurationMs!==30000||!Number.isFinite(report.warmupMs)||report.warmupMs<5000||report.repetitions!==3
      ||!report.profiles?.length) reasons.push(`${label}: incomplete sampling protocol`);
  }
  for(const key of ['machine','browser','quality','reducedMotion','camera']) {
    if(!baseline?.[key]||!isDeepStrictEqual(baseline[key],candidate?.[key])) reasons.push(`Unmatched ${key}`);
  }
  // Load is retained per sample for review, not part of device identity.
  if(reasons.length)return {status:'incomplete',reasons,rows};
  if(!isDeepStrictEqual(baseline.profiles.map(p=>p.name),candidate.profiles.map(p=>p.name))) reasons.push('Unmatched profiles');
  for(const original of baseline.profiles) {
    const revised=candidate.profiles.find(p=>p.name===original.name);
    if(!revised)continue;
    if(!isDeepStrictEqual(original.viewport,revised.viewport)||original.deviceScaleFactor!==revised.deviceScaleFactor) reasons.push(`Unmatched viewport ${original.name}`);
    for(const p of [original,revised])if(p.status!=='passed'||p.errors?.length!==0||p.samples?.length!==6) reasons.push(`Incomplete profile ${original.name}`);
    for(const players of [1,2]) {
      const sets=[original,revised].map(p=>p.samples?.filter(s=>s.players===players)??[]);
      if(sets.some(samples=>samples.length!==3||!isDeepStrictEqual(samples.map(s=>s.repetition).sort(),[1,2,3])
        ||samples.some(s=>s.durationMs<30000||!Number.isFinite(s.durationMs)||!s.after?.renderer
          ||['frame','cpuSubmission'].some(metric=>!validNumber(s[metric]?.p95Ms)||!validNumber(s[metric]?.count))))) {
        reasons.push(`Invalid windows ${original.name}/${players}`);continue;
      }
      if(new Set(sets.flat().map(s=>s.after.renderer)).size!==1)reasons.push(`Unmatched renderer ${original.name}/${players}`);
      for(const metric of ['frame','cpuSubmission']) {
        const [baselineMs,candidateMs]=sets.map(samples=>median(samples.map(s=>s[metric].p95Ms)));
        const limitMs=baselineMs*1.1;
        rows.push({profile:original.name,players,metric,baselineMs,candidateMs,limitMs,passed:candidateMs<=limitMs});
      }
    }
  }
  return {status:reasons.length?'incomplete':rows.every(row=>row.passed)?'passed':'failed',reasons,rows,
    scope:'Proposed 10% warmed timing regression budget only. Download, join, reconnect, memory, physical devices and visual acceptance require separate evidence.'};
}
