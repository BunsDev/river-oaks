#!/usr/bin/env node
// Reproducible local production exercise. No reference acquisition or publication.
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir,platform,arch} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {canonical} from '../shared/neighborhood/format.js';

const root=fileURLToPath(new URL('../',import.meta.url)), out=process.argv[2]&&resolve(process.argv[2]);
if(!out||process.argv.length!==3||existsSync(out))throw Error('Usage: node scripts/neighborhood-measure.mjs NEW_REPORT.json');
const temporary=mkdtempSync(join(tmpdir(),'river-oaks-neighborhood-measure-'));
const read=path=>JSON.parse(readFileSync(path));
const run=args=>{
  const start=performance.now(),result=spawnSync(process.execPath,['scripts/neighborhood.mjs','build',...args],{cwd:root,encoding:'utf8',timeout:30000});
  if(result.status!==0)throw Error(result.stderr||result.error?.message||'Candidate build failed');
  return Math.round((performance.now()-start)*100)/100;
};
const digest=path=>Object.fromEntries(readdirSync(path).sort().map(name=>[name,createHash('sha256').update(readFileSync(join(path,name))).digest('hex')]));
try{
  const candidates=[];
  for(const name of ['garden-market','garden-court']){
    const recipe=join(root,`config/neighborhoods/${name}.json`),input=read(recipe),times=[],paths=[];
    for(let i=0;i<5;i++){
      const path=join(temporary,`${name}-${i}`);paths.push(path);
      times.push(run(['--recipe',recipe,'--out',path]));
    }
    const hashes=paths.map(digest);
    if(hashes.some(value=>JSON.stringify(value)!==JSON.stringify(hashes[0])))throw Error(`${name}: fresh-process outputs differ`);
    const baseline=read(join(paths[0],'authoring.json')),architecture=read(join(paths[0],'architecture.json'));
    const edited=structuredClone(baseline.region),kept=edited.buildings[0],deleted=edited.buildings.at(-1).id;
    kept.center[0]+=.5;edited.buildings=edited.buildings.filter(b=>b.id!==deleted);
    edited.places.push({id:'authored-stop',name:'Authored gathering point',position:[input.bounds_m[0]+7,input.bounds_m[1]+7]});
    const editPath=join(temporary,`${name}-edited.json`),recipePath=join(temporary,`${name}-recipe.json`);
    writeFileSync(editPath,JSON.stringify(edited));writeFileSync(recipePath,JSON.stringify({...input,seed:`${input.seed}-production-review`}));
    const next=join(temporary,`${name}-edited`),again=join(temporary,`${name}-reroll`);
    const editMs=run(['--recipe',recipePath,'--previous',join(paths[0],'authoring.json'),'--edited',editPath,'--approve',kept.id,'--out',next]);
    run(['--recipe',recipePath,'--previous',join(next,'authoring.json'),'--out',again]);
    const result=read(join(again,'authoring.json'));
    const current=result.region.buildings.find(b=>b.id===kept.id);
    if(canonical(current)!==canonical(kept)||!result.approved.includes(kept.id)
      ||result.region.buildings.some(b=>b.id===deleted)||!result.region.places.some(p=>p.id==='authored-stop'))throw Error(`${name}: authored production edits were lost`);
    const sorted=[...times].sort((a,b)=>a-b);
    candidates.push({id:name,input:{streetGuides:input.streets.length,templates:input.templates.length,reservations:input.reserved.length},output:{...architecture.counts,roads:baseline.region.roads.length,blocks:baseline.blocks.length,parcels:baseline.region.parcels.length},
      full_cli_ms:times,median_cli_ms:sorted[2],edit_and_approval_cli_ms:editMs,all_export_bytes_identical:true,artifact_sha256:baseline.sha256,
      files:hashes[0],preserved:{movedBuilding:kept.id,approval:kept.id,deletedBuilding:deleted,addedPlace:'authored-stop',subsequentRegeneration:true}});
  }
  const report={schema_version:1,createdAt:new Date().toISOString(),environment:{node:process.version,platform:platform(),arch:arch()},candidates,
    scope:'Five fresh-process CLI builds per preset, complete byte identity, and an edit/approve/add/delete/regenerate exercise. Timings include process startup and local writes under current machine load. Counts quantify automated output from authored controls; no human time-saving, visual quality, network, deployment or device-performance claim.'};
  writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,candidates:candidates.map(c=>({id:c.id,median_cli_ms:c.median_cli_ms,...c.output}))}));
}finally{rmSync(temporary,{recursive:true,force:true});}
