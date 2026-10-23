import { CHARACTER_RIG_REQUIREMENTS } from '../preview/src/character-compatibility.js';

// Authored numeric test geometry only. No imported human model or likeness data.
// The catalog id supplies the shared 53-bone contract, never a publishable asset id.
export function makeLikenessFixture() {
  const names = CHARACTER_RIG_REQUIREMENTS['man-casual'].requiredBones;
  const parts = [], bufferViews = [];
  let offset = 0;
  function view(bytes) {
    const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
    bytes.copy(padded);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    parts.push(padded); offset += padded.length;
    return bufferViews.length - 1;
  }
  const floats = values => { const b=Buffer.alloc(values.length*4); values.forEach((v,i)=>b.writeFloatLE(v,i*4)); return b; };
  const positions = view(floats([0,0,0, 1,0,0, 0,1.5,0]));
  const joints = view(Buffer.alloc(12));
  const weights = view(floats([1,0,0,0, 1,0,0,0, 1,0,0,0]));
  const indices = view(Buffer.from([0,1,2]));
  const binds = view(floats(names.flatMap(()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])));
  // Embedded constant 1x1 WebP, no source image or person.
  const texture = view(Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64'));
  const gltf = {
    asset: {version:'2.0'}, scene:0, scenes:[{nodes:[0]}],
    nodes:[...names.map((name,i)=>({name,...(i===0?{children:Array.from({length:names.length},(_,j)=>j+1)}:{})})),{mesh:0,skin:0}],
    skins:[{joints:names.map((_,i)=>i),inverseBindMatrices:4}],
    meshes:[{primitives:[{attributes:{POSITION:0,JOINTS_0:1,WEIGHTS_0:2},indices:3,material:0}]}],
    materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}],
    images:[{bufferView:texture,mimeType:'image/webp'}], textures:[{source:0}],
    buffers:[{byteLength:offset}], bufferViews,
    accessors:[
      {bufferView:positions,componentType:5126,count:3,type:'VEC3'},
      {bufferView:joints,componentType:5121,count:3,type:'VEC4'},
      {bufferView:weights,componentType:5126,count:3,type:'VEC4'},
      {bufferView:indices,componentType:5121,count:3,type:'SCALAR'},
      {bufferView:binds,componentType:5126,count:53,type:'MAT4'},
    ],
  };
  const json=Buffer.from(JSON.stringify(gltf)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);
  json.copy(padded);
  const bytes=Buffer.alloc(28+padded.length+offset);
  bytes.write('glTF');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);
  bytes.writeUInt32LE(padded.length,12);bytes.writeUInt32LE(0x4e4f534a,16);padded.copy(bytes,20);
  bytes.writeUInt32LE(offset,20+padded.length);bytes.writeUInt32LE(0x004e4942,24+padded.length);
  Buffer.concat(parts).copy(bytes,28+padded.length);
  return bytes;
}
