import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadCharacterRig(profile) {
  // Keep the shipped geometry, weights, inverse binds and skeleton. Textures are
  // irrelevant to contact and require a browser image decoder, so omit them.
  const bytes=readFileSync(new URL(`../../public/assets/characters/${profile}.glb`,import.meta.url));
  const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
  gltf.materials=gltf.materials.map(({name})=>({name}));delete gltf.images;delete gltf.textures;
  const json=Buffer.from(JSON.stringify(gltf)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
  const binary=bytes.subarray(20+jsonLength),packed=Buffer.alloc(20+padded.length+binary.length);
  bytes.copy(packed,0,0,20);packed.writeUInt32LE(packed.length,8);packed.writeUInt32LE(padded.length,12);padded.copy(packed,20);binary.copy(packed,20+padded.length);
  const {scene}=await new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength),'');
  scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(scene);
  return {scene,height:bounds.max.y-bounds.min.y,floor:bounds.min.y};
}
