import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createCharacterMetrics} from '../character-metrics.js';
import {createCharacterRoutes} from '../character-routes.js';
import {createMemoryCharacterStore} from '../character-store.js';
import {customizedCharacterDefinition} from '../../preview/src/character-customization.js';
test('real character routes count attempt results without retaining draft or identity fields',async t=>{
 const output=[],metrics=createCharacterMetrics({enabled:true,intervalMs:0,emit:value=>output.push(value)}),store=createMemoryCharacterStore();let enabled=true;
 const identity=async()=>({userId:'private-owner'}),definition=customizedCharacterDefinition('private-owner','sable-human',{palette:'rose'});
 const server=createServer(async(req,res)=>{const handler=createCharacterRoutes({enabled,metrics,store,approvedIdentity:identity,authorized:identity,allowRead:()=>true,allowWrite:()=>true});if(!await handler(req,res,new URL(req.url,'http://localhost').pathname)){res.writeHead(404);res.end();}});
 t.after(async()=>{metrics.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 const send=(path,body)=>fetch(base+path,{method:body===undefined?'GET':path.endsWith('/draft')?'PUT':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.equal((await send('/api/character')).status,200);
 assert.equal((await send('/api/character/draft',{definition,expectedVersion:0,requestId:'private-request'})).status,200);
 assert.equal((await send('/api/character/draft',{definition,expectedVersion:0,requestId:'private-conflict'})).status,409);
 assert.equal((await send('/api/character/publish',{expectedVersion:1,requestId:'private-publish'})).status,200);
 enabled=false;assert.equal((await send('/api/character/rollback',{revision:1,expectedVersion:2,requestId:'private-rollback'})).status,503);
 metrics.flush();assert.equal(output.length,1);
 assert.deepEqual(output[0].counts.map(({operation,outcome,count})=>({operation,outcome,count})),[
  {operation:'read',outcome:'success',count:1},{operation:'save',outcome:'success',count:1},{operation:'save',outcome:'conflict',count:1},{operation:'publish',outcome:'success',count:1},{operation:'rollback',outcome:'paused',count:1},
 ]);assert.doesNotMatch(JSON.stringify(output),/private|rose|sable|requestId|ownerId|definition/);
});
