import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHmac} from 'node:crypto';
import {createWorkOSDeletionHandler} from '../workos-deletion.js';
import {createMemoryCharacterStore} from '../character-store.js';
import {customizedCharacterDefinition} from '../../preview/src/character-customization.js';
const secret='fixture-webhook-secret-never-used-outside-tests';
const time=1800000000000;
const event=()=>({id:'event_deleted123',event:'user.deleted',data:{object:'user',id:'user_alice',email:'private@example.invalid'},context:{},created_at:'2026-10-16T00:00:00Z'});
const signature=(body,at=time,key=secret)=>`t=${at}, v1=${createHmac('sha256',key).update(`${at}.`).update(body).digest('hex')}`;
async function fixture(t,{onDelete=async()=>{},...options}={}){
 const calls=[];const handle=createWorkOSDeletionHandler({secret,now:()=>time,onDelete:async(...args)=>{calls.push(args);await onDelete(...args);},...options});
 const server=createServer(async(req,res)=>{if(!await handle(req,res)){res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const send=({value=event(),body=JSON.stringify(value),header=signature(body),path='/api/workos/events',method='POST',contentType='application/json'}={})=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':contentType,'WorkOS-Signature':header},...(method==='GET'?{}:{body})});
 return {send,calls};
}
test('signed user deletion erases only its character account; duplicate delivery is idempotent',async t=>{
 const store=createMemoryCharacterStore(),definition=customizedCharacterDefinition('user_alice','sable-human',{palette:'rose'});
 await store.saveDraft('user_alice',definition,{expectedVersion:0,requestId:'save'});
 await store.publish('user_alice',{expectedVersion:1,requestId:'publish'});
 const f=await fixture(t,{onDelete:id=>store.deleteAccount(id)});
 assert.equal((await f.send()).status,200);const deleted=await store.get('user_alice');
 assert.equal(deleted.deleted,true);assert.equal(deleted.draft,null);assert.equal(deleted.published,null);
 assert.equal((await f.send()).status,200);assert.deepEqual(await store.get('user_alice'),deleted);
 assert.equal((await store.get('user_bob')).deleted,false);
 assert.deepEqual(f.calls,[['user_alice','event_deleted123'],['user_alice','event_deleted123']],'only the owner ID and the event ID cross the trusted callback boundary; never the email');
});
test('signature validation uses exact raw bytes and rejects stale, future, forged or ambiguous headers',async t=>{
 const f=await fixture(t),body=JSON.stringify(event());
 for(const header of ['',signature(body,time,'foreign-secret'),signature(body,time-300001),signature(body,time+300001),signature(body)+', t='+time,`t=${time},v1=00`,`t=${time}.0,v1=${'a'.repeat(64)}`])assert.equal((await f.send({body,header})).status,401);
 assert.equal((await f.send({body:body+' ',header:signature(body)})).status,401);
 assert.equal((await f.send({body:JSON.stringify(event(),null,2)})).status,200,'signed formatting is allowed without reserialization');
 assert.equal(f.calls.length,1);
});
test('unconfigured route stays closed and wrong method/query/type/oversized body never delete',async t=>{
 const disabled=await fixture(t,{secret:null});assert.equal((await disabled.send()).status,404);assert.equal(disabled.calls.length,0);
 const f=await fixture(t);
 assert.equal((await f.send({method:'GET'})).status,405);
 assert.equal((await f.send({path:'/api/workos/events?world=foreign'})).status,400);
 assert.equal((await f.send({contentType:'text/plain'})).status,415);
 assert.equal((await f.send({body:'a'.repeat(256*1024+1)})).status,413);
 assert.equal(f.calls.length,0);
});
test('only well-formed AuthKit user deletion reaches the callback; other signed events are ignored',async t=>{
 const f=await fixture(t);
 for(const value of [{...event(),event:'dsync.user.deleted'}, {...event(),event:'user.updated'}])assert.equal((await f.send({value})).status,200);
 for(const value of [null,[],{...event(),id:''},{...event(),data:{object:'user',id:'foreign'}},{...event(),data:{object:'directory_user',id:'user_alice'}},{...event(),data:{object:'user',id:'user_'+ 'a'.repeat(130)}}])assert.equal((await f.send({value})).status,400);
 assert.equal((await f.send({body:'{'})).status,400);assert.equal(f.calls.length,0);
});
test('failed deletion returns a retryable generic response, then the same delivery can finish',async t=>{
 let failed=true;const f=await fixture(t,{onDelete:async()=>{if(failed)throw new Error('private storage detail');}});
 const result=await f.send();assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/private|storage/);
 failed=false;assert.equal((await f.send()).status,200);assert.equal(f.calls.length,2);
});
test('bounded concurrent deliveries back off and recover after accepted work finishes',{timeout:10000},async t=>{
 let release,entered,count=0;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 t.after(()=>release());const f=await fixture(t,{onDelete:async()=>{if(++count===8)entered();await gate;}});
 const pending=Array.from({length:8},()=>f.send());await started;
 assert.equal((await f.send()).status,503);assert.equal(f.calls.length,8);
 release();for(const response of await Promise.all(pending))assert.equal(response.status,200);
 assert.equal((await f.send()).status,200);
});
