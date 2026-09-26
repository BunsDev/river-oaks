import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const blinkNames=['eyeBlinkLeft','eyeBlinkRight'];
const formats={5121:['readUInt8',1],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function parse(bytes) {
 if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw new Error('Expected GLB 2');
 const size=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+size));
 return {json,bin:bytes.subarray(28+size)};
}
function values(asset,index) {
 const a=asset.json.accessors[index],width=widths[a.type],out=new Float64Array(a.count*width);
 const read=(viewIndex,offset,count,componentType,components,destination)=>{
  const view=asset.json.bufferViews[viewIndex],[method,size]=formats[componentType],stride=view.byteStride??size*components;
  for(let i=0;i<count;i++)for(let c=0;c<components;c++)destination(i,c,asset.bin[method]((view.byteOffset??0)+offset+i*stride+c*size));
 };
 if(a.bufferView!==undefined)read(a.bufferView,a.byteOffset??0,a.count,a.componentType,width,(i,c,v)=>out[i*width+c]=v);
 if(a.sparse){const s=a.sparse,indices=[];read(s.indices.bufferView,s.indices.byteOffset??0,s.count,s.indices.componentType,1,(i,c,v)=>indices.push(v));read(s.values.bufferView,s.values.byteOffset??0,s.count,a.componentType,width,(i,c,v)=>out[indices[i]*width+c]=v);}
 return out;
}

export {parse as parseGlb,values as accessorValues};
export function packGlb(json,payload) {
 const bin=Buffer.alloc(Math.ceil(payload.length/4)*4);payload.copy(bin);json.buffers[0].byteLength=bin.length;
 const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
 const bytes=Buffer.alloc(28+padded.length+bin.length);bytes.writeUInt32LE(0x46546c67);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded.length,12);bytes.writeUInt32LE(0x4e4f534a,16);padded.copy(bytes,20);bytes.writeUInt32LE(bin.length,20+padded.length);bytes.writeUInt32LE(0x004e4942,24+padded.length);bin.copy(bytes,28+padded.length);
 return bytes;
}

// Append only shape deltas. Existing geometry, skins, textures, materials and
// binary payload stay intact; an incompatible donor is rejected, not remeshed.
export function appendFacialTargets(originalBytes,candidateBytes,{names=blinkNames,skipMaterials=[]}={}) {
 if(!names.length||new Set(names).size!==names.length||names.some(name=>typeof name!=='string'||!name))throw new Error('Invalid facial target names');
 const original=parse(originalBytes),candidate=parse(candidateBytes),json=original.json,chunks=[original.bin],changes=[];
 const foundNames=new Set();
 let size=original.bin.length;
 const append=bytes=>{
  const padding=(4-size%4)%4;if(padding){chunks.push(Buffer.alloc(padding));size+=padding;}
  const index=json.bufferViews.push({buffer:0,byteOffset:size,byteLength:bytes.length})-1;chunks.push(bytes);size+=bytes.length;return index;
 };
 const sparse=(array)=>{
  const count=array.length/3,indices=[];
  for(let i=0;i<count;i++)if(array[i*3]!==0||array[i*3+1]!==0||array[i*3+2]!==0)indices.push(i);
  const a={componentType:5126,count,type:'VEC3'};
  if(indices.length){
   const wide=count>65535,ib=Buffer.alloc(indices.length*(wide?4:2)),vb=Buffer.alloc(indices.length*12);
   indices.forEach((index,i)=>{ib[wide?'writeUInt32LE':'writeUInt16LE'](index,i*(wide?4:2));for(let c=0;c<3;c++)vb.writeFloatLE(array[index*3+c],i*12+c*4);});
   a.sparse={count:indices.length,indices:{bufferView:append(ib),componentType:wide?5125:5123},values:{bufferView:append(vb)}};
  }
  a.min=[0,1,2].map(c=>{let value=Infinity;for(let i=c;i<array.length;i+=3)value=Math.min(value,array[i]);return value;});
  a.max=[0,1,2].map(c=>{let value=-Infinity;for(let i=c;i<array.length;i+=3)value=Math.max(value,array[i]);return value;});
  return json.accessors.push(a)-1;
 };
 for(const mesh of candidate.json.meshes)for(const donor of mesh.primitives){
  if(!donor.targets?.length)continue;
  const targetNames=mesh.extras?.targetNames;
  const material=candidate.json.materials[donor.material].name;
  if(skipMaterials.includes(material))continue;
  const selected=names.filter(name=>targetNames?.includes(name));
  if(!selected.length)continue;
  const matches=json.meshes.flatMap(mesh=>mesh.primitives.filter(p=>json.materials[p.material]?.name===material).map(primitive=>({mesh,primitive})));
  if(matches.length!==1)throw new Error(`Ambiguous facial mesh: ${material}`);
  const {mesh:destination,primitive}=matches[0];
  if(destination.primitives.length!==1)throw new Error(`Multiple facial primitives are unsupported: ${material}`);
  const existing=destination.extras?.targetNames??[];
  if(existing.length!==(primitive.targets?.length??0)||new Set(existing).size!==existing.length)throw new Error(`Invalid existing facial targets: ${material}`);
  if(selected.some(name=>existing.includes(name)))throw new Error(`${material} already has requested morph targets`);
  const extendWeights=weights=>{
   if(weights!==undefined&&weights.length!==existing.length)throw new Error(`Invalid existing facial weights: ${material}`);
   return [...(weights??existing.map(()=>0)),...selected.map(()=>0)];
  };
  // Subdivision export can split UV seams differently. Match exact geometric
  // positions and skin weights, preserving the original UVs and vertex splits.
  const keys=(asset,p)=>{
   const count=asset.json.accessors[p.attributes.POSITION].count,out=Array(count).fill('');
   for(const attribute of ['POSITION','JOINTS_0','WEIGHTS_0']){
    if(p.attributes[attribute]===undefined)continue;
    const array=values(asset,p.attributes[attribute]),width=array.length/count;
    for(let i=0;i<count;i++)out[i]+=`|${attribute}:${array.subarray(i*width,(i+1)*width).join(',')}`;
   }
   return out;
  };
  const oldKeys=keys(original,primitive),newKeys=keys(candidate,donor),vertices=new Map();
  newKeys.forEach((key,i)=>{if(!vertices.has(key))vertices.set(key,[]);vertices.get(key).push(i);});
  if(oldKeys.some(key=>!vertices.has(key))||new Set(oldKeys).size!==vertices.size)throw new Error(`Changed POSITION or JOINTS_0/WEIGHTS_0: ${material}`);
  const triangles=(asset,p,keys)=>{
   const indices=p.indices===undefined?keys.map((_,i)=>i):values(asset,p.indices),faces=new Map();
   for(let i=0;i<indices.length;i+=3){
    const points=[keys[indices[i]],keys[indices[i+1]],keys[indices[i+2]]];
    const first=points.indexOf([...points].sort()[0]),key=[...points.slice(first),...points.slice(0,first)].join(';');
    faces.set(key,(faces.get(key)??0)+1);
   }
   return faces;
  };
  const oldFaces=triangles(original,primitive,oldKeys),newFaces=triangles(candidate,donor,newKeys);
  if(oldFaces.size!==newFaces.size||[...oldFaces].some(([key,count])=>newFaces.get(key)!==count))throw new Error(`Changed triangle topology: ${material}`);
  const oldNormals=values(original,primitive.attributes.NORMAL),newNormals=values(candidate,donor.attributes.NORMAL);
  const mapping=oldKeys.map((key,i)=>vertices.get(key).reduce((best,index)=>{
   const distance=j=>[0,1,2].reduce((sum,c)=>sum+(oldNormals[i*3+c]-newNormals[j*3+c])**2,0);
   return distance(index)<distance(best)?index:best;
  }));
  primitive.targets=[...(primitive.targets??[]),...selected.map(name=>{
   const source=donor.targets[targetNames.indexOf(name)],target={};
   for(const attribute of ['POSITION','NORMAL'])if(source[attribute]!==undefined){
    const delta=values(candidate,source[attribute]);
    if(delta.length!==newKeys.length*3||!delta.every(Number.isFinite))throw new Error('Invalid facial target values');
    if(attribute==='POSITION')for(const indices of vertices.values())for(const i of indices)for(let c=0;c<3;c++)if(delta[i*3+c]!==delta[indices[0]*3+c])throw new Error('Ambiguous facial displacement at a split vertex');
    const remapped=new Float64Array(oldKeys.length*3);
    mapping.forEach((index,i)=>{for(let c=0;c<3;c++)remapped[i*3+c]=delta[index*3+c];});
    target[attribute]=sparse(remapped);
   }
   return target;
  })];
  destination.weights=extendWeights(destination.weights);
  for(const node of json.nodes??[])if(node.mesh===json.meshes.indexOf(destination)&&node.weights!==undefined)node.weights=extendWeights(node.weights);
  destination.extras={...destination.extras,targetNames:[...existing,...selected]};
  selected.forEach(name=>foundNames.add(name));
  changes.push({material,vertices:json.accessors[primitive.attributes.POSITION].count,targets:selected});
 }
 if(!changes.length)throw new Error('No facial targets to append');
 if(names.some(name=>!foundNames.has(name)))throw new Error('Missing required facial targets');
 const padding=(4-size%4)%4;if(padding){chunks.push(Buffer.alloc(padding));size+=padding;}
 json.buffers[0].byteLength=size;
 const bytes=packGlb(json,Buffer.concat(chunks));
 if(bytes.length>12*1024*1024)throw new Error('Facial asset exceeds the 12 MiB character budget');
 return {bytes,changes,addedBytes:bytes.length-originalBytes.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [original,candidate,output]=process.argv.slice(2);
 if(!output||resolve(original)===resolve(output))throw new Error('Usage: node scripts/add-facial-targets.mjs original.glb candidate.glb separate-output.glb');
 const result=appendFacialTargets(await readFile(original),await readFile(candidate));await writeFile(output,result.bytes);
 console.log(JSON.stringify({output,changes:result.changes,addedBytes:result.addedBytes}));
}
