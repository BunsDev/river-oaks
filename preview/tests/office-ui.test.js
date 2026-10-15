import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register(`data:text/javascript,${encodeURIComponent("export async function load(url, context, next) { return url.endsWith('.css') ? {format:'module',source:'',shortCircuit:true} : next(url,context); }")}`,import.meta.url);
const {createOfficeUI}=await import('../src/office-ui.js');
const {officesFor}=await import('../src/office-contract.js');
const {OFFICE_OCCUPIED_CLEARANCE,officeLayout,officeSeat,officeTransition}=await import('../src/office-layouts.js');
const data=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(t,{access='owner',sceneError=false,listPending=null,leavePending=null,renderPhase='office',captureStreet=()=>null,workspaces=null,layout=null,startAt=null,transitionPending=null,seatPending=null}={}){
 class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.events={};this.attributes={};this.textContent='';this.value='';this.hidden=false;this.open=false;this.classList={add(){},remove(){}};}
  append(...items){for(const i of items){i.remove();i.parent=this;this.children.push(i);}}
  replaceChildren(...items){this.children=[];this.append(...items);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(i=>i!==this);this.parent=null;}
  setAttribute(k,v){this.attributes[k]=v;}
  get options(){return this.children;}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
  emit(k,e={}){for(const f of this.events[k]??[])f({target:this,preventDefault(){},stopImmediatePropagation(){},...e});}
  checkVisibility(){return Boolean(this.visible);}
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
 const calls=[],voiceCalls=[],scenes=[],prepared=[],renders=[];let pending=null,disposed=0;
 const mp={connected:true,identity:{id:'owner'},snapshot:{players:[player]},voice:{state:{available:true,status:'joined',mic:'off',pushToTalk:false},toggleJoin(){voiceCalls.push('join');},toggleMic(){voiceCalls.push('mic');},setTransmit(v){voiceCalls.push(v);}},async command(m){calls.push(m);if(m.action==='list'){if(listPending)await listPending;return {ok:true,offices:[{...officesFor(data)[0],access,requested:false,guests:[],requests:[]}]};}if(m.action==='enter'){if(pending)return pending;player.office=layout?{id:m.officeId,layout,levelId:'jevica-office/l0',elevation:0,position:startAt??officeLayout(layout).spawn.position,yaw:0}:{id:m.officeId,position:[0,1.25],yaw:0};}
 if(m.action==='transition'){if(transitionPending)await transitionPending;const moved=officeTransition(officeLayout(player.office.layout),player.office,m.portalId);if(!moved.ok)return moved;player.office={...player.office,levelId:moved.levelId,position:moved.position,elevation:moved.elevation};return {ok:true,office:player.office};}
 if(m.action==='sit'){if(seatPending)await seatPending;const seat=officeSeat(officeLayout(player.office?.layout),m.seatId);if(!player.office||!seat)return {ok:false,error:'invalid_office_seat'};player.office={...player.office,position:[...seat.position],yaw:seat.facing,seat:{id:seat.id}};return {ok:true,office:player.office};}
 if(m.action==='stand'){const seat=officeSeat(officeLayout(player.office.layout),player.office.seat?.id);if(!seat)return {ok:false,error:'office_not_seated'};const {seat:_,...standing}=player.office;player.office={...standing,position:[...seat.stand]};return {ok:true,office:player.office};}if(m.action==='leave'){if(leavePending)await leavePending;player.office=null;}return {ok:true};}};
 if(workspaces)mp.officeDeskRequest=async(action,data)=>{calls.push({api:action,...data});if(action==='workspace/provision')return {ok:true,workspace:workspaces[0]};if(action==='workspace/list')return {ok:true,workspaces};if(action==='workspace/accept'){workspaces.find(w=>w.id===data.workspaceId).role='accepted';return {ok:true};}return {ok:true};};
 const walking={halt(){},getPosition:()=>player.position,getPose:()=>({altitude:0}),riding:false};
 const ui=createOfficeUI({host,panelHost,renderer:{},getWorld:()=>data,getMultiplayer:()=>mp,walking,captureStreet,createScene(options){scenes.push(options);if(sceneError)throw new Error('GPU unavailable');return {prepare:now=>prepared.push(now),render:(...args)=>{renders.push(args);return {phase:renderPhase,done:renderPhase==='office'};},skip(){},dispose(){disposed++;}};}});
 t.after(()=>{ui.dispose();Object.assign(globalThis,original);});
 return {ui,mp,player,calls,voiceCalls,scenes,prepared,renders,host,setAccess:v=>{access=v;},setPhase:v=>{renderPhase=v;},find:id=>root.find(id),pending:p=>{pending=p;},get disposed(){return disposed;}};
}
test('entry captures the street before acknowledgement and reset releases presentation once',async t=>{
 let captured=0;const street={camera:'original street pose'},f=setup(t,{captureStreet:()=>{captured++;return street;}});
 f.ui.update(6000,.016);await tick();let resolve;f.pending(new Promise(r=>{resolve=r;}));
 f.find('office-enter').emit('click');await tick();assert.equal(captured,1);assert.equal(f.scenes.length,0);
 f.player.office={id:'jevica-office',position:[0,1.25],yaw:0};resolve({ok:true});await tick();
 assert.equal(captured,1);assert.equal(f.scenes[0].street,street);
 f.ui.prepare(6200);assert.deepEqual(f.prepared,[6200]);f.ui.reset();f.ui.reset();f.ui.prepare(6300);
 assert.equal(f.disposed,1);assert.equal(f.ui.active,false);assert.deepEqual(f.prepared,[6200]);assert.equal(document.activeElement,f.host);
});
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
test('cancel during permission loading restores street input and never enters',async t=>{
 let resolve;const f=setup(t,{listPending:new Promise(r=>{resolve=r;})});
 f.find('office-nearby').emit('click');await tick();
 assert.equal(f.find('office-pending').open,true);assert.equal(f.ui.entering,true);
 f.find('office-entry-cancel').emit('click');assert.equal(f.ui.entering,false);assert.equal(f.find('office-pending').open,false);assert.equal(document.activeElement,f.host);
 resolve();await tick();await tick();assert.equal(f.ui.active,false);assert.equal(f.calls.some(c=>c.action==='enter'),false);
});
test('cancel during entry releases a late authorized visit without opening its scene',async t=>{
 const f=setup(t);f.ui.update(6000,.016);await tick();let resolve;
 f.pending(new Promise(r=>{resolve=r;}));f.find('office-enter').emit('click');await tick();
 f.player.office={id:'jevica-office',position:[0,1.25],yaw:0};f.find('office-pending').emit('cancel');f.ui.sync([f.player],f.player.id);assert.equal(f.ui.active,false);
 resolve({ok:true});await tick();await tick();assert.equal(f.ui.active,false);assert.equal(f.player.office,null);assert.equal(f.calls.filter(c=>c.action==='leave').length,1);
});
test('cancellation persists through an entry timeout and a delayed accepted snapshot',async t=>{
 let releaseLeave;const f=setup(t,{leavePending:new Promise(r=>{releaseLeave=r;})});f.ui.update(6000,.016);await tick();let resolve;
 f.pending(new Promise(r=>{resolve=r;}));f.find('office-enter').emit('click');await tick();f.find('office-entry-cancel').emit('click');
 resolve({ok:false,error:'timeout'});await tick();
 f.player.office={id:'jevica-office',position:[0,1.25],yaw:0};f.ui.sync([f.player],f.player.id);assert.equal(f.ui.active,false);assert.equal(f.calls.filter(c=>c.action==='leave').length,1);
 releaseLeave();await tick();f.ui.sync([f.player],f.player.id);assert.equal(f.ui.active,false);assert.equal(f.player.office,null);
 f.pending(null);f.find('office-enter').emit('click');await tick();assert.equal(f.ui.active,true,'a confirmed cancellation permits a new explicit visit');
});
for(const failure of ['rejected','exception'])test(`failed ${failure} cancellation cleanup keeps the visit closed and offers retry`,async t=>{
 const f=setup(t);f.ui.update(6000,.016);await tick();let resolve,rejectLeave=true;const command=f.mp.command.bind(f.mp);
 f.mp.command=async m=>{if(m.action==='leave'&&rejectLeave){f.calls.push(m);if(failure==='exception')throw new Error('interrupted');return {ok:false,error:'rate_limited'};}return command(m);};
 f.pending(new Promise(r=>{resolve=r;}));f.find('office-enter').emit('click');await tick();f.player.office={id:'jevica-office',position:[0,1.25],yaw:0};f.find('office-entry-cancel').emit('click');resolve({ok:true});await tick();
 f.ui.sync([f.player],f.player.id);assert.equal(f.ui.active,false);assert.equal(f.find('office-cancel-retry').hidden,false);
 rejectLeave=false;f.find('office-cancel-retry').emit('click');await tick();f.ui.sync([f.player],f.player.id);assert.equal(f.player.office,null);assert.equal(f.find('office-cancel-retry').hidden,true);
});
test('switching visiting accounts disposes the old scene and resets ownership controls',async t=>{
 const f=setup(t);f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();f.ui.update(6100,.016);assert.equal(f.find('office-access').hidden,false);
 const guest={id:'guest',name:'Guest',office:{id:'jevica-office',position:[0,4],yaw:1}};f.mp.identity={id:'guest'};f.mp.snapshot.players=[guest];f.setAccess('accepted');f.ui.sync([guest],guest.id);
 assert.equal(f.disposed,1);assert.equal(f.ui.active,true);assert.deepEqual(f.ui.pose.position,[0,1.68,-4]);assert.equal(f.ui.pose.yaw,1);assert.equal(f.find('office-access').hidden,true);assert.equal(f.find('office-management').children.length,0);
});
test('same-account reconnect completes cancelled entry without reopening a preserved visit',async t=>{
 const f=setup(t);f.ui.update(6000,.016);await tick();let resolve,fail=true;const command=f.mp.command.bind(f.mp);
 f.mp.command=async m=>{if(m.action==='leave'&&fail){f.calls.push(m);return {ok:false,error:'rate_limited'};}return command(m);};
 f.pending(new Promise(r=>{resolve=r;}));f.find('office-enter').emit('click');await tick();f.player.office={id:'jevica-office',position:[0,1.25],yaw:0};f.find('office-entry-cancel').emit('click');resolve({ok:true});await tick();
 f.mp.connected=false;f.ui.sync([],f.player.id);assert.equal(f.ui.active,false);
 fail=false;f.mp.connected=true;f.ui.sync([f.player],f.player.id);assert.equal(f.ui.active,false);await tick();f.ui.sync([f.player],f.player.id);
 assert.equal(f.player.office,null);assert.equal(f.ui.active,false);assert.equal(f.calls.filter(c=>c.action==='leave').length,2);assert.equal(f.find('office-cancel-retry').hidden,true);
});
test('a different account never inherits a previous account cancellation command',async t=>{
 const f=setup(t);f.ui.update(6000,.016);await tick();let resolve;f.pending(new Promise(r=>{resolve=r;}));f.find('office-enter').emit('click');await tick();
 const guest={id:'guest',name:'Guest',office:{id:'jevica-office',position:[0,4],yaw:1}};f.mp.identity={id:'guest'};f.mp.snapshot.players=[guest];f.ui.sync([guest],guest.id);resolve({ok:true});await tick();f.ui.sync([guest],guest.id);
 assert.equal(f.calls.some(c=>c.action==='leave'),false);assert.equal(f.ui.active,true);assert.deepEqual(f.ui.pose.position,[0,1.68,-4]);assert.equal(f.find('office-cancel-retry').hidden,true);
});
test('dragging during the elevator cannot preload an abrupt arrival camera turn',async t=>{
 const f=setup(t,{renderPhase:'ascending'});f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();f.ui.update(6100,.016);
 const dialog=f.find('office-visit');dialog.emit('pointerdown',{pointerId:1,clientX:100});dialog.emit('pointermove',{pointerId:1,clientX:200});assert.equal(f.ui.pose.yaw,0);
 f.setPhase('office');f.ui.update(6200,.016);dialog.emit('pointerdown',{pointerId:2,clientX:100});dialog.emit('pointermove',{pointerId:2,clientX:200});assert.equal(f.ui.pose.yaw,-.4);
});

test('resident provisions their office and enters it without Jevica permissions',async t=>{
 const workspace={id:'office-'+'a'.repeat(64),ownerId:'owner',role:'owner',members:[]};
 const f=setup(t,{access:null,workspaces:[workspace]});f.ui.update(6000,.016);await tick();
 assert.ok(f.find('office-personal'));f.find('office-personal').emit('click');await tick();await tick();
 assert.ok(f.calls.some(c=>c.api==='workspace/provision'));
 assert.equal(f.player.office?.id,workspace.id);assert.equal(f.ui.active,true);
 f.ui.update(6400,.1);f.ui.update(6600,.1);await tick();assert.equal(f.calls.find(c=>c.action==='move').officeId,workspace.id);
 f.find('office-exit').emit('click');await tick();assert.equal(f.player.office,null);
});

test('pending collaborator accepts explicitly before shared office entry',async t=>{
 const workspace={id:'office-'+'b'.repeat(64),ownerId:'other',role:'invited',members:[]};
 const f=setup(t,{access:null,workspaces:[workspace]});f.ui.update(6000,.016);await tick();
 const picker=f.find('office-workspace');assert.ok(picker);picker.value=workspace.id;picker.emit('change');await tick();
 assert.equal(f.find('office-enter').disabled,true);assert.equal(f.find('office-accept').hidden,false);
 f.find('office-accept').emit('click');await tick();await tick();
 assert.ok(f.calls.some(c=>c.api==='workspace/accept'&&c.workspaceId===workspace.id));
 f.find('office-nearby').emit('click');await tick();assert.equal(f.player.office?.id,workspace.id);
});


test('office discovery stays idle away from the lobby and resumes when needed',async t=>{
 const f=setup(t,{workspaces:[]});f.player.position=[9999,9999];
 f.ui.update(6000,.016);await tick();f.ui.update(12000,.016);await tick();
 assert.equal(f.calls.length,0);
 f.player.position=[...officesFor(data)[0].entrance,0];f.ui.update(18000,.016);await tick();
 assert.ok(f.calls.some(c=>c.api==='workspace/list'));
});

test('an open office panel refreshes invitations even away from the lobby',async t=>{
 const f=setup(t,{workspaces:[]});f.player.position=[9999,9999];
 f.find('office-personal').parent.visible=true;f.ui.update(6000,.016);await tick();
 assert.ok(f.calls.some(c=>c.api==='workspace/list'));
});

test('a legacy visit keeps its move commands unchanged',async t=>{
 const f=setup(t);f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();
 f.ui.update(6100,.016);f.find('office-visit').emit('keydown',{code:'KeyW'});f.ui.update(6400,.1);await tick();
 const move=f.calls.find(c=>c.action==='move');assert.ok(move);assert.deepEqual(Object.keys(move).sort(),['action','officeId','position','type','yaw']);
 assert.equal(f.find('office-level').hidden,true,'the legacy room has no stairs');
});
test('penthouse moves name their layout and floor; no stair control at the arrival',async t=>{
 const f=setup(t,{layout:'office-penthouse-1'});f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();
 f.ui.update(6100,.016);assert.equal(f.find('office-level').hidden,true,'no stair near the arrival');
 f.find('office-visit').emit('keydown',{code:'KeyW'});f.ui.update(6400,.1);await tick();
 const move=f.calls.find(c=>c.action==='move');assert.deepEqual([move.layout,move.levelId],['office-penthouse-1','jevica-office/l0']);
 assert.deepEqual(f.renders.at(-1)[4],{layoutId:'office-penthouse-1',levelId:'jevica-office/l0'});
});
test('the stair control appears within reach of the stair foot',async t=>{
 const g=setup(t,{layout:'office-penthouse-1',startAt:[11.8,4.5]});g.ui.update(7000,.016);await tick();g.find('office-enter').emit('click');await tick();
 g.ui.update(7100,.016);assert.equal(g.find('office-level').hidden,false);assert.match(g.find('office-level').textContent,/stairs up/);
});
test('taking the stairs adopts the server floor, raises the eye and renders the mezzanine',async t=>{
 const f=setup(t,{layout:'office-penthouse-1',startAt:[11.8,4.5]});f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();
 f.ui.update(6100,.016);f.find('office-level').emit('click');await tick();await tick();
 const transition=f.calls.find(c=>c.action==='transition');assert.deepEqual([transition.portalId,transition.layout],['jevica-office/l0/portal/stairs-up','office-penthouse-1']);
 f.ui.update(6200,.016);
 assert.deepEqual(f.ui.pose.position.map(v=>Math.round(v*100)/100),[11.8,5.48,-15.2]);assert.equal(f.ui.pose.ground,3.8);
 assert.deepEqual(f.renders.at(-1)[4],{layoutId:'office-penthouse-1',levelId:'jevica-office/l1'});
 assert.match(f.find('office-level').textContent,/stairs down/);
});
test('a transition answered after the visit closed changes nothing',async t=>{
 let resolve;const transitionPending=new Promise(r=>{resolve=r;}),f=setup(t,{layout:'office-penthouse-1',startAt:[11.8,4.5],transitionPending});
 f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();f.ui.update(6100,.016);
 f.find('office-level').emit('click');await tick();f.find('office-level').emit('click');await tick();
 assert.equal(f.calls.filter(c=>c.action==='transition').length,1,'one transition at a time');
 f.player.office=null;f.ui.sync([f.player],f.player.id);assert.equal(f.ui.active,false);
 resolve();await tick();await tick();assert.equal(f.ui.active,false);assert.equal(f.ui.pose,null);
});
test('at a desk chair\'s stand point Z sits; seated, walking stops, the eye lowers and the desk is offered; Z stands back up',async t=>{
 const chair=officeSeat(officeLayout('office-penthouse-1'),'desk-a1-chair');
 const f=setup(t,{layout:'office-penthouse-1',startAt:chair.stand});f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();
 f.ui.update(6100,.016);assert.equal(f.find('office-seat').hidden,false);assert.match(f.find('office-seat').textContent,/Sit down · Z/);
 f.find('office-visit').emit('keydown',{code:'KeyZ'});await tick();await tick();
 const sit=f.calls.find(c=>c.action==='sit');assert.deepEqual([sit.seatId,sit.layout,Object.keys(sit).sort()],[chair.id,'office-penthouse-1',['action','layout','officeId','seatId','type']]);
 f.ui.update(6200,.016);
 assert.deepEqual(f.ui.pose.position.map(v=>Math.round(v*100)/100),[3.65,1.2,-5.6],'seated eye at the plan seat');
 assert.match(f.find('office-seat').textContent,/Stand up · Z/);assert.equal(f.find('office-desk-nearby').hidden,false,'a desk chair offers its desk');
 assert.deepEqual(f.renders.at(-1)[4],{layoutId:'office-penthouse-1',levelId:'jevica-office/l0',seatId:chair.id});
 const moves=f.calls.filter(c=>c.action==='move').length;
 f.find('office-visit').emit('keydown',{code:'KeyW'});f.ui.update(6500,.1);f.ui.update(6800,.1);await tick();f.find('office-visit').emit('keyup',{code:'KeyW'});
 assert.equal(f.calls.filter(c=>c.action==='move').length,moves,'seated visitors send no moves');
 assert.deepEqual(f.ui.pose.position.map(v=>Math.round(v*100)/100),[3.65,1.2,-5.6]);
 f.find('office-seat').emit('click');await tick();await tick();f.ui.update(7000,.016);
 assert.ok(f.calls.some(c=>c.action==='stand'&&c.layout==='office-penthouse-1'));
 assert.deepEqual(f.ui.pose.position.map(v=>Math.round(v*100)/100),[3.65,1.68,-3.55],'standing returns to the stand point');
 assert.match(f.find('office-seat').textContent,/Sit down · Z/);
});
test('a sit answered after the visit closed changes nothing',async t=>{
 let resolve;const seatPending=new Promise(r=>{resolve=r;}),chair=officeSeat(officeLayout('office-penthouse-1'),'desk-a1-chair');
 const f=setup(t,{layout:'office-penthouse-1',startAt:chair.stand,seatPending});f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();f.ui.update(6100,.016);
 f.find('office-seat').emit('click');await tick();f.find('office-seat').emit('click');await tick();
 assert.equal(f.calls.filter(c=>c.action==='sit').length,1,'one seat command at a time');
 const visit=f.player.office;f.player.office=null;f.ui.sync([f.player],f.player.id);assert.equal(f.ui.active,false);
 f.player.office=visit;resolve();await tick();await tick();assert.equal(f.ui.pose,null,'the late reply does not reopen or reseat');
});
test('a peer\'s occupied seat is collision for prediction, and the server\'s seat is adopted from snapshots',async t=>{
 const layout=officeLayout('office-penthouse-1'),taken=officeSeat(layout,'desk-a2-chair');
 // Beside the chair's stand point, clear of it and of the seated envelope: what the server allows.
 const f=setup(t,{layout:'office-penthouse-1',startAt:[taken.position[0]+0.9,2.6]});
 f.mp.snapshot.players.push({id:'guest',name:'Guest',office:{id:'jevica-office',layout:layout.id,levelId:'jevica-office/l0',elevation:0,position:[...taken.position],yaw:taken.facing,seat:{id:taken.id}}});
 f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();f.ui.update(6100,.016);
 f.find('office-visit').emit('keydown',{code:'KeyW'});for(let i=0;i<8;i++)f.ui.update(6200+i*100,.1);f.find('office-visit').emit('keyup',{code:'KeyW'});
 const edge=taken.position[1]-Math.sqrt(OFFICE_OCCUPIED_CLEARANCE**2-0.9**2);
 assert.ok(-f.ui.pose.position[2]<=edge+1e-9,`stopped outside the seated envelope at d ${-f.ui.pose.position[2]}`);
 assert.ok(-f.ui.pose.position[2]>edge-0.3,'still walked up to it');
 // A seat the server gives this visit (another tab, a restore) is adopted, and its release too.
 const own=officeSeat(layout,'desk-a1-chair');f.player.office={...f.player.office,position:[...own.position],yaw:own.facing,seat:{id:own.id}};
 f.ui.sync(f.mp.snapshot.players,f.player.id);f.ui.update(7100,.016);
 assert.deepEqual(f.ui.pose.position.map(v=>Math.round(v*100)/100),[3.65,1.2,-5.6]);assert.match(f.find('office-seat').textContent,/Stand up/);
 const {seat:_,...standing}=f.player.office;f.player.office={...standing,position:[...own.stand]};
 f.ui.sync(f.mp.snapshot.players,f.player.id);f.ui.update(7200,.016);
 assert.deepEqual(f.ui.pose.position.map(v=>Math.round(v*100)/100),[3.65,1.68,-3.55]);
});
test('the legacy room offers no seat control',async t=>{
 const f=setup(t,{startAt:[-2.05,2.2]});f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();
 f.ui.update(6100,.016);assert.equal(f.find('office-seat').hidden,true);
 f.find('office-visit').emit('keydown',{code:'KeyZ'});await tick();assert.equal(f.calls.some(c=>c.action==='sit'),false);
});
test('an occupied chair shows Seat taken instead of offering to sit',async t=>{
 const layout=officeLayout('office-penthouse-1'),taken=officeSeat(layout,'desk-a1-chair');
 const f=setup(t,{layout:'office-penthouse-1',startAt:[taken.stand[0]+1,taken.stand[1]-0.5]});
 f.mp.snapshot.players.push({id:'guest',name:'Guest',office:{id:'jevica-office',layout:layout.id,levelId:'jevica-office/l0',elevation:0,position:[...taken.position],yaw:taken.facing,seat:{id:taken.id}}});
 f.ui.update(6000,.016);await tick();f.find('office-enter').emit('click');await tick();f.ui.update(6100,.016);
 assert.equal(f.find('office-seat').hidden,false);assert.equal(f.find('office-seat').textContent,'Seat taken');assert.equal(f.find('office-seat').disabled,true);
 f.find('office-visit').emit('keydown',{code:'KeyZ'});await tick();assert.equal(f.calls.some(c=>c.action==='sit'),false,'Z does not send a claim for a taken chair');
});
