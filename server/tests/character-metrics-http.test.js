import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {createCharacterMetrics} from '../character-metrics.js';
import {observeCharacterResponse} from '../character-metrics-http.js';
test('real HTTP completion counts success, conflict, pause and abort once without private fields',async t=>{
 const output=[],metrics=createCharacterMetrics({enabled:true,intervalMs:0,emit:value=>output.push(value)});
 let aborted;const sawAbort=new Promise(resolve=>{aborted=resolve;});
 const server=createServer((req,res)=>{
  const observation=observeCharacterResponse(res,'save',metrics,{now:()=>0});
  if(req.url==='/abort'){res.once('close',aborted);res.writeHead(200);res.write('waiting');return;}
  if(req.url==='/paused')observation.outcome('paused');
  res.writeHead(req.url==='/conflict'?409:req.url==='/paused'?503:200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({privateDefinition:'private-look',userId:'private-user',requestId:'private-request'}));
 });
 t.after(async()=>{metrics.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 for(const path of ['/success','/conflict','/paused'])await (await fetch(base+path)).text();
 await new Promise((resolve,reject)=>{const req=request(base+'/abort',res=>{res.once('data',()=>{req.destroy();resolve();});});req.on('error',reject);req.end();});
 await sawAbort;metrics.flush();assert.deepEqual(output[0].counts,[
  {operation:'save',outcome:'success',latency:'le100ms',count:1},
  {operation:'save',outcome:'conflict',latency:'le100ms',count:1},
  {operation:'save',outcome:'paused',latency:'le100ms',count:1},
  {operation:'save',outcome:'aborted',latency:'le100ms',count:1},
 ]);assert.doesNotMatch(JSON.stringify(output),/private|Definition|userId|requestId/);
});
