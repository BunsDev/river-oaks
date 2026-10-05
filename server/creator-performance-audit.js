// Local CPU/resource probe, not a GPU, hosted capacity, or global readiness gate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {cpus,loadavg} from 'node:os';
import {deflateRawSync} from 'node:zlib';
import * as THREE from 'three';
import {createSharedBuildLayer} from '../preview/src/shared-build-layer.js';
import {newObjectPart,validAssembly} from '../preview/src/creator-object.js';
import {JEVICA_ACCOUNT_IDS} from '../preview/src/jevica-accounts.js';

const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1];
const assembly={name:'Maximum part resource probe',parts:Array.from({length:16},(_,i)=>({...newObjectPart(),
  shape:['box','sphere','cylinder'][i%3],material:['matte','metal','gloss','glass'][i%4],
  size:[.4,.2,.4],position:[(i%4-.5)*.4,.1+Math.floor(i/4)*.4,0]}))};
assert.ok(validAssembly(assembly));
const items=JEVICA_ACCOUNT_IDS.flatMap((ownerId,owner)=>Array.from({length:24},(_,i)=>({
  id:`build-${owner*24+i+1}`,kind:'object',finish:'rose',assembly:structuredClone(assembly),
  position:[i*6,owner*12],ground:0,yaw:0,ownerId,ownerName:'Jevica'})));
const scene=new THREE.Scene(),layer=createSharedBuildLayer(scene),start=performance.now();layer.sync(items);
const coldSyncMs=performance.now()-start,resources=layer.stats();
let meshes=0;layer.object.traverse(node=>{if(node.isMesh)meshes++;});
assert.equal(meshes,768);assert.equal(resources.materials,774);assert.equal(resources.geometries,6);
const sync=[];for(let i=0;i<100;i++){const start=performance.now();layer.sync(items);sync.push(performance.now()-start);}
const unchangedReuse=layer.stats();assert.deepEqual(unchangedReuse,resources);
const first=layer.object.children[0];let disposed=0;first.children[0].material.addEventListener('dispose',()=>disposed++);
for(let i=0;i<100;i++){
  items[0].assembly.parts[0].color=i%2?'#336699':'#663399';layer.sync(items);
  assert.deepEqual(layer.stats(),resources,'edits retain no abandoned surfaces');
}
assert.equal(disposed,1);
// Model the most expensive near-miss broadphase: overlapping roots and all
// parts tested. This intentionally exceeds real placement density.
const collider=layer.colliders[0],query=[];
for(let frame=0;frame<100;frame++){
  const start=performance.now();
  for(let player=0;player<32;player++)for(let object=0;object<48;object++)collider.contains(.2,.9,.6,.35,.9);
  query.push(performance.now()-start);
}
const serialized=Buffer.from(JSON.stringify(items));
layer.sync([]);assert.equal(layer.stats().materials,6);assert.equal(layer.colliders.length,0);
layer.dispose();assert.equal(scene.children.length,0);
const files=['preview/src/creator-object.js','preview/src/creator-object-ui.js','preview/src/shared-build-layer.js',
  'preview/src/shared-build.js','preview/src/builder-mode.js','preview/src/shared-build-ui.js','preview/src/main.js','preview/src/walking.js',
  'preview/src/world-contract.js','server/world.js','server/redis-room.js','server/design-library.js',
  'server/design-commands.js','server/app.js','server/distributed-app.js','server/creator-performance-audit.js'];
const report={createdAt:new Date().toISOString(),status:'passed',
  scope:'Synthetic Node CPU and Three scene-resource probe. No GPU timing, full district, hosted service, global latency, or physical-device acceptance.',
  machine:{node:process.version,cpu:cpus()[0]?.model,loadAverage:loadavg()},
  limits:{verifiedCreatorAccounts:2,objectsPerAccount:24,partsPerObject:16,normalMaximumNewMeshes:768,worldRootLimit:192},
  probe:{objects:items.length,parts:meshes,resources,coldSyncMs,unchangedSyncP95Ms:percentile(sync,.95),
    conservative32Player48ObjectCollisionBatchP95Ms:percentile(query,.95),
    assemblySnapshotBytes:serialized.length,assemblySnapshotDeflateLevel1Bytes:deflateRawSync(serialized,{level:1}).length,
    edits:100,unchangedSnapshots:100,replacedSurfaceDisposed:true,removedMaterials:768,disposedSceneEmpty:true},
  sha256:Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex')]))),
  gaps:['768 distinct surfaces add rendering work; full-world GPU headroom with maximum assemblies remains unverified.',
    'Hosted multi-region soak, simultaneous regional arrivals, and physical devices remain required for global readiness.']};
const output=process.argv[2]??'data/reports/creator-objects-performance.json';await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.probe,null,2));
