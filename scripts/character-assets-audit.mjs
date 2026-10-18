import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Matrix4, Vector3, Quaternion } from 'three';
import { CHARACTER_ASSETS } from '../preview/src/character-assets.js';
import { CHARACTER_RIG_REQUIREMENTS } from '../preview/src/character-compatibility.js';

const requireValue=(condition,message)=>{if(!condition)throw new TypeError(message);};
const integer=value=>Number.isSafeInteger(value)&&value>=0;

// Audit only the bounded, embedded glTF subset shipped by this repository.
// This is a build-time gate, not an arbitrary user-upload parser or image decoder.
export function inspectCharacterAsset({bytes,asset,receipt}){
  const limits=CHARACTER_RIG_REQUIREMENTS[asset.id];requireValue(limits,'unknown rig');
  requireValue(bytes.length===asset.bytes&&createHash('sha256').update(bytes).digest('hex')===asset.sha256,'asset hash/size mismatch');
  requireValue(receipt?.id===asset.id&&receipt.path===`/assets/characters/${asset.id}.glb`&&receipt.license==='CC0-1.0'&&receipt.sha256===asset.sha256&&receipt.bytes===asset.bytes,'source receipt mismatch or unsupported license');
  requireValue(bytes.length>=28&&bytes.toString('ascii',0,4)==='glTF'&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,'invalid GLB header');
  const jsonLength=bytes.readUInt32LE(12),binaryStart=28+jsonLength;
  requireValue(jsonLength%4===0&&binaryStart<=bytes.length&&bytes.readUInt32LE(16)===0x4e4f534a&&bytes.readUInt32LE(24+jsonLength)===0x004e4942,'invalid GLB chunks');
  const gltf=JSON.parse(bytes.toString('utf8',20,20+jsonLength)),binary=bytes.subarray(binaryStart);
  requireValue(bytes.readUInt32LE(20+jsonLength)===binary.length&&gltf.asset?.version==='2.0','invalid GLB binary');
  requireValue(gltf.buffers?.length===1&&!gltf.buffers[0].uri&&integer(gltf.buffers[0].byteLength)&&gltf.buffers[0].byteLength<=binary.length&&binary.length-gltf.buffers[0].byteLength<=3,'embedded buffer required');
  const view=id=>{const v=gltf.bufferViews?.[id];requireValue(v&&v.buffer===0&&integer(v.byteOffset??0)&&integer(v.byteLength)&&(v.byteOffset??0)+v.byteLength<=gltf.buffers[0].byteLength,'invalid buffer view');return v;};
  for(let i=0;i<(gltf.bufferViews?.length??0);i++)view(i);
  const accessor=id=>{
    const a=gltf.accessors?.[id],sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},types={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
    requireValue(a&&integer(a.count)&&a.count>0&&a.count<=1000000&&!a.normalized&&sizes[a.type]&&types[a.componentType],'unsupported accessor');
    const size=sizes[a.type],[width,read]=types[a.componentType];
    const dataReader=(viewId,offset,count,elementSize,elementWidth,method)=>{
      const v=view(viewId),stride=v.byteStride??elementSize*elementWidth;
      requireValue(integer(offset)&&integer(stride)&&stride>=elementSize*elementWidth&&offset+(count-1)*stride+elementSize*elementWidth<=v.byteLength,'accessor outside buffer');
      return (i,k=0)=>binary[method]((v.byteOffset??0)+offset+i*stride+k*elementWidth);
    };
    const base=a.bufferView===undefined?()=>0:dataReader(a.bufferView,a.byteOffset??0,a.count,size,width,read),sparse=new Map();let sparseValues;
    if(a.sparse){
      const {count,indices,values}=a.sparse;requireValue(integer(count)&&count>0&&count<=a.count&&[5121,5123,5125].includes(indices?.componentType),'invalid sparse accessor');
      const [indexWidth,indexRead]=types[indices.componentType],getIndex=dataReader(indices.bufferView,indices.byteOffset??0,count,1,indexWidth,indexRead);
      sparseValues=dataReader(values.bufferView,values.byteOffset??0,count,size,width,read);let previous=-1;
      for(let i=0;i<count;i++){const index=getIndex(i);requireValue(index>previous&&index<a.count,'invalid sparse accessor index');sparse.set(index,i);previous=index;}
    }
    return {count:a.count,size,type:a.componentType,get:(i,k=0)=>sparse.has(i)?sparseValues(sparse.get(i),k):base(i,k)};
  };
  requireValue(gltf.skins?.length===1,'one shared skeleton required');
  const skin=gltf.skins[0],jointNames=skin.joints?.map(i=>gltf.nodes?.[i]?.name);
  requireValue(jointNames?.length===limits.jointCount&&skin.joints.every(integer)&&jointNames.every(name=>typeof name==='string'&&name.length>0)&&new Set(skin.joints).size===limits.jointCount&&new Set(jointNames).size===limits.jointCount&&limits.requiredBones.every(name=>jointNames.includes(name)),'incompatible skeleton');
  const binds=accessor(skin.inverseBindMatrices);requireValue(binds.size===16&&binds.type===5126&&binds.count===jointNames.length,'invalid skeleton binds');
  for(let i=0;i<binds.count;i++){const values=Array.from({length:16},(_,k)=>binds.get(i,k));requireValue(values.every(Number.isFinite)&&Math.abs(new Matrix4().fromArray(values).determinant())>1e-10,'invalid skeleton bind value');}
  const parents=new Map(),transforms=[];for(const [i,node]of gltf.nodes.entries()){
    for(const child of node.children??[]){requireValue(integer(child)&&gltf.nodes[child]&&!parents.has(child),'invalid skeleton hierarchy');parents.set(child,i);}
    for(const [key,size] of [['translation',3],['rotation',4],['scale',3],['matrix',16]])if(node[key]!==undefined)requireValue(Array.isArray(node[key])&&node[key].length===size&&node[key].every(Number.isFinite),'invalid node transform');
    requireValue(!node.matrix||!['translation','rotation','scale'].some(key=>node[key]!==undefined),'conflicting node transforms');
    const rotation=node.rotation??[0,0,0,1];requireValue(Math.abs(rotation.reduce((sum,n)=>sum+n*n,0)-1)<.001,'invalid rotation transform');
    const transform=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...rotation),new Vector3(...(node.scale??[1,1,1])));
    const e=transform.elements;requireValue(e[3]===0&&e[7]===0&&e[11]===0&&e[15]===1&&Math.abs(transform.determinant())>1e-10,'singular node transform');transforms.push(transform);
  }
  for(let i=0;i<gltf.nodes.length;i++){const seen=new Set();let current=i;while(parents.has(current)){requireValue(!seen.has(current),'cyclic skeleton hierarchy');seen.add(current);current=parents.get(current);}}
  const world=new Map(),worldTransform=i=>{if(!world.has(i))world.set(i,parents.has(i)?worldTransform(parents.get(i)).clone().multiply(transforms[i]):transforms[i]);return world.get(i);};
  for(let i=0;i<transforms.length;i++){
    const transform=worldTransform(i),e=transform.elements;
    requireValue(e.every(Number.isFinite)&&Math.abs(transform.determinant())>1e-10&&transform.getMaxScaleOnAxis()<=5&&[e[12],e[13],e[14]].every(n=>Math.abs(n)<=limits.maxCoordinate),'invalid effective node transform');
  }
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let vertices=0,triangles=0,primitives=0,maxMorphDelta=0;
  for(const [meshIndex,mesh]of gltf.meshes.entries()){
    const nodes=gltf.nodes.filter(n=>n.mesh===meshIndex);requireValue(nodes.length>0&&nodes.every(n=>n.skin===0),'mesh must share the approved skeleton');
    for(const primitive of mesh.primitives){
      requireValue((primitive.mode??4)===4,'triangle geometry required');
      const position=accessor(primitive.attributes.POSITION),joints=accessor(primitive.attributes.JOINTS_0),weights=accessor(primitive.attributes.WEIGHTS_0),indices=accessor(primitive.indices);
      requireValue(position.size===3&&position.type===5126&&joints.size===4&&[5121,5123].includes(joints.type)&&weights.size===4&&weights.type===5126&&joints.count===position.count&&weights.count===position.count,'incompatible skin attributes');
      requireValue(indices.size===1&&[5121,5123,5125].includes(indices.type)&&indices.count%3===0,'invalid triangle indices');
      for(let i=0;i<indices.count;i++)requireValue(indices.get(i)<position.count,'triangle index outside mesh');
      for(let i=0;i<position.count;i++){
        for(let k=0;k<3;k++){const p=position.get(i,k);requireValue(Number.isFinite(p)&&Math.abs(p)<=limits.maxCoordinate,'invalid position bounds');bounds.min[k]=Math.min(bounds.min[k],p);bounds.max[k]=Math.max(bounds.max[k],p);}
        let sum=0;for(let k=0;k<4;k++){requireValue(joints.get(i,k)<jointNames.length,'invalid joint index');const w=weights.get(i,k);requireValue(Number.isFinite(w)&&w>=0&&w<=1,'invalid skin weight');sum+=w;}requireValue(Math.abs(sum-1)<.001,'skin weight sum must be one');
      }
      for(const target of primitive.targets??[])for(const [semantic,id] of Object.entries(target)){
        requireValue(['POSITION','NORMAL','TANGENT'].includes(semantic),'unsupported morph semantic');
        const morph=accessor(id);requireValue(morph.size===3&&morph.type===5126&&morph.count===position.count,'incompatible morph accessor');
        for(let i=0;i<morph.count;i++)for(let k=0;k<3;k++){const delta=Math.abs(morph.get(i,k));requireValue(Number.isFinite(delta)&&delta<=(semantic==='POSITION'?.5:2.001),'invalid morph displacement');if(semantic==='POSITION')maxMorphDelta=Math.max(maxMorphDelta,delta);}
      }
      requireValue(gltf.materials?.[primitive.material],'missing mesh material');vertices+=position.count;triangles+=indices.count/3;primitives++;
    }
  }
  const height=bounds.max[1]-bounds.min[1];requireValue(height>=limits.height[0]&&height<=limits.height[1],'invalid rig height');
  const textures=(gltf.images??[]).map(image=>{
    requireValue(!image.uri&&image.mimeType==='image/webp','embedded WebP texture required');
    const v=view(image.bufferView),data=binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
    requireValue(data.length>=30&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'&&data.readUInt32LE(4)+8===data.length,'invalid texture payload');
    const format=data.toString('ascii',12,16);let width,height;
    if(format==='VP8X'){width=data.readUIntLE(24,3)+1;height=data.readUIntLE(27,3)+1;}
    else if(format==='VP8 '){requireValue(data.subarray(23,26).equals(Buffer.from([0x9d,0x01,0x2a])),'invalid texture frame');width=data.readUInt16LE(26)&0x3fff;height=data.readUInt16LE(28)&0x3fff;}
    else throw new TypeError('unsupported texture encoding');
    requireValue(width>0&&height>0&&width<=limits.maxTextureSize&&height<=limits.maxTextureSize,'texture dimensions exceed catalog limits');
    return {name:image.name,width,height,bytes:data.length,rgba8Bytes:width*height*4};
  });
  requireValue(textures.length>0,'missing textures');
  for(const texture of gltf.textures??[]){const source=texture.extensions?.EXT_texture_webp?.source??texture.source;requireValue(integer(source)&&textures[source],'missing texture source');}
  for(const material of gltf.materials){
    const slots=[material.normalTexture,material.occlusionTexture,material.emissiveTexture,material.pbrMetallicRoughness?.baseColorTexture,material.pbrMetallicRoughness?.metallicRoughnessTexture,material.extensions?.KHR_materials_specular?.specularTexture,material.extensions?.KHR_materials_specular?.specularColorTexture];
    for(const slot of slots.filter(Boolean))requireValue(integer(slot.index)&&gltf.textures?.[slot.index],'missing material texture');
  }
  return {id:asset.id,bytes:bytes.length,sha256:asset.sha256,license:receipt.license,family:limits.family,joints:jointNames.length,primitives,vertices,triangles,bounds,maxMorphDelta,textures,rgba8TextureBytes:textures.reduce((sum,t)=>sum+t.rgba8Bytes,0)};
}

export async function auditCharacterAssets({root=new URL('../',import.meta.url)}={}){
  const assets=[];
  for(const asset of Object.values(CHARACTER_ASSETS)){
    const bytes=await readFile(new URL(`preview/public/assets/characters/${asset.id}.glb`,root));
    const source=JSON.parse(await readFile(new URL(`preview/public${asset.receipt}`,root),'utf8'));
    const receipt=source.files?.find(file=>file.id===asset.id)??source;
    assets.push(inspectCharacterAsset({bytes,asset,receipt}));
  }
  return {schemaVersion:1,scope:'Pinned base rigs and embedded texture headers; not decoded image, procedural overlay, pose, GPU or physical-device acceptance',assets};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await auditCharacterAssets(),null,2));
