import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFacialTargets} from '../../scripts/add-facial-targets.mjs';

function fixture({targets=false,moveBody=false,changeWeights=false,names=['eyeBlinkLeft','eyeBlinkRight']}={}) {
 const json={asset:{version:'2.0'},buffers:[{byteLength:0}],bufferViews:[],accessors:[],materials:[{name:'skin'}],meshes:[],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
 const chunks=[];let offset=0;
 const accessor=(values,type)=>{
  const bytes=Buffer.alloc(values.length*4);values.forEach((v,i)=>bytes.writeFloatLE(v,i*4));
  const bufferView=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length})-1;chunks.push(bytes);offset+=bytes.length;
  return json.accessors.push({bufferView,componentType:5126,count:values.length/(type==='VEC3'?3:4),type})-1;
 };
 const primitive={material:0,attributes:{POSITION:accessor([0,0,0,1,0,0,moveBody?.1:0,1,0],'VEC3'),NORMAL:accessor([0,0,1,0,0,1,0,0,1],'VEC3'),WEIGHTS_0:accessor([changeWeights?.8:1,0,0,0,1,0,0,0,1,0,0,0],'VEC4')}};
 const mesh={primitives:[primitive]};json.meshes.push(mesh);
 if(targets){mesh.extras={targetNames:names};mesh.weights=names.map((_,i)=>i*.1);json.nodes[0].weights=names.map((_,i)=>i*.2);primitive.targets=names.map((_,i)=>({POSITION:accessor(i%2?[0,0,0,0,0,0,0,-.01,0]:[0,0,0,0,-.01,0,0,0,0],'VEC3')}));}
 json.buffers[0].byteLength=offset;const payload=Buffer.concat(chunks),text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
 const out=Buffer.alloc(28+padded.length+payload.length);out.writeUInt32LE(0x46546c67);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);out.writeUInt32LE(payload.length,20+padded.length);out.writeUInt32LE(0x004e4942,24+padded.length);payload.copy(out,28+padded.length);return out;
}

test('facial target append preserves every original binary byte and stores sparse morphs with neutral weights',()=>{
 const original=fixture(),result=appendFacialTargets(original,fixture({targets:true}));
 const beforeLength=original.readUInt32LE(12),afterLength=result.bytes.readUInt32LE(12),json=JSON.parse(result.bytes.toString('utf8',20,20+afterLength));
 assert.deepEqual(result.bytes.subarray(28+afterLength,28+afterLength+original.length-28-beforeLength),original.subarray(28+beforeLength));
 assert.deepEqual(json.meshes[0].weights,[0,0]);assert.deepEqual(json.meshes[0].extras.targetNames,['eyeBlinkLeft','eyeBlinkRight']);
 for(const target of json.meshes[0].primitives[0].targets){const a=json.accessors[target.POSITION];assert.equal(a.count,3);assert.equal(a.sparse.count,1);assert.equal(a.bufferView,undefined);}
});

test('facial target append rejects a changed body or skin weights instead of replacing the character',()=>{
 assert.throws(()=>appendFacialTargets(fixture(),fixture({targets:true,moveBody:true})),/POSITION/);
 assert.throws(()=>appendFacialTargets(fixture(),fixture({targets:true,changeWeights:true})),/WEIGHTS_0/);
});

test('facial target append rejects absent or duplicate targets',()=>{
 assert.throws(()=>appendFacialTargets(fixture(),fixture()),/facial targets/);
 assert.throws(()=>appendFacialTargets(fixture({targets:true}),fixture({targets:true})),/already/);
});

test('facial deltas follow geometric vertices when an exporter changes vertex order',()=>{
 const candidate=fixture({targets:true}),length=candidate.readUInt32LE(12),json=JSON.parse(candidate.toString('utf8',20,20+length));
 for(const a of json.accessors){
  const view=json.bufferViews[a.bufferView],width=a.type==='VEC3'?3:4,offset=28+length+view.byteOffset,copy=Buffer.from(candidate.subarray(offset,offset+view.byteLength));
  for(let i=0;i<a.count;i++)copy.copy(candidate,offset+i*width*4,((i+1)%a.count)*width*4,((i+1)%a.count+1)*width*4);
 }
 const result=appendFacialTargets(fixture(),candidate),n=result.bytes.readUInt32LE(12),g=JSON.parse(result.bytes.toString('utf8',20,20+n));
 const a=g.accessors[g.meshes[0].primitives[0].targets[0].POSITION],view=g.bufferViews[a.sparse.indices.bufferView];
 assert.equal(result.bytes.readUInt16LE(28+n+view.byteOffset),1,'The original vertex receives its corresponding donor delta');
});

test('new speech targets preserve existing blink accessors and mesh and node weights',()=>{
 const original=fixture({targets:true}),candidate=fixture({targets:true,names:['viseme_aa','viseme_PP']});
 const result=appendFacialTargets(original,candidate,{names:['viseme_aa','viseme_PP']});
 const parse=b=>JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 const before=parse(original),after=parse(result.bytes);
 assert.deepEqual(after.meshes[0].extras.targetNames,['eyeBlinkLeft','eyeBlinkRight','viseme_aa','viseme_PP']);
 assert.deepEqual(after.meshes[0].primitives[0].targets.slice(0,2),before.meshes[0].primitives[0].targets);
 assert.deepEqual(after.meshes[0].weights,[0,.1,0,0]);
 assert.deepEqual(after.nodes[0].weights,[0,.2,0,0]);
 assert.deepEqual(result.bytes.subarray(28+result.bytes.readUInt32LE(12),28+result.bytes.readUInt32LE(12)+original.length-28-original.readUInt32LE(12)),original.subarray(28+original.readUInt32LE(12)));
});

test('speech append rejects invalid names and missing requested shapes',()=>{
 const candidate=fixture({targets:true,names:['viseme_aa']});
 for(const names of [[],['viseme_aa','viseme_aa'],['viseme_aa','viseme_missing']])assert.throws(()=>appendFacialTargets(fixture(),candidate,{names}),/target/i);
});
