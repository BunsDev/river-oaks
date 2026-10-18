// Baked numeric fields are little-endian Float32 bytes. Keep the same values the
// GPU receives without parsing large decimal arrays or retaining boxed numbers.
export function unpackMorphData(encoded){
  const data={...encoded};
  for(const field of ['sourcePositions','sourceWeights','positionDelta','normalDelta','fittedWeights']){
    if(data[field]===undefined&&field==='fittedWeights')continue;
    if(typeof data[field]!=='string')throw new TypeError(`Missing packed morph field: ${field}`);
    const binary=atob(data[field]);if(binary.length%4)throw new TypeError(`Invalid packed morph length: ${field}`);
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),values=new Float32Array(bytes.length/4);
    for(let i=0;i<values.length;i++){values[i]=view.getFloat32(i*4,true);if(!Number.isFinite(values[i]))throw new TypeError(`Non-finite packed morph: ${field}`);}
    data[field]=values;
  }
  return data;
}
