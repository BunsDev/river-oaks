import { createHash } from 'node:crypto';
import { inspectCharacterAsset } from '../scripts/character-assets-audit.mjs';
import { CHARACTER_RIG_REQUIREMENTS } from '../preview/src/character-compatibility.js';
import { makeLikenessFixture } from './character-likeness-fixture.js';

const requireValue=(condition,reason)=>{if(!condition)throw new TypeError(reason);};
export const likenessDigest=bytes=>createHash('sha256').update(bytes).digest('hex');
const allowedDigest=likenessDigest(makeLikenessFixture());
const fields=(value,keys)=>requireValue(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k)), 'unsupported field');
const array=(value,max,reason)=>requireValue(Array.isArray(value)&&value.length>0&&value.length<=max,reason);

// Bounded fixture envelope only; not a general upload parser or malware scanner.
export function inspectLikenessFixture(bytes) {
  requireValue(Buffer.isBuffer(bytes)&&bytes.length<=65536,'fixture size');
  requireValue(bytes.length>=28&&bytes.toString('ascii',0,4)==='glTF'&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,'invalid GLB');
  const length=bytes.readUInt32LE(12);
  requireValue(length%4===0&&length<=bytes.length-28&&bytes.readUInt32LE(16)===0x4e4f534a,'invalid GLB chunks');
  const g=JSON.parse(bytes.toString('utf8',20,20+length));
  fields(g,['asset','extensionsUsed','extensionsRequired','scene','scenes','nodes','skins','meshes','materials','images','textures','buffers','bufferViews','accessors']);
  fields(g.asset,['version']);
  for(const key of ['extensionsUsed','extensionsRequired'])requireValue(Array.isArray(g[key])&&g[key].length===1&&g[key][0]==='EXT_texture_webp','unsupported extension');
  array(g.buffers,1,'buffer limit');for(const b of g.buffers)fields(b,['byteLength']);
  array(g.bufferViews,16,'buffer view limit');for(const v of g.bufferViews)fields(v,['buffer','byteOffset','byteLength']);
  array(g.accessors,6,'accessor limit');for(const a of g.accessors){fields(a,['bufferView','componentType','count','type','min','max']);requireValue(Number.isSafeInteger(a.count)&&a.count>0&&a.count<=384,'polygon/accessor budget');}
  array(g.nodes,64,'scene node limit');array(g.scenes,1,'scene limit');
  requireValue(g.scene===0,'scene selection');fields(g.scenes[0],['nodes']);array(g.scenes[0].nodes,1,'scene roots');
  for(const n of g.nodes)fields(n,['name','children','mesh','skin','translation','rotation','scale','matrix']);
  const seen=new Set();
  function visit(index) {
    requireValue(Number.isSafeInteger(index)&&index>=0&&index<g.nodes.length&&!seen.has(index),'invalid scene graph');
    seen.add(index);const n=g.nodes[index];
    if(n.children!==undefined){array(n.children,63,'scene children');for(const child of n.children)visit(child);}
  }
  g.scenes[0].nodes.forEach(visit);requireValue(seen.size===g.nodes.length,'disconnected scene graph');
  array(g.skins,1,'skeleton limit');fields(g.skins[0],['joints','inverseBindMatrices']);
  requireValue(g.skins[0].joints?.length===CHARACTER_RIG_REQUIREMENTS['man-casual'].jointCount,'skeleton joint limit');
  array(g.meshes,1,'mesh limit');fields(g.meshes[0],['primitives']);array(g.meshes[0].primitives,1,'primitive limit');
  const primitive=g.meshes[0].primitives[0];fields(primitive,['attributes','indices','material','mode']);fields(primitive.attributes,['POSITION','JOINTS_0','WEIGHTS_0','TEXCOORD_0']);
  const uv=g.accessors[primitive.attributes.TEXCOORD_0];
  requireValue(uv?.count===3&&uv.type==='VEC2'&&uv.componentType===5126,'invalid texture coordinates');
  requireValue(g.accessors[primitive.indices]?.count<=384,'polygon budget');
  array(g.materials,1,'material limit');fields(g.materials[0],['pbrMetallicRoughness']);fields(g.materials[0].pbrMetallicRoughness,['baseColorTexture']);fields(g.materials[0].pbrMetallicRoughness.baseColorTexture,['index']);
  array(g.textures,1,'texture limit');fields(g.textures[0],['extensions']);fields(g.textures[0].extensions,['EXT_texture_webp']);fields(g.textures[0].extensions.EXT_texture_webp,['source']);
  requireValue(g.textures[0].extensions.EXT_texture_webp.source===0,'invalid texture source');
  array(g.images,1,'texture limit');fields(g.images[0],['bufferView','mimeType']);
  const sha256=likenessDigest(bytes),asset={id:'man-casual',bytes:bytes.length,sha256};
  const receipt={...asset,path:'/assets/characters/man-casual.glb',license:'CC0-1.0'};
  const report=inspectCharacterAsset({bytes,asset,receipt});
  requireValue(report.triangles<=128,'polygon budget');
  requireValue(report.textures.every(t=>t.width===1&&t.height===1),'texture budget');
  requireValue(sha256===allowedDigest,'fixture not allowlisted');
  return report;
}
