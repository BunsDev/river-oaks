import {createServer} from 'vite';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {validatePhoneEvidence} from './phone-evidence.mjs';
import {execFileSync} from 'node:child_process';
import {loadavg} from 'node:os';
import {phoneFixtureHost} from '../../../server/tests/phone-fixture-host.js';
import {captureProvenance} from '../../../scripts/character-fidelity-evidence.mjs';
import {holdBrowserLock} from '../../../scripts/browser-lock.mjs';
const directory='.runtime/character-fidelity/physical';
const host=phoneFixtureHost(execFileSync('ipconfig',['getifaddr','en0'],{encoding:'utf8'}).trim());
const deviceIndex=process.argv.indexOf('--device');
const device=deviceIndex>=0?process.argv[deviceIndex+1]:null;
const mode=process.argv.includes('--smoke')?'smoke':'physical';
if(mode==='physical'&&!device)throw Error('Pass --device with the paired CoreDevice identifier; --smoke needs no phone.');
const sha=b=>createHash('sha256').update(b).digest('hex');
const runId=randomUUID();
const keyProbe=process.cwd()+'/preview/node_modules/.fidelity-'+runId+'.key';
const client='const runId='+JSON.stringify(runId)+';\n'+String.raw`
const send=async(kind,data)=>{const response=await fetch('/__fidelity_receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId,kind,data})});if(!response.ok)throw Error('Receipt rejected '+response.status);};
const status=document.querySelector('#status');
const failures=[];addEventListener('error',event=>failures.push(String(event.message).slice(0,200)));
addEventListener('unhandledrejection',event=>failures.push(String(event.reason).slice(0,200)));
const started=performance.now();
try{
 await send('hello',{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,visibility:document.visibilityState});
 await import('/e2e/fixtures/character-fidelity.js');
 const fixture=window.fidelityFixture;
 await send('environment',{...fixture.environment,readyMs:Math.round(performance.now()-started)});
 const ids=['morgan-human','imani-human'],tiers=['off','low','standard','high'];
 if(new URL(location).searchParams.get('smoke')==='1'){
  await send('smoke',{ready:document.body.dataset.ready==='true'});
 }else{
  for(const id of ids){
   status.textContent='Loading '+id;
   await send('load',{id,cache:'First appearance load in this page; prior appearance may share material caches',result:await fixture.load(id,{realism:'off'})});
  }
  const cases=ids.flatMap(id=>tiers.map(realism=>({id,realism})));
  for(let repeat=0;repeat<2;repeat++)for(const {id,realism} of repeat?[...cases].reverse():cases)for(const count of [1,8,24]){
   if(document.visibilityState!=='visible')throw Error('Page hidden during physical sample');
   status.textContent=id+' '+realism+' x'+count+' repeat '+repeat;
   await send('frames',{id,realism,repeat,result:await fixture.frames(id,{count,realism,warmup:30,samples:120})});
  }
  for(const id of ids)for(const realism of tiers){
   status.textContent='Lifecycle '+id+' '+realism;
   const result=await fixture.cycles(id,10,{realism});
   await send('lifecycle',{id,realism,result});
   if(Object.values(result.delta).some(value=>value>0))throw Error('Physical viewport resource growth');
  }
  for(const id of ids){
   const result=await fixture.cycles(id,3,{realism:'high',portrait:true});
   await send('portraitLifecycle',{id,realism:'high',result});
   if(Object.values(result.delta).some(value=>value>0))throw Error('Physical portrait resource growth');
   for(const realism of ['off','high']){
    status.textContent='Capture '+id+' '+realism;
    await send('capture',{id,realism,result:await fixture.capture(id,{realism,expressions:realism==='high'})});
   }
  }
 }
 if(failures.length)throw Error(failures.join('; '));
 await send('done',{status:'passed',elapsedMs:Math.round(performance.now()-started),visibility:document.visibilityState});
 status.textContent='Measurement complete. This is an isolated fixture, not town or human acceptance.';
}catch(error){status.textContent='Measurement failed: '+error.message;await send('done',{status:'failed',error:String(error.message).slice(0,400),elapsedMs:Math.round(performance.now()-started)}).catch(()=>{});}
finally{window.fidelityFixture?.dispose();}
`;
const html=`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Character fidelity device fixture</title><style>body{margin:0;background:#cbd8d1}canvas{width:100vw!important;height:auto!important}#status{font:16px system-ui;padding:12px}</style><p id="status">Starting local character measurement…</p><script type="module">${client}</script>`;
await mkdir(directory,{recursive:true});
await writeFile(directory+'/private-boundary-probe.json',JSON.stringify({synthetic:true}));
const stamp=new Date().toISOString().replaceAll(':','-'), output=`${directory}/${mode}-${stamp}`;
await mkdir(output,{recursive:true});
const report={status:'running',startedAt:new Date().toISOString(),mode,method:'Paired physical iPhone Safari launch; existing standalone fidelity fixture. Fixed 1920x1080 DPR1 drawing buffer scaled to device CSS width; native 4K portrait readback. Two alternated repeats, 120 intervals and 30 warmup frames per case. No vsync modification, town, live auth or human acceptance. GPU timer may be unavailable; texture bytes are estimates, not total GPU memory.',scriptSha256:sha(await readFile(new URL(import.meta.url))),clientSha256:sha(client),gateSha256:sha(await readFile(new URL('./phone-evidence.mjs',import.meta.url))),revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),provenance:await captureProvenance(process.cwd()),loadavgStart:loadavg(),records:[]};
const save=()=>writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
let done;const complete=new Promise(resolve=>{done=resolve;});
let origin,total=0,server,timer,unlock;
try{
 unlock=await holdBrowserLock('Character fidelity physical-device fixture');
 if((await captureProvenance(process.cwd())).sha256!==report.provenance.sha256)throw Error('Inputs changed while queued');
 server=await createServer({configFile:false,envDir:output,root:process.cwd()+'/preview',server:{host,port:53117,strictPort:true,fs:{strict:true,allow:[process.cwd()+'/preview',await realpath('node_modules'),process.cwd()+'/shared'],deny:['.env','.env.*','*.{crt,pem,key,p12,pfx,cer,der}','.npmrc','.yarnrc.yml','**/.git/**','**/.runtime/**']}},plugins:[{name:'bounded-fidelity-device-receipts',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  const requestURL=new URL(req.url,'http://fixture.invalid'),path=requestURL.pathname;
  if(path==='/__fidelity_phone'&&requestURL.searchParams.get('run')!==runId){res.writeHead(403).end();return;}
  if(path==='/__fidelity_phone'&&mode==='physical'&&requestURL.searchParams.get('smoke')==='1'){res.writeHead(400).end();return;}
  if(path==='/__fidelity_phone'){res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');res.end(html);return;}
  if(path!=='/__fidelity_receipt')return next();
  if(req.method!=='POST'){res.writeHead(405).end();return;}
  if(req.headers.origin!==origin){res.writeHead(403).end();return;}
  if(mode==='physical'&&!/iPhone/.test(req.headers['user-agent']??'')){res.writeHead(403).end();return;}
  let body='';for await(const bytes of req){body+=bytes;total+=bytes.length;if(body.length>16*1024*1024||total>64*1024*1024){res.writeHead(413).end();req.destroy();return;}}
  try{
   const message=JSON.parse(body);if(message.runId!==runId)throw Error('Stale run packet');delete message.runId;if(mode==='physical'&&message.kind==='smoke')throw Error('Smoke is not physical evidence');if(!['hello','environment','load','frames','lifecycle','portraitLifecycle','capture','smoke','done'].includes(message.kind)||report.records.length>=100)throw Error('Invalid packet');
   if(message.kind==='capture'){
    if(!['morgan-human','imani-human'].includes(message.data?.id)||!['off','high'].includes(message.data?.realism))throw Error('Invalid capture identity');
    for(const [view,data] of Object.entries(message.data.result.views)){
     if(!['full','closeUp','expression-smile','expression-browRaise'].includes(view)||!data.png?.startsWith('data:image/png;base64,'))throw Error('Invalid capture view');
     const bytes=Buffer.from(data.png.split(',')[1],'base64');if(bytes.length<24||bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==3840||bytes.readUInt32BE(20)!==2160)throw Error('Invalid native PNG');
     const file=`${message.data.id}.${message.data.realism}-${view}.png`;await writeFile(`${output}/${file}`,bytes);data.png={file,bytes:bytes.length,sha256:sha(bytes),width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
    }
   }
   if(message.kind==='done'&&message.data.status==='passed')report.completeness=validatePhoneEvidence(report.records,mode);
   report.records.push({receivedAt:new Date().toISOString(),...message});await save();res.writeHead(204).end();
   if(message.kind==='done'){report.status=message.data.status;done();}
  }catch(error){res.writeHead(400).end();console.error(error.message);}
 });}}]});
 await server.listen();origin=`http://${host}:53117`;await save();console.log(JSON.stringify({mode,url:origin+'/__fidelity_phone?run='+runId,output}));
 if(mode==='smoke'){
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
  try{
   const boundary=await fetch(origin+'/@fs/'+process.cwd()+'/'+directory+'/private-boundary-probe.json');
   if(boundary.status!==403)throw Error('Private filesystem boundary failed '+boundary.status);
   report.privateBoundaryStatus=boundary.status;
   await mkdir(process.cwd()+'/preview/node_modules',{recursive:true});
   await writeFile(keyProbe,'synthetic boundary fixture');
   const privateKey=await fetch(origin+'/@fs/'+keyProbe);if(privateKey.status!==403)throw Error('Private key boundary failed '+privateKey.status);
   report.privateKeyBoundaryStatus=privateKey.status;
   for(const [name,run] of [['stale','stale-run'],['incomplete',runId]]){
    const response=await fetch(origin+'/__fidelity_receipt',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({runId:run,kind:'done',data:{status:'passed'}})});
    if(response.status!==400)throw Error(name+' completion was accepted');
   }
   const stalePage=await fetch(origin+'/__fidelity_phone?run=stale-run');if(stalePage.status!==403)throw Error('Stale page was accepted');
   report.negativeControls={stalePacket:400,incompleteCompletion:400,stalePage:403};
   const page=await browser.newPage();await page.goto(origin+'/__fidelity_phone?smoke=1&run='+runId);await Promise.race([complete,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Smoke timeout')),90000);})]);}finally{await browser.close();}
 }else{
  execFileSync('xcrun',['devicectl','device','process','launch','--device',device,'--payload-url',origin+'/__fidelity_phone?run='+runId,'--timeout','30','--json-output',`${output}/launch.json`,'com.apple.mobilesafari'],{stdio:['ignore','pipe','pipe'],timeout:40000});
  console.log('Paired Safari launch returned; waiting for bounded fixture receipts.');
  await Promise.race([complete,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Physical receipt deadline reached')),480000);})]);
 }
 if(report.status!=='passed')throw Error('Device run did not pass');
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{clearTimeout(timer);await unlink(keyProbe).catch(error=>{if(error.code!=='ENOENT')throw error;});await server?.close();unlock?.();report.finishedAt=new Date().toISOString();report.loadavgEnd=loadavg();report.inputsUnchanged=(await captureProvenance(process.cwd())).sha256===report.provenance.sha256;if(!report.inputsUnchanged){report.status='failed';report.error='Source inputs changed during run';process.exitCode=1;}await save();console.log(JSON.stringify({status:report.status,records:report.records.length,output}));}
