export function timedWave(metadata) {
 const json=Buffer.from(JSON.stringify(metadata)),audio=Buffer.alloc(44+4800),extra=Buffer.alloc(8+json.length+(json.length%2));
 audio.write('RIFF');audio.write('WAVE',8);audio.write('fmt ',12);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(24000,24);audio.writeUInt32LE(48000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(4800,40);
 extra.write('JEVS');extra.writeUInt32LE(json.length,4);json.copy(extra,8);const result=Buffer.concat([audio,extra]);result.writeUInt32LE(result.length-8,4);return result;
}
