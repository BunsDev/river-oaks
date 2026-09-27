import test from 'node:test';
import assert from 'node:assert/strict';
import {appendMouthMeshes} from '../../scripts/add-speech-targets.mjs';
import {packGlb,parseGlb,accessorValues} from '../../scripts/add-facial-targets.mjs';

function fixture({mouths=false,headShift=0,bindShift=0,externalImage=false}={}) {
 const json={asset:{version:'2.0'},buffers:[{byteLength:0}],bufferViews:[],accessors:[],materials:[{name:'skin'}],meshes:[],nodes:[{name:'head',translation:[headShift,0,0]},{name:'rig',children:[0,2]},{name:'body',mesh:0,skin:0}],skins:[],scenes:[{nodes:[1]}],scene:0};
 const chunks=[];let offset=0;
 const view=bytes=>{const i=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length})-1;chunks.push(bytes);offset+=bytes.length;return i;};
 const accessor=(values,type)=>{const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeFloatLE(v,i*4));return json.accessors.push({bufferView:view(b),componentType:5126,type,count:values.length/({VEC3:3,VEC4:4,MAT4:16}[type])})-1;};
 const inverseBindMatrices=accessor([1,0,0,0,0,1,0,0,0,0,1,0,bindShift,0,0,1],'MAT4');json.skins.push({joints:[0],inverseBindMatrices});
 const attributes={POSITION:accessor([0,0,0,1,0,0,0,1,0],'VEC3'),NORMAL:accessor([0,0,1,0,0,1,0,0,1],'VEC3')};
 json.meshes.push({primitives:[{material:0,attributes}]});
 if(mouths){
  json.images=[externalImage?{uri:'https://example.com/teeth.png'}:{mimeType:'image/webp',bufferView:view(Buffer.from([1,2,3,4]))}];
  json.textures=[{sampler:0,extensions:{EXT_texture_webp:{source:0}}}];json.samplers=[{magFilter:9729}];json.extensionsUsed=['EXT_texture_webp'];
  for(const name of ['teeth','tongue01']){
   const material=json.materials.push({name,pbrMetallicRoughness:{baseColorTexture:{index:0}}})-1;
   const position=accessor([0,0,0,0,-.01,0,0,0,0],'VEC3');
   const mesh=json.meshes.push({primitives:[{attributes,material,targets:[{POSITION:position}]}],extras:{targetNames:['viseme_aa']},weights:[0]})-1;
   json.nodes[1].children.push(json.nodes.push({name,skin:0,mesh})-1);
  }
 }
 return packGlb(json,Buffer.concat(chunks));
}

test('oral append preserves body and rig bytes and remaps only new oral resources',()=>{
 const original=fixture(),donor=fixture({mouths:true}),result=appendMouthMeshes(original,donor),a=parseGlb(original),b=parseGlb(result.bytes),d=parseGlb(donor);
 assert.deepEqual(b.bin.subarray(0,a.bin.length),a.bin);
 assert.deepEqual(b.json.meshes[0],a.json.meshes[0]);assert.deepEqual(b.json.skins,a.json.skins);assert.deepEqual(b.json.nodes[0],a.json.nodes[0]);
 assert.deepEqual(b.json.nodes[1].children,[0,2,3,4]);
 for(const i of [1,2]){
  const p=b.json.meshes[i].primitives[0];
  assert.deepEqual(accessorValues(b,p.attributes.POSITION),accessorValues(d,d.json.meshes[i].primitives[0].attributes.POSITION));
  assert.deepEqual(accessorValues(b,p.targets[0].POSITION),accessorValues(d,d.json.meshes[i].primitives[0].targets[0].POSITION));
  assert.equal(b.json.nodes[i+2].skin,0);
 }
 assert.equal(b.json.images.length,1,'Shared oral texture is copied once');
 assert.equal(b.json.textures[0].extensions.EXT_texture_webp.source,0);
 const image=b.json.bufferViews[b.json.images[0].bufferView];assert.deepEqual(b.bin.subarray(image.byteOffset,image.byteOffset+image.byteLength),Buffer.from([1,2,3,4]));
});

test('oral append rejects changed rig transforms and bind matrices',()=>{
 assert.throws(()=>appendMouthMeshes(fixture(),fixture({mouths:true,headShift:.01})),/rig transform/);
 assert.throws(()=>appendMouthMeshes(fixture(),fixture({mouths:true,bindShift:.01})),/inverse bind/);
});

test('oral append rejects missing meshes, duplicate installation, and external texture dependencies',()=>{
 assert.throws(()=>appendMouthMeshes(fixture(),fixture()),/oral mesh/);
 const donor=fixture({mouths:true}),result=appendMouthMeshes(fixture(),donor);
 assert.throws(()=>appendMouthMeshes(result.bytes,donor),/already exists/);
 assert.throws(()=>appendMouthMeshes(fixture(),fixture({mouths:true,externalImage:true})),/embedded/);
});
