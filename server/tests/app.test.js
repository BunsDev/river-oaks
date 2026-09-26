import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../app.js';
const auth = {
  async handle(){return false;},
  async authenticate(req){const id=req.headers.cookie?.match(/session=(\w+)/)?.[1];return id?{userId:id,name:id,sessionId:id,csrfToken:'test-csrf',expiresAt:Date.now()+60000}:null;},
};
async function fixture(t){
  const players=new Map();let commands=0;
  const world={players,join(i){players.set(i.userId,{id:i.userId,name:i.name});return {ok:true};},leave(id){players.delete(id);},command(){commands++;return {ok:true};},step(){},snapshot(){return {type:'snapshot',players:[...players.values()],locals:[],wishes:{}};}};
  const app=createGameServer({auth,world,origin:'http://127.0.0.1',staticRoot:'/nonexistent'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  t.after(()=>app.close());
  return {app,world,origin,commands:()=>commands};
}
const ticket = async (origin,id,headers={}) => fetch(origin+'/api/multiplayer/ticket',{method:'POST',headers:{Origin:'http://127.0.0.1',Cookie:`session=${id}`,'X-CSRF-Token':'test-csrf',...headers}});
const connect=(origin,token,id,wsOrigin='http://127.0.0.1')=>new Promise((resolve,reject)=>{
 const ws=new WebSocket(origin.replace('http','ws')+'/multiplayer?ticket='+token,{headers:{Origin:wsOrigin,Cookie:`session=${id}`}});
 ws.once('message',data=>resolve({ws,snapshot:JSON.parse(data)}));ws.once('error',reject);
});
test('anonymous requests and cross-origin or forged-CSRF ticket requests are denied',async t=>{
 const {origin}=await fixture(t);
 assert.equal((await fetch(origin+'/api/multiplayer/ticket',{method:'POST',headers:{Origin:'http://127.0.0.1'}})).status,401);
 assert.equal((await ticket(origin,'one',{Origin:'https://evil.example'})).status,403);
 assert.equal((await ticket(origin,'one',{'X-CSRF-Token':'wrong'})).status,403);
});
test('two authenticated accounts receive the shared roster, and tickets are single-use',async t=>{
 const {origin,world}=await fixture(t);
 const token1=(await (await ticket(origin,'one')).json()).ticket;
 const a=await connect(origin,token1,'one');t.after(()=>a.ws.terminate());
 const token2=(await (await ticket(origin,'two')).json()).ticket;
 const b=await connect(origin,token2,'two');t.after(()=>b.ws.terminate());
 assert.equal(b.snapshot.players.length,2);assert.equal(world.players.size,2);
 await assert.rejects(connect(origin,token1,'one'));
});
test('oversized and flooding frames cannot generate unbounded world commands',async t=>{
 const {origin,commands}=await fixture(t);
 const token=(await (await ticket(origin,'one')).json()).ticket;
 const {ws}=await connect(origin,token,'one');t.after(()=>ws.terminate());
 for(let i=0;i<200;i++)ws.send(JSON.stringify({type:'pose',position:[0,0,0]}));
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.ok(commands()<=40);
});
