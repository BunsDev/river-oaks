import test from 'node:test';
import assert from 'node:assert/strict';
import { computerConfig, computerOrigin, embedId, parseChildMessage, EMBED_PROTOCOL } from '../src/office-computer-protocol.js';
import { createComputerFrame, COMPUTER_SANDBOX } from '../src/office-computer-frame.js';

const ORIGIN='https://computer.example.test';
const config=computerConfig({VITE_TYPESAFE_COMPUTER_ORIGIN:ORIGIN});
const msg=(type,instanceId,extra={})=>({protocol:EMBED_PROTOCOL,version:1,type,instanceId,...extra});

function setup(){
 const listeners=new Set(),posted=[],frames=[],mounted=[];let ids=0;
 const timers={now:0,next:1,tasks:new Map(),
  setTimeout(fn,ms){const id=this.next++;this.tasks.set(id,{fn,at:this.now+ms});return id;},
  setInterval(fn,ms){const id=this.next++;this.tasks.set(id,{fn,at:this.now+ms,every:ms});return id;},
  clearTimeout(id){this.tasks.delete(id);},clearInterval(id){this.tasks.delete(id);},
  advance(ms){const end=this.now+ms;for(;;){const due=[...this.tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;const [id,t]=due;this.now=t.at;if(t.every)t.at+=t.every;else this.tasks.delete(id);t.fn();}this.now=end;}};
 const win={addEventListener(type,fn){if(type==='message')listeners.add(fn);},removeEventListener(type,fn){if(type==='message')listeners.delete(fn);}};
 const doc={createElement(){const f={attributes:{},events:{},removed:false,src:'',contentWindow:{postMessage(message,target){posted.push({frame:f,message:structuredClone(message),target});}},
  setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){(this.events[k]??=[]).push(fn);},remove(){this.removed=true;mounted.splice(mounted.indexOf(this),1);},load(){for(const fn of this.events.load??[])fn();}};frames.push(f);return f;}};
 const mount={append(f){mounted.push(f);}};
 const states=[],closeRequests=[];
 const owner=createComputerFrame({config,mount,win,doc,timers,random:()=>`instance-${String(++ids).padStart(12,'0')}`,onChange:s=>states.push(s),onRequestClose:()=>closeRequests.push(owner.state.instanceId)});
 const deliver=(data,{origin=ORIGIN,source=owner.frame?.contentWindow}={})=>{for(const fn of [...listeners])fn({origin,source,data});};
 const status=(state,sync='none',extra={})=>deliver(msg('status',owner.state.instanceId,{state,sync,...extra}));
 return {owner,listeners,posted,frames,mounted,timers,deliver,status,states,closeRequests};
}

test('configuration accepts one exact public HTTPS origin and nothing else', () => {
 assert.equal(computerConfig({}),null,'missing configuration loads nothing');
 assert.equal(computerConfig({VITE_TYPESAFE_COMPUTER_ORIGIN:'off'}),null,'disabled configuration loads nothing');
 for(const bad of ['http://computer.example.test','https://computer.example.test/app','https://computer.example.test/?a=1','https://computer.example.test/#x','https://user:pw@computer.example.test',' https://computer.example.test','javascript:alert(1)','https://COMPUTER.example.test','https://computer.example.test:443','not a url'])
  assert.equal(computerConfig({VITE_TYPESAFE_COMPUTER_ORIGIN:bad}),null,bad);
 assert.deepEqual(computerConfig({VITE_TYPESAFE_COMPUTER_ORIGIN:`${ORIGIN}/`}),{origin:ORIGIN,frameURL:`${ORIGIN}/?embed=place`,signInURL:`${ORIGIN}/api/auth/login`,openURL:`${ORIGIN}/`});
 const loopback='http://127.0.0.1:4310';
 assert.equal(computerConfig({VITE_TYPESAFE_COMPUTER_ORIGIN:loopback,DEV:true}),null,'loopback needs the explicit test flag');
 assert.equal(computerConfig({VITE_TYPESAFE_COMPUTER_ORIGIN:loopback,VITE_TYPESAFE_COMPUTER_TEST_LOOPBACK:'1'}),null,'and a development build');
 assert.equal(computerConfig({VITE_TYPESAFE_COMPUTER_ORIGIN:loopback,DEV:true,VITE_TYPESAFE_COMPUTER_TEST_LOOPBACK:'1'}).origin,loopback);
 assert.equal(computerOrigin('http://example.test:80',{allowLoopback:true}),null,'only loopback hosts get the exception');
});

test('child messages must match the exact five-message shapes', () => {
 const id='instance-000000000001',request='request-000000000001';
 assert.deepEqual(parseChildMessage(msg('status',id,{state:'usable',sync:'saved'})),{type:'status',instanceId:id,state:'usable',sync:'saved'});
 assert.equal(parseChildMessage(msg('status',id,{state:'usable',sync:'saved',note:'secret'})),null,'extra fields such as document text are refused');
 assert.equal(parseChildMessage({...msg('status',id,{state:'usable',sync:'saved'}),version:2}),null,'unsupported version');
 assert.equal(parseChildMessage(msg('status',id,{state:'error',sync:'none'})),null,'an error names a bounded code');
 assert.equal(parseChildMessage(msg('status',id,{state:'usable',sync:'none',code:'auth-failed'})),null,'only errors carry a code');
 assert.equal(parseChildMessage(msg('status',id,{state:'ready',sync:'none'})),null,'unknown state');
 assert.equal(parseChildMessage(msg('status','short',{state:'usable',sync:'none'})),null,'bounded instance ids');
 assert.equal(parseChildMessage(msg('init',id)),null,'a child cannot send parent messages');
 assert.equal(parseChildMessage(msg('prepare-close',id,{requestId:request})),null);
 assert.equal(parseChildMessage(msg('close-result',id,{requestId:request,result:'ready'})),null,'ready says what was resolved');
 assert.equal(parseChildMessage(msg('close-result',id,{requestId:request,result:'cancelled',persistence:'saved'})),null,'only ready reports persistence');
 assert.deepEqual(parseChildMessage(msg('close-result',id,{requestId:request,result:'ready',persistence:'local'})),{type:'close-result',instanceId:id,requestId:request,result:'ready',persistence:'local'});
 assert.equal(parseChildMessage(msg('request-close',id,{url:'https://evil.test'})),null,'no URLs or commands');
 assert.equal(parseChildMessage([msg('request-close',id)]),null);
 assert.equal(parseChildMessage(Object.assign(new (class Message {})(),msg('request-close',id))),null,'plain data only');
 assert.equal(parseChildMessage(JSON.stringify(msg('request-close',id))),null);
});

test('the frame is created lazily, once, with the reviewed sandbox and an exact target origin', () => {
 const t=setup();
 assert.equal(t.frames.length,0,'nothing loads before the Computer tab opens');
 t.owner.open();t.owner.open();
 assert.equal(t.frames.length,1,'repeat opens keep one frame');assert.equal(t.mounted.length,1);
 const [frame]=t.frames;
 assert.equal(frame.src,`${ORIGIN}/?embed=place`);assert.equal(frame.attributes.sandbox,COMPUTER_SANDBOX);
 assert.doesNotMatch(COMPUTER_SANDBOX,/allow-top-navigation|allow-modals|allow-downloads/);
 assert.match(frame.attributes.allow,/microphone 'none'/);assert.equal(frame.attributes.referrerpolicy,'no-referrer');
 frame.load();
 assert.deepEqual(t.posted.map(p=>[p.message,p.target]),[[msg('init',t.owner.state.instanceId),ORIGIN]],'init carries only the protocol, version and instance');
 t.timers.advance(2000);assert.equal(t.posted.length,3,'init repeats until Computer answers');
 t.status('loading');t.timers.advance(5000);assert.equal(t.posted.length,3,'the first valid status ends the repeats');
 assert.equal(t.owner.state.state,'loading');
});

test('only the active frame’s exact origin, window and instance change state', () => {
 const t=setup();t.owner.open();t.frames[0].load();const id=t.owner.state.instanceId;
 t.deliver(msg('status',id,{state:'usable',sync:'saved'}),{origin:'https://evil.test'});
 t.deliver(msg('status',id,{state:'usable',sync:'saved'}),{source:{}});
 t.deliver(msg('status','instance-999999999999',{state:'usable',sync:'saved'}));
 t.deliver({...msg('status',id,{state:'usable',sync:'saved'}),extra:1});
 assert.equal(t.owner.state.state,'loading','forged, foreign, stale and malformed messages are ignored');
 t.status('account-confirmation');assert.equal(t.owner.state.state,'account-confirmation','Computer’s own account gate precedes use');
 t.status('usable','saved');assert.deepEqual([t.owner.state.state,t.owner.state.sync],['usable','saved']);
});

test('a replaced instance is fenced: its late messages cannot revive, close or ready the new frame', async () => {
 const t=setup();t.owner.open();t.frames[0].load();const old={id:t.owner.state.instanceId,source:t.frames[0].contentWindow};
 t.status('usable','pending');
 t.owner.destroy();assert.equal(t.listeners.size,0,'destroy removes the message listener');assert.equal(t.frames[0].removed,true);
 t.owner.open();t.frames[1].load();
 assert.notEqual(t.owner.state.instanceId,old.id,'each frame gets a fresh instance');
 t.deliver(msg('status',old.id,{state:'usable',sync:'saved'}),{source:old.source});
 t.deliver(msg('status',old.id,{state:'usable',sync:'saved'}),{source:t.frames[1].contentWindow});
 t.deliver(msg('request-close',old.id),{source:old.source});
 assert.equal(t.owner.state.state,'loading','the new frame still waits for its own account gate');assert.equal(t.closeRequests.length,0);
 t.status('usable','saved');const departing=t.owner.depart();const request=t.posted.at(-1).message.requestId;
 t.deliver(msg('close-result',old.id,{requestId:request,result:'ready',persistence:'saved'}),{source:t.frames[1].contentWindow});
 assert.equal(t.owner.state.state,'closing','a close result for another instance is ignored');
 t.deliver(msg('close-result',t.owner.state.instanceId,{requestId:request,result:'ready',persistence:'saved'}));
 assert.deepEqual(await departing,{outcome:'ready',persistence:'saved'});
});

test('sign-in, errors and load timeouts remove the frame and leave a retryable state', () => {
 const t=setup();t.owner.open();t.frames[0].load();
 t.status('signin-required');
 assert.deepEqual([t.owner.state.state,t.owner.state.mounted],['signin',false],'sign-in happens top-level, not in a hidden frame');
 t.owner.open();t.frames[1].load();t.status('error','none',{code:'account-load-failed'});
 assert.deepEqual([t.owner.state.state,t.owner.state.code,t.owner.state.mounted],['failed','account-load-failed',false]);
 t.owner.open();t.frames[2].load();t.timers.advance(15000);
 assert.deepEqual([t.owner.state.state,t.owner.state.code,t.owner.state.mounted],['failed','timeout',false],'a frame that never answers (denied framing) times out');
 assert.equal(t.timers.tasks.size,0,'no timers outlive the frame');
 t.owner.open();assert.equal(t.mounted.length,1,'retry creates exactly one fresh frame');
});

test('departure before Computer is usable removes the frame at once; usable Computer decides the save', async () => {
 const t=setup();t.owner.open();t.frames[0].load();t.status('account-confirmation');
 assert.deepEqual(await t.owner.depart(),{outcome:'ready',persistence:null});
 assert.equal(t.posted.some(p=>p.message.type==='prepare-close'),false,'nothing to save before documents are shown');assert.equal(t.mounted.length,0);
 t.owner.open();t.frames[1].load();t.status('usable','pending');
 const first=t.owner.depart(),again=t.owner.depart();
 assert.equal(first,again,'a second close request joins the pending one');
 const prepare=t.posted.at(-1);assert.deepEqual(Object.keys(prepare.message),['protocol','version','type','instanceId','requestId']);assert.equal(prepare.target,ORIGIN);
 assert.equal(t.owner.state.mounted,true,'the frame stays while Computer decides');
 t.status('usable','saved');assert.equal(t.owner.state.state,'closing','status updates do not end the close');
 t.deliver(msg('close-result',t.owner.state.instanceId,{requestId:'request-000000000999',result:'ready',persistence:'saved'}));
 assert.equal(t.owner.state.state,'closing','a mismatched request id is ignored');
 t.deliver(msg('close-result',t.owner.state.instanceId,{requestId:prepare.message.requestId,result:'cancelled'}));
 assert.deepEqual(await first,{outcome:'cancelled'});assert.deepEqual([t.owner.state.state,t.owner.state.mounted],['usable',true],'cancel keeps editing');
});

test('attention and unanswered closes keep the frame and offer retry, resume or explicit exit', async () => {
 const t=setup();t.owner.open();t.frames[0].load();t.status('usable','failed');
 const attention=t.owner.depart();const firstRequest=t.posted.at(-1).message.requestId;
 t.deliver(msg('close-result',t.owner.state.instanceId,{requestId:firstRequest,result:'attention'}));
 assert.deepEqual(await attention,{outcome:'attention'});assert.deepEqual([t.owner.state.state,t.owner.state.mounted],['attention',true]);
 const retry=t.owner.depart();const secondRequest=t.posted.at(-1).message.requestId;assert.notEqual(secondRequest,firstRequest);
 t.timers.advance(8000);
 assert.deepEqual(await retry,{outcome:'timeout'});assert.deepEqual([t.owner.state.state,t.owner.state.mounted],['unconfirmed',true],'a timeout is not a save');
 t.deliver(msg('close-result',t.owner.state.instanceId,{requestId:secondRequest,result:'ready',persistence:'saved'}));
 assert.deepEqual([t.owner.state.state,t.owner.state.mounted],['unconfirmed',true],'a reply after the timeout cannot claim the close');
 t.owner.resume();assert.equal(t.owner.state.state,'usable');
 t.owner.destroy();assert.deepEqual([t.owner.state.state,t.owner.state.mounted,t.listeners.size,t.timers.tasks.size],['idle',false,0,0],'explicit exit removes everything');
});

test('forced teardown during a pending save does not wait for the child', async () => {
 const t=setup();t.owner.open();t.frames[0].load();t.status('usable','pending');
 const departing=t.owner.depart();
 t.owner.destroy();
 assert.deepEqual(await departing,{outcome:'destroyed'},'the pending close settles immediately');
 assert.deepEqual([t.owner.state.mounted,t.listeners.size,t.timers.tasks.size],[false,0,0]);
 assert.equal(t.frames[0].src,'about:blank');
 t.owner.destroy();assert.equal(t.mounted.length,0,'destroy is idempotent');
});

test('request-close is honoured only from a confirmed or confirming Computer', () => {
 const t=setup();t.owner.open();t.frames[0].load();const id=t.owner.state.instanceId;
 t.deliver(msg('request-close',id));assert.equal(t.closeRequests.length,0,'loading frames cannot close the desk');
 t.status('usable','saved');t.deliver(msg('request-close',id));assert.deepEqual(t.closeRequests,[id]);
});

test('once an instance has been usable, every normal departure asks Computer, whatever it reports now', async () => {
 const t=setup();t.owner.open();t.frames[0].load();t.status('usable','pending');
 t.status('account-confirmation','pending');
 const departing=t.owner.depart();
 assert.equal(t.posted.at(-1).message.type,'prepare-close','an in-desktop account switch does not skip the save decision');
 assert.equal(t.owner.state.mounted,true);
 t.deliver(msg('close-result',t.owner.state.instanceId,{requestId:t.posted.at(-1).message.requestId,result:'ready',persistence:'saved'}));
 assert.deepEqual(await departing,{outcome:'ready',persistence:'saved'});
});

test('keep working and cancel restore what Computer last reported, not an assumed usable state', async () => {
 const t=setup();t.owner.open();t.frames[0].load();t.status('usable','failed');
 const first=t.owner.depart();t.deliver(msg('close-result',t.owner.state.instanceId,{requestId:t.posted.at(-1).message.requestId,result:'attention'}));
 assert.deepEqual(await first,{outcome:'attention'});
 t.status('account-confirmation','none');assert.equal(t.owner.state.state,'attention','the held choice stays visible');
 t.owner.resume();assert.equal(t.owner.state.state,'account-confirmation');
 const second=t.owner.depart();t.deliver(msg('close-result',t.owner.state.instanceId,{requestId:t.posted.at(-1).message.requestId,result:'cancelled'}));
 assert.deepEqual(await second,{outcome:'cancelled'});assert.equal(t.owner.state.state,'account-confirmation');
 t.deliver(msg('request-close',t.owner.state.instanceId));assert.equal(t.closeRequests.length,1,'request-close follows the reported state');
});

test('instance ids do not need crypto.randomUUID, which plain-http development origins lack', () => {
 const original=crypto.randomUUID;
 try{Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});
  const a=embedId(),b=embedId();assert.match(a,/^[0-9a-f]{32}$/);assert.notEqual(a,b);}
 finally{Object.defineProperty(crypto,'randomUUID',{value:original,configurable:true,writable:true});}
});
