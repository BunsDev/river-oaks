// Byte accounting for one encoded snapshot frame, split by top-level section.
// Each section counts its `"key":value` member exactly as JSON.stringify writes
// it; framing is the braces and separating commas, so sections + framing = total.
// Measurement only: the broadcast path still sends the whole frame.
const bytes=text=>Buffer.byteLength(text,'utf8');

function encodeSections(frame) {
  const sections=[];
  for (const [key,value] of Object.entries(frame)) {
    const encoded=JSON.stringify(value);
    // JSON.stringify omits undefined, function and symbol members from the frame.
    if (encoded===undefined) continue;
    sections.push({key,bytes:bytes(JSON.stringify(key))+1+bytes(encoded),encoded});
  }
  return sections.sort((a,b)=>b.bytes-a.bytes||a.key.localeCompare(b.key));
}

/** Total frame bytes, framing bytes, and each section's bytes, largest first. */
export function measureSnapshotSections(frame) {
  const total=bytes(JSON.stringify(frame));
  const sections=encodeSections(frame).map(({key,bytes})=>({key,bytes}));
  return {total,framing:total-sections.reduce((sum,item)=>sum+item.bytes,0),sections};
}

/** Per-section bytes for `next`, and whether each section's encoding differs from `previous`. */
export function compareSnapshotSections(previous,next) {
  const before=new Map(encodeSections(previous).map(item=>[item.key,item.encoded]));
  const total=bytes(JSON.stringify(next));
  const sections=encodeSections(next).map(({key,bytes,encoded})=>({key,bytes,changed:before.get(key)!==encoded}));
  const sum=filter=>sections.filter(filter).reduce((acc,item)=>acc+item.bytes,0);
  return {total,framing:total-sum(()=>true),unchangedBytes:sum(item=>!item.changed),sections};
}
