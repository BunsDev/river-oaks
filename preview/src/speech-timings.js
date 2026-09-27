// Optional JEVS RIFF chunk. Untimed audio still plays; invalid timing metadata
// never drives a face. The timing duration must match the WAV's PCM duration.
export async function readSpeechTimings(blob) {
 if(blob.size>3*1024*1024)return [];
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
 const tag=offset=>String.fromCharCode(...bytes.subarray(offset,offset+4));
 if(bytes.length<44||tag(0)!=='RIFF'||tag(8)!=='WAVE'||view.getUint32(4,true)!==bytes.length-8)return [];
 let metadata=null,byteRate=0,audioBytes=0;
 try{
  for(let offset=12;offset+8<=bytes.length;){
   const size=view.getUint32(offset+4,true),start=offset+8,end=start+size;
   if(end>bytes.length)return [];
   if(tag(offset)==='fmt '&&size>=16){
    if(![1,3].includes(view.getUint16(start,true)))return [];
    byteRate=view.getUint32(start+8,true);
   }else if(tag(offset)==='data')audioBytes+=size;
   else if(tag(offset)==='JEVS'){
    if(metadata||size>512*1024)return [];
    metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(start,end)));
   }
   offset=end+(size%2);
  }
  const duration=audioBytes/byteRate;
  if(!metadata||metadata.version!==1||!Number.isFinite(duration)||duration<=0||duration>45||!Number.isFinite(metadata.duration)||Math.abs(metadata.duration-duration)>1e-5||!Array.isArray(metadata.phonemes)||metadata.phonemes.length>4096)return [];
  let previous=0;
  for(const cue of metadata.phonemes){
   if(typeof cue?.phoneme!=='string'||Array.from(cue.phoneme).length<1||Array.from(cue.phoneme).length>4||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<previous||cue.end<cue.start||cue.end>duration)return [];
   previous=cue.end;
  }
  return metadata.phonemes.map(({phoneme,start,end})=>({phoneme,start,end}));
 }catch{return [];}
}
