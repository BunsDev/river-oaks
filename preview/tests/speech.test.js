import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechQueue, voiceFor } from '../src/speech.js';

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
