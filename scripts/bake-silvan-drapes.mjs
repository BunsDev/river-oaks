import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {silvanDrapes,silvanWaist,createSilvanDrapeDetailGeometry} from '../preview/src/silvan-drape-geometry.js';
import {bakeSkirtDetail} from './lib/skirt-detail-fit.mjs';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadCharacterRig} from '../preview/tests/helpers/character-rig.js';
import {loadResidentAvatar} from '../preview/src/avatars.js';
import {createDrapeGeometry} from '../preview/src/drape-geometry.js';
import {skinSkirt} from '../preview/src/skirt-skinning.js';
import {prepareDrapeSeatFit} from './lib/drape-seat-fit.mjs';
import {skirtContactFixture} from '../preview/tests/helpers/skirt-contact.js';

const write = process.argv.includes('--write');
if (process.argv.slice(2).some(arg => !['--write','--check'].includes(arg))) throw new Error('Use --check or --write');
const root = new URL('../',import.meta.url), data={},diagnostics={};
for(const [variant,profile,bodyName]of [['masculine','man-casual','man-casualmale_casualsuit02'],['feminine','jevica','Jevica']]){
const source = await loadCharacterRig(profile);
const previousLoad = GLTFLoader.prototype.loadAsync, previousWindow = globalThis.window, previousDocument = globalThis.document;
GLTFLoader.prototype.loadAsync = async () => ({scene:source.scene});
globalThis.window = {matchMedia:()=>({matches:false})};
globalThis.document = {createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})};
const parts=[];let avatar,detailPart;
try {
  avatar = await loadResidentAvatar(4,'remote-drape-bake',profile,{folk:false,appearanceId:'jevica',faceRecipe:{}});
  const model=avatar.rig.model,pelvis=model.getObjectByName('pelvis');model.updateWorldMatrix(true,true);
  const attachment=new THREE.Group();attachment.quaternion.copy(pelvis.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(model.getWorldQuaternion(new THREE.Quaternion())));pelvis.add(attachment);
  for (const recipe of silvanDrapes(variant)) {
    const geometry=createDrapeGeometry(recipe),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),raw=new THREE.Mesh(geometry,material);attachment.add(raw);
    const {mesh,group}=skinSkirt(raw,model.getObjectByName(bodyName),{waist:recipe.top,hem:-.17});
    const contact=skirtContactFixture(model,model.getObjectByName(bodyName),mesh),fit=prepareDrapeSeatFit(mesh,model,{waist:recipe.top,body:model.getObjectByName(bodyName)});
    parts.push({geometry,material,group,mesh,contact,fit,sourcePositions:Array.from(geometry.attributes.position.array),sourceWeights:Array.from(geometry.attributes.skinWeight.array),normals:geometry.attributes.normal.array.slice()});
  }
  const detailGeometry=createSilvanDrapeDetailGeometry(variant),detailMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const rawDetail=new THREE.Mesh(detailGeometry,detailMaterial);attachment.add(rawDetail);
  const detail=skinSkirt(rawDetail,model.getObjectByName(bodyName),{waist:silvanWaist(variant),hem:-.17});
  detailPart={geometry:detailGeometry,material:detailMaterial,group:detail.group};
  avatar.object.position.y=.55-avatar.rig.hipHeight+.025;
  for(let frame=0;frame<=144;frame++)avatar.update(frame*1000/60,'continue',false,{speed:0,distance:0,riding:true,ridingKind:'seat',seatToFloor:.55},()=>0);
  avatar.object.updateMatrixWorld(true);
  data[variant]=[];diagnostics[variant]=[];
  for(const part of parts){
    const fit=part.fit(),contact=part.contact.sample();diagnostics[variant].push({...fit,...contact});
    if((part!==parts[2]&&contact.tested<100)||contact.penetrating)throw new Error(`Drape fit failed: ${JSON.stringify({fit,contact})}`);
    data[variant].push({version:1,subdivide:false,sourcePositions:part.sourcePositions,sourceWeights:part.sourceWeights,
      positionDelta:Array.from(part.geometry.attributes.position.array,(value,i)=>Math.fround(value-part.sourcePositions[i])),
      normalDelta:Array.from(part.geometry.attributes.normal.array,(value,i)=>Math.fround(value-part.normals[i]))});
  }
  const combined=mergeGeometries(parts.map(part=>part.geometry)),rest=parts.flatMap(part=>part.sourcePositions);
  try{const fitted=bakeSkirtDetail({geometry:combined},rest,detail.mesh,{maximumOffset:.06});data[variant].push(fitted.data);diagnostics[variant].push({maximumDetailOffset:fitted.maximumDistance,vertices:detailGeometry.attributes.position.count});}
  finally{combined.dispose();}
} finally {
  if(detailPart){detailPart.group.removeFromParent();detailPart.geometry.dispose();detailPart.material.dispose();}
  for(const part of parts){part.contact?.dispose();part.group.removeFromParent();part.geometry.dispose();part.material.dispose();}avatar?.dispose();
  GLTFLoader.prototype.loadAsync=previousLoad;globalThis.window=previousWindow;globalThis.document=previousDocument;
}
}
  const packed=JSON.stringify(data,(key,value)=>{
    if(!Array.isArray(value)||typeof value[0]!=='number')return value;
    const bytes=Buffer.alloc(value.length*4);value.forEach((number,i)=>bytes.writeFloatLE(number,i*4));return bytes.toString('base64');
  });
  const output="// Generated by node scripts/bake-silvan-drapes.mjs --write.\n// Lossless Float32 data on both shipped rigs; see the adjacent receipt.\nimport {unpackMorphData} from './packed-morph-data.js';\nconst encoded = "+packed+";\nexport const SILVAN_DRAPE_MORPHS = Object.fromEntries(Object.entries(encoded).map(([variant,parts])=>[variant,parts.map(unpackMorphData)]));\n";
  const inputs={};
  for(const name of ['pnpm-lock.yaml','preview/public/assets/characters/jevica.glb','preview/public/assets/characters/jevica.sources.json','preview/src/avatars.js','preview/src/foot-placement.js','preview/src/foot-roll.js','preview/src/sole-support.js','preview/src/drape-geometry.js','preview/src/silvan-drape-geometry.js','preview/src/packed-morph-data.js','scripts/lib/skirt-detail-fit.mjs','preview/public/assets/characters/man-casual.glb','preview/public/assets/characters/sources.json','preview/src/skirt-skinning.js','preview/tests/helpers/character-rig.js','preview/tests/helpers/skirt-contact.js','scripts/lib/drape-seat-fit.mjs','scripts/bake-silvan-drapes.mjs'])inputs[name]=createHash('sha256').update(await readFile(new URL(name,root))).digest('hex');
  const receipt=JSON.stringify({version:1,provenance:'Repository-authored drape shapes; shipped rig sources/licenses in sources.json and jevica.sources.json.',command:'node scripts/bake-silvan-drapes.mjs --check',inputs,outputSha256:createHash('sha256').update(output).digest('hex'),diagnostics},null,2)+'\n';
  for(const [path,expected] of [['preview/src/silvan-drape-morph-data.js',output],['preview/src/silvan-drape-morph-receipt.json',receipt]]){
    if(write)await writeFile(new URL(path,root),expected);else if(await readFile(new URL(path,root),'utf8')!==expected)throw new Error(`Bake differs: ${path}`);
  }
  console.log(JSON.stringify({status:write?'written':'verified',diagnostics}));
