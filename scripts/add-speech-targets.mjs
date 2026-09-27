import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {appendFacialTargets,parseGlb,packGlb,accessorValues} from './add-facial-targets.mjs';

export const VISEMES='sil PP FF TH DD kk CH SS nn RR aa E I O U'.split(' ').map(n=>`viseme_${n}`);
const mouthMaterials=['teeth','tongue01'];
const transform=n=>n.matrix??[...(n.translation??[0,0,0]),...(n.rotation??[0,0,0,1]),...(n.scale??[1,1,1])];
// Blender exports can differ by a few float32 ULPs (up to 2.9e-6 in scale).
const near=(a,b)=>a.length===b.length&&a.every((v,i)=>Number.isFinite(v)&&Number.isFinite(b[i])&&Math.abs(v-b[i])<=5e-6);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Copy only the fitted oral meshes and their resources. Reuse the original
// skeleton only after validating its hierarchy, transforms and inverse binds.
export function appendMouthMeshes(originalBytes,candidateBytes) {
 const original=parseGlb(originalBytes),candidate=parseGlb(candidateBytes),json=original.json,donor=candidate.json;
 const chunks=[original.bin],copied=new Map(),changes=[];let size=original.bin.length;
 const append=bytes=>{const padding=(4-size%4)%4;if(padding){chunks.push(Buffer.alloc(padding));size+=padding;}const offset=size;chunks.push(bytes);size+=bytes.length;return offset;};
 const copy=(kind,index)=>{
  const key=`${kind}:${index}`;if(copied.has(key))return copied.get(key);
  const value=structuredClone(donor[kind]?.[index]);if(!value)throw new Error(`Missing oral resource: ${key}`);
  if(kind==='bufferViews'){
   if(value.buffer!==0||value.extensions)throw new Error('Unsupported oral buffer');
   const bytes=candidate.bin.subarray(value.byteOffset??0,(value.byteOffset??0)+value.byteLength);
   if(bytes.length!==value.byteLength)throw new Error('Truncated oral buffer');
   value.byteOffset=append(bytes);value.buffer=0;
  }else if(kind==='accessors'){
   if(value.extensions)throw new Error('Unsupported oral accessor');
   if(value.bufferView!==undefined)value.bufferView=copy('bufferViews',value.bufferView);
   if(value.sparse)for(const field of ['indices','values'])value.sparse[field].bufferView=copy('bufferViews',value.sparse[field].bufferView);
  }else if(kind==='images'){
   if(value.uri||value.bufferView===undefined)throw new Error('Oral textures must be embedded');
   value.bufferView=copy('bufferViews',value.bufferView);
  }else if(kind==='textures'){
   if(value.source!==undefined)value.source=copy('images',value.source);
   if(value.sampler!==undefined)value.sampler=copy('samplers',value.sampler);
   for(const [name,extension]of Object.entries(value.extensions??{})){
    if(name!=='EXT_texture_webp')throw new Error('Unsupported oral texture extension');
    extension.source=copy('images',extension.source);
   }
  }else if(kind==='materials'){
   const visit=o=>{for(const [name,v]of Object.entries(o)){if(v&&typeof v==='object'){if(name.endsWith('Texture')&&Number.isInteger(v.index))v.index=copy('textures',v.index);else visit(v);}}};visit(value);
   if(Object.keys(value.extensions??{}).some(n=>n!=='KHR_materials_specular'))throw new Error('Unsupported oral material extension');
  }
  json[kind]??=[];const result=json[kind].push(value)-1;copied.set(key,result);return result;
 };
 const parent=(asset,index)=>{const parents=asset.nodes.map((n,i)=>n.children?.includes(index)?i:-1).filter(i=>i>=0);if(parents.length!==1)throw new Error('Ambiguous oral node parent');return parents[0];};
 const matchNode=index=>{
  const node=donor.nodes[index],matches=json.nodes.map((n,i)=>n.name===node.name?i:-1).filter(i=>i>=0);
  if(matches.length!==1||!near(transform(node),transform(json.nodes[matches[0]])))throw new Error(`Changed oral rig transform: ${node.name}`);
  return matches[0];
 };
 for(const materialName of mouthMaterials){
  if(json.materials.some(m=>m.name===materialName))throw new Error(`Oral mesh already exists: ${materialName}`);
  const matches=donor.nodes.map((n,i)=>({node:n,index:i,mesh:donor.meshes[n.mesh]})).filter(({mesh})=>mesh?.primitives.some(p=>donor.materials[p.material]?.name===materialName));
  if(matches.length!==1||matches[0].mesh.primitives.length!==1)throw new Error(`Ambiguous oral mesh: ${materialName}`);
  const {node,index,mesh}=matches[0],skin=donor.skins[node.skin];
  if(!skin||node.children?.length||node.extensions)throw new Error('Unsupported oral node');
  const joints=skin.joints.map(matchNode);
  for(const joint of skin.joints){const p=parent(donor,joint);if(parent(json,matchNode(joint))!==matchNode(p))throw new Error('Changed oral rig hierarchy');}
  const skins=json.skins.map((s,i)=>same(s.joints,joints)&&near(Array.from(accessorValues(original,s.inverseBindMatrices)),Array.from(accessorValues(candidate,skin.inverseBindMatrices)))?i:-1).filter(i=>i>=0);
  if(skins.length!==1)throw new Error('Changed oral inverse bind matrices');
  const targetParent=matchNode(parent(donor,index)),primitive=structuredClone(mesh.primitives[0]);
  if(primitive.extensions||mesh.extensions)throw new Error('Unsupported oral mesh extension');
  for(const attribute of Object.keys(primitive.attributes))primitive.attributes[attribute]=copy('accessors',primitive.attributes[attribute]);
  if(primitive.indices!==undefined)primitive.indices=copy('accessors',primitive.indices);
  for(const target of primitive.targets??[])for(const attribute of Object.keys(target))target[attribute]=copy('accessors',target[attribute]);
  primitive.material=copy('materials',primitive.material);
  const meshIndex=json.meshes.push({...structuredClone(mesh),primitives:[primitive]})-1;
  const nodeIndex=json.nodes.push({...structuredClone(node),mesh:meshIndex,skin:skins[0]})-1;
  json.nodes[targetParent].children.push(nodeIndex);
  changes.push({material:materialName,vertices:json.accessors[primitive.attributes.POSITION].count});
 }
 for(const field of ['extensionsUsed','extensionsRequired'])json[field]=[...new Set([...(json[field]??[]),...(donor[field]??[])])];
 const bytes=packGlb(json,Buffer.concat(chunks));
 if(bytes.length>12*1024*1024)throw new Error('Speech asset exceeds the 12 MiB character budget');
 return {bytes,changes,addedBytes:bytes.length-originalBytes.length};
}

export function appendSpeechTargets(original,candidate) {
 const facial=appendFacialTargets(original,candidate,{names:VISEMES,skipMaterials:mouthMaterials});
 const mouths=appendMouthMeshes(facial.bytes,candidate);
 return {bytes:mouths.bytes,shapes:facial.changes,mouths:mouths.changes,addedBytes:mouths.bytes.length-original.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [original,candidate,output]=process.argv.slice(2);
 if(!output||resolve(original)===resolve(output)||resolve(candidate)===resolve(output))throw new Error('Usage: node scripts/add-speech-targets.mjs original.glb candidate.glb separate-output.glb');
 const {bytes,...receipt}=appendSpeechTargets(await readFile(original),await readFile(candidate));await writeFile(output,bytes);console.log(JSON.stringify({output,...receipt}));
}
