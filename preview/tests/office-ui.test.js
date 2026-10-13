import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register(`data:text/javascript,${encodeURIComponent("export async function load(url, context, next) { return url.endsWith('.css') ? {format:'module',source:'',shortCircuit:true} : next(url,context); }")}`,import.meta.url);
const {createOfficeUI}=await import('../src/office-ui.js');
const {officesFor}=await import('../src/office-contract.js');
const data=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(t,{access='owner',sceneError=false,listPending=null,leavePending=null}={}){
 class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.events={};this.attributes={};this.textContent='';this.value='';this.hidden=false;this.open=false;this.classList={add(){},remove(){}};}
  append(...items){for(const i of items){i.remove();i.parent=this;this.children.push(i);}}
  replaceChildren(...items){this.children=[];this.append(...items);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(i=>i!==this);this.parent=null;}
  setAttribute(k,v){this.attributes[k]=v;}
  get options(){return this.children;}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  emit(k,e={}){for(const f of this.events[k]??[])f({target:this,preventDefault(){},stopImmediatePropagation(){},...e});}
  closest(){return null;}
  showModal(){this.open=true;}
  close(){this.open=false;this.emit('close');}
  focus(){document.activeElement=this;}
  setPointerCapture(){}
  find(id){if(this.id===id)return this;for(const c of this.children){const found=c.find(id);if(found)return found;}return null;}
 }
 const original={document:globalThis.document,window:globalThis.window,matchMedia:globalThis.matchMedia};
 const root=new Element('body'),host=new Element('div'),panelHost=new Element('div');root.append(host,panelHost);
 globalThis.document={body:root,createElement:tag=>new Element(tag),addEventListener(){},hidden:false};globalThis.window={addEventListener(){}};globalThis.matchMedia=()=>({matches:false});

 const player={id:'owner',name:'Jevica',position:[...officesFor(data)[0].entrance,0],office:null};
 const calls=[],voiceCalls=[];let pending=null,disposed=0;
 const mp={connected:true,identity:{id:'owner'},snapshot:{players:[player]},voice:{state:{available:true,status:'joined',mic:'off',pushToTalk:false},toggleJoin(){voiceCalls.push('join');},toggleMic(){voiceCalls.push('mic');},setTransmit(v){voiceCalls.push(v);}},async command(m){calls.push(m);if(m.action==='list'){if(listPending)await listPending;return {ok:true,offices:[{...officesFor(data)[0],access,requested:false,guests:[],requests:[]}]};}if(m.action==='enter'){if(pending)return pending;player.office={id:'jevica-office',position:[0,1.25],yaw:0};}if(m.action==='leave'){if(leavePending)await leavePending;player.office=null;}return {ok:true};}};
 const walking={halt(){},getPosition:()=>player.position,getPose:()=>({altitude:0}),riding:false};
 const ui=createOfficeUI({host,panelHost,renderer:{},getWorld:()=>data,getMultiplayer:()=>mp,walking,createScene(){if(sceneError)throw new Error('GPU unavailable');return {render:()=>({phase:'office',done:true}),skip(){},dispose(){disposed++;}};}});
 t.after(()=>{ui.dispose();Object.assign(globalThis,original);});
 return {ui,mp,player,calls,voiceCalls,host,setAccess:v=>{access=v;},find:id=>root.find(id),pending:p=>{pending=p;},get disposed(){return disposed;}};
}
test('lobby prompt opens a visible request dialog for an uninvited visitor',async t=>{
 const f=setup(t,{access:null});f.ui.update(6000,.016);await tick();f.find('office-nearby').emit('click');await tick();
 assert.equal(f.find('office-request-dialog').open,true);f.find('office-request-send').emit('click');await tick();assert.ok(f.calls.some(c=>c.action==='request'));assert.equal(f.ui.active,false);
});
test('office modal exposes voice and movement and returns focus/resources on revocation',async t=>{
 const f=setup(t);f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();assert.equal(f.ui.active,true);
 f.ui.update(6100,.016);f.find('office-visit').emit('keydown',{code:'KeyW'});const before=f.ui.pose.position[2];f.ui.update(6300,.1);assert.ok(f.ui.pose.position[2]<before);
 f.find('office-visit').emit('keydown',{code:'KeyY'});f.find('office-visit').emit('keydown',{code:'KeyM'});assert.ok(f.voiceCalls.includes('join'));assert.ok(f.voiceCalls.includes('mic'));
 f.mp.voice.state.pushToTalk=true;f.find('office-visit').emit('keydown',{code:'KeyM'});f.find('office-visit').emit('keyup',{code:'KeyM'});assert.deepEqual(f.voiceCalls.slice(-2),[true,false]);
 f.player.office=null;f.ui.sync([f.player],f.player.id);assert.equal(f.ui.active,false);assert.equal(f.disposed,1);assert.equal(document.activeElement,f.host);
});
test('a late entry acknowledgement cannot open an office after disconnect',async t=>{
 const f=setup(t);f.ui.update(6000,.016);await tick();let resolve;f.pending(new Promise(r=>{resolve=r;}));f.find('office-enter').emit('click');await tick();
 f.mp.connected=false;f.ui.sync([],f.player.id);resolve({ok:true});await tick();assert.equal(f.ui.active,false);
});
test('a failed scene load releases the authorized visit instead of keeping the modal locked',async t=>{
 const f=setup(t,{sceneError:true});f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();await tick();
 assert.equal(f.ui.active,false);assert.equal(f.find('office-visit').open,false);assert.ok(f.calls.some(c=>c.action==='leave'));
});

test('enter waits for the in-flight permission fetch and sends one entry command',async t=>{
 let resolve;const listPending=new Promise(r=>{resolve=r;}),f=setup(t,{listPending});
 f.ui.update(6000,.016);f.find('office-nearby').emit('click');f.find('office-nearby').emit('click');await tick();
 assert.equal(f.find('office-request-dialog').open,false);assert.equal(f.ui.active,false);
 resolve();await tick();await tick();assert.equal(f.ui.active,true);assert.equal(f.calls.filter(c=>c.action==='enter').length,1);
});
test('a failed scene is not recreated by snapshots while the leave command is pending',async t=>{
 let resolve;const leavePending=new Promise(r=>{resolve=r;}),f=setup(t,{sceneError:true,leavePending});
 f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();
 f.ui.sync([f.player],f.player.id);f.ui.sync([f.player],f.player.id);await tick();
 assert.equal(f.calls.filter(c=>c.action==='leave').length,1);assert.equal(f.find('office-visit').open,false);resolve();await tick();
});

test('an accepted request closes the request dialog and enables the elevator',async t=>{
 const f=setup(t,{access:null});f.ui.update(6000,.016);await tick();f.find('office-nearby').emit('click');await tick();assert.equal(f.find('office-request-dialog').open,true);
 f.setAccess('accepted');f.ui.update(12000,.016);await tick();f.ui.update(12001,.016);
 assert.equal(f.find('office-request-dialog').open,false);assert.equal(f.find('office-enter').disabled,false);
});
