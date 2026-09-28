import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechQueue, createLocalSpeech, requestLocalVoice, voiceFor } from '../src/speech.js';

test('a busy local worker defers the current line and then returns its audio', async () => {
  const requests=[], waits=[];
  const result=await requestLocalVoice({id:'local-23'},'Hello',new AbortController().signal,{
    fetcher:async(url,options)=>{
      requests.push({url,body:JSON.parse(options.body)});
      return requests.length===1
        ? new Response(null,{status:503,headers:{'Retry-After':'1'}})
        : new Response('wave',{headers:{'Content-Type':'audio/wav'}});
    },
    wait:async ms=>waits.push(ms),
  });
  assert.deepEqual(waits,[1000]);
  assert.deepEqual(requests[0],requests[1]);
  assert.equal(requests[0].url,'/v1/voice');
  assert.equal(await result.text(),'wave');
});

test('muting while the worker is busy aborts the wait without another request', async () => {
  const controller=new AbortController();let requests=0;
  await assert.rejects(requestLocalVoice({id:'local-0'},'Cancelled',controller.signal,{
    fetcher:async()=>{requests++;return new Response(null,{status:503,headers:{'Retry-After':'1'}});},
    onWaiting:()=>queueMicrotask(()=>controller.abort()),
  }),{name:'AbortError'});
  assert.equal(requests,1);
});

test('voice retries are bounded and do not retry a missing model', async () => {
  for(const [headers,expected] of [[{},1],[{'Retry-After':'1'},21]]) {
    let requests=0;
    await assert.rejects(requestLocalVoice({id:'local-0'},'Hello',new AbortController().signal,{
      fetcher:async()=>{requests++;return new Response(null,{status:503,headers});},
      wait:async()=>{},
    }),/Voice unavailable/);
    assert.equal(requests,expected);
  }
});

test('24 locals receive stable distinct neural presets with bounded speaking rates', () => {
  const voices = Array.from({length:24},(_,i)=>voiceFor({id:`local-${i}`}));
  assert.equal(new Set(voices.map(v=>v.voice)).size,24);
  assert.ok(voices.every(v=>v.speed>=0.85 && v.speed<=1.15));
  assert.deepEqual(voiceFor({id:'local-05'}),voiceFor({id:'local-05'}));
});
test('speech is opt-in and late audio cannot play after mute or conversation replacement', async () => {
  const generated = [], played = [], status = [];
  const queue = createSpeechQueue({generate: (local,text,signal)=>new Promise(resolve=>generated.push({resolve,signal,text})),play:async audio=>played.push(audio),stop(){},onStatus:s=>status.push(s)});
  await queue.speak({id:'local-0'},'silent'); assert.equal(generated.length,0);
  queue.setEnabled(true);
  const first = queue.speak({id:'local-0'},'first');
  const second = queue.speak({id:'local-1'},'second');
  assert.equal(generated[0].signal.aborted,true);
  generated[0].resolve('old'); generated[1].resolve('new');
  await Promise.all([first,second]); assert.deepEqual(played,['new']);
  const pending = queue.speak({id:'local-0'},'muted');
  queue.setEnabled(false); generated[2].resolve('late'); await pending;
  assert.deepEqual(played,['new']); assert.equal(status.at(-1),'Muted');
});
test('speech bounds text and exposes failure instead of inventing playback success', async () => {
  let length=0;const statuses=[];
  const queue=createSpeechQueue({generate:async(local,text)=>{length=text.length;throw new Error('missing model');},play:async()=>assert.fail('must not play'),stop(){},onStatus:s=>statuses.push(s)});
  queue.setEnabled(true); assert.equal(await queue.speak({id:'local-0'},'x'.repeat(1000)),false);
  assert.equal(length,480); assert.match(statuses.at(-1),/unavailable/);
});

test('playback rejection and mute release audio resources and fence late media callbacks', async t => {
  const saved = Object.fromEntries(['window','document','Audio'].map(key=>[key,globalThis[key]]));
  t.after(()=>{ for (const [key,value] of Object.entries(saved)) { if(value===undefined) delete globalThis[key]; else globalThis[key]=value; } });
  globalThis.window=new EventTarget(); globalThis.document=new EventTarget();
  let rejectPlayback=true;
  let mediaReady;
  const media=[], revoked=[];
  globalThis.Audio=class {
    constructor(src) { this.src=src; media.push(this); mediaReady?.(); }
    play() { return rejectPlayback ? Promise.reject(new DOMException('gesture required','NotAllowedError')) : Promise.resolve(); }
    pause() { this.paused=true; }
  };
  t.mock.method(URL,'createObjectURL',()=>`blob:voice-${media.length}`);
  t.mock.method(URL,'revokeObjectURL',value=>revoked.push(value));
  t.mock.method(globalThis,'fetch',async()=>new Response(new Blob(['wav']),{headers:{'Content-Type':'audio/wav'}}));
  const status=[], speech=createLocalSpeech(value=>status.push(value)); speech.setMode('kokoro');
  assert.equal(await speech.speak({id:'local-0'},'hello'),false);
  assert.equal(speech.speakingId,null);
  assert.match(status.at(-1),/Press Replay/);
  assert.equal(media[0].src,''); assert.equal(revoked.length,1);
  rejectPlayback=false;
  const ready=new Promise(resolve=>{mediaReady=resolve;});
  const active=speech.speak({id:'local-1'},'another line');
  await ready;
  const staleEnd=media[1].onended;
  assert.equal(speech.speakingId,'local-1');
  speech.setMode('off'); staleEnd();
  assert.equal(await active,false);
  assert.equal(speech.speakingId,null); assert.equal(status.at(-1),'Muted');
  assert.equal(media[1].onended,null); assert.equal(media[1].paused,true); assert.equal(revoked.length,2);
});

test('a superseded face preparation cannot attach itself or start late audio',async t=>{
 const {timedWave}=await import('./helpers/timed-wave.js');
 const saved={window:globalThis.window,document:globalThis.document};
 t.after(()=>{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();
 t.mock.method(globalThis,'fetch',async()=>new Response(timedWave({version:1,duration:.1,phonemes:[{phoneme:'a',start:0,end:.1}]}),{headers:{'Content-Type':'audio/wav'}}));
 let prepared,ready,attached=0;const reached=new Promise(r=>ready=r);
 const speech=createLocalSpeech(()=>{},{prepare:()=>new Promise(resolve=>{prepared=resolve;ready();})});speech.setMode('kokoro');
 const pending=speech.speak({id:'local-0'},'Hello');await reached;speech.setMode('off');prepared(()=>{attached++;});
 assert.equal(await pending,false);assert.equal(attached,0);assert.equal(speech.speakingId,null);
});

test('facial playback follows the audio clock and releases on mute or hidden-page suspension',async t=>{
 const {timedWave}=await import('./helpers/timed-wave.js');
 const saved=Object.fromEntries(['window','document','Audio'].map(k=>[k,globalThis[k]]));t.after(()=>{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();
 let ready;const faces=[],media=[];
 globalThis.Audio=class{constructor(){this.currentTime=.04;this.paused=true;media.push(this);ready?.();}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}};
 t.mock.method(URL,'createObjectURL',()=>`blob:timed-${media.length}`);t.mock.method(URL,'revokeObjectURL',()=>{});
 t.mock.method(globalThis,'fetch',async()=>new Response(timedWave({version:1,duration:.1,phonemes:[{phoneme:'ɑ',start:.01,end:.09}]}),{headers:{'Content-Type':'audio/wav'}}));
 const speech=createLocalSpeech(()=>{},{prepare:async()=>cues=>{
  assert.equal(cues[0].phoneme,'ɑ');const face={times:[],released:false,disposed:false,update(time){this.times.push(time);if(this.released){this.dispose();return false;}return true;},release(){this.released=true;},dispose(){this.disposed=true;}};faces.push(face);return face;
 }});
 speech.setMode('kokoro');const started=new Promise(r=>ready=r),pending=speech.speak({id:'local-0'},'Ah');await started;
 speech.update(1/60);media[0].currentTime=.075;speech.update(1/30);assert.deepEqual(faces[0].times,[.04,.075]);
 speech.setMode('off');assert.equal(faces[0].released,true);speech.update(1/60);assert.equal(faces[0].disposed,true);assert.equal(await pending,false);
 const secondReady=new Promise(r=>ready=r);speech.setMode('kokoro');const second=speech.speak({id:'local-1'},'Ah');await secondReady;window.dispatchEvent(new Event('blur'));
 assert.equal(await second,false);assert.equal(faces[1].disposed,true);assert.equal(speech.speakingId,null);assert.ok(media.every(m=>m.paused));
});

test('Jev voice uses the dedicated endpoint, no renderer key, and rejects invalid or cancelled audio',async()=>{
  const {requestJevVoice}=await import('../src/speech.js');
  const controller=new AbortController();let calls=0;
  const fetcher=async(url,options)=>{calls++;assert.equal(url,'/v1/voice/jev');assert.deepEqual(JSON.parse(options.body),{text:'My love.'});assert.deepEqual(options.headers,{'Content-Type':'application/json'});return new Response('ID3audio',{headers:{'Content-Type':'audio/mpeg'}});};
  assert.equal(await (await requestJevVoice('My love.',controller.signal,{fetcher})).text(),'ID3audio');
  controller.abort();await assert.rejects(requestJevVoice('My love.',controller.signal,{fetcher}),{name:'AbortError'});assert.equal(calls,1);
  await assert.rejects(requestJevVoice('Hello',new AbortController().signal,{fetcher:async()=>new Response('{}',{headers:{'Content-Type':'application/json'}})}));
});
