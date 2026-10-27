// Test-only data policy, shared by the browser journey and its Node regressions.
// A material pair is not an exemption everywhere: keep each 4 m spatial cell and direction,
// and bound its actual overlap extent, size and triangle-pair count inside that cell.
const key = g => JSON.stringify([g.a,g.b,g.normal,g.cell]);
const valid = g => typeof g.a === 'string' && typeof g.b === 'string'
  && ['normal','cell','bounds'].every(field => Array.isArray(g[field]) && g[field].length === (field === 'bounds' ? 6 : 3) && g[field].every(Number.isFinite))
  && Number.isInteger(g.count) && g.count > 0
  && ['overlap','size','gapMin','gapMax'].every(field => Number.isFinite(g[field]) && g[field] >= 0);

export function collectDepthOccurrences(scans) {
  const found = new Map();
  for (const scan of scans) for (const item of scan.occurrences) {
    if (!valid(item)) throw new Error('Invalid depth occurrence');
    const id=key(item), old=found.get(id);
    if (!old) { found.set(id,{...item,bounds:[...item.bounds]});continue; }
    old.count=Math.max(old.count,item.count);old.overlap=Math.max(old.overlap,item.overlap);old.size=Math.max(old.size,item.size);
    old.gapMin=Math.min(old.gapMin,item.gapMin);old.gapMax=Math.max(old.gapMax,item.gapMax);
    old.bounds=old.bounds.map((v,i)=>i<3?Math.min(v,item.bounds[i]):Math.max(v,item.bounds[i]));
  }
  return [...found.values()].sort((a,b)=>key(a).localeCompare(key(b)));
}

export function compareDepthBaseline(baseline, found) {
  if (baseline?.version !== 2 || !Array.isArray(baseline.occurrences)) throw new Error('Depth baseline version 2 is required; migrate explicitly on the recorded geometry baseline');
  if (![...baseline.occurrences,...found].every(valid)) throw new Error('Invalid depth occurrence baseline');
  const known=new Map(baseline.occurrences.map(g=>[key(g),g]));
  if (known.size!==baseline.occurrences.length) throw new Error('Duplicate depth occurrence baseline');
  return found.filter(g=>{
    const old=known.get(key(g));
    return !old || g.count>old.count || g.overlap>old.overlap+Math.max(.0001,old.overlap*.00001)
      || g.size>old.size+.001 || g.gapMin<old.gapMin-.0002
      || g.bounds.some((v,i)=>i<3?v<old.bounds[i]-.002:v>old.bounds[i]+.002);
  });
}

export function burnDownDepthBaseline(baseline, found) {
  const fresh=compareDepthBaseline(baseline,found);
  if (fresh.length) throw new Error(`${fresh.length} depth occurrence regressions; baseline was not rewritten`);
  // Resolved entries are removed; reduced budgets cannot be reused by a later regression.
  const known=new Map(baseline.occurrences.map(g=>[key(g),g]));
  return {...baseline,occurrences:found.map(g=>{
    const old=known.get(key(g));
    const bounds=[...old.bounds];
    for(let i=0;i<3;i++){
      const low=Math.max(old.bounds[i],g.bounds[i]),high=Math.min(old.bounds[i+3],g.bounds[i+3]);
      // Tolerated noise can move a zero-thickness plane without leaving an intersection.
      // Retain its old interval rather than widening it or recording inverted bounds.
      if(low<=high){bounds[i]=low;bounds[i+3]=high;}
    }
    const gapMin=Math.max(old.gapMin,g.gapMin);
    return {...g,count:Math.min(old.count,g.count),overlap:Math.min(old.overlap,g.overlap),size:Math.min(old.size,g.size),
      gapMin,gapMax:Math.max(gapMin,Math.min(old.gapMax,g.gapMax)),bounds};
  })};
}

// One independently reviewable entry per line; six decimal places are much finer than the
// explicit comparison tolerances. Keep class summaries for historical burn-down context.
export function formatDepthBaseline(baseline) {
  const {pairs,occurrences,...metadata}=baseline;
  const compact=g=>JSON.stringify(g,(_key,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v);
  return `${JSON.stringify(metadata,null,2).slice(0,-2)},\n  "pairs": [\n${pairs.map(g=>`    ${compact(g)}`).join(',\n')}\n  ],\n  "occurrences": [\n${occurrences.map(g=>`    ${compact(g)}`).join(',\n')}\n  ]\n}\n`;
}
