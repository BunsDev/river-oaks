import test from 'node:test';
import assert from 'node:assert/strict';
import {readSpeechTimings} from '../src/speech-timings.js';

import {timedWave as wave} from './helpers/timed-wave.js';

const valid={version:1,duration:.1,phonemes:[{phoneme:'ɑ',start:.01,end:.08}]};
test('speech timing parser reads UTF-8 cues from an otherwise playable PCM WAV',async()=>{
 assert.deepEqual(await readSpeechTimings(new Blob([wave(valid)])),valid.phonemes);
});
test('speech timing parser ignores absent, truncated and malformed optional metadata',async()=>{
 const truncated=wave(valid).subarray(0,-7),overflow=wave(valid);overflow.writeUInt32LE(0xffffffff,16);
 for(const bytes of [Buffer.from('ordinary legacy audio'),truncated,overflow,wave({...valid,version:2}),wave({...valid,duration:.2}),wave({...valid,phonemes:[{phoneme:'a',start:.09,end:.08}]}),wave({...valid,phonemes:[{phoneme:'a',start:0,end:.08},{phoneme:'b',start:.04,end:.09}]})])assert.deepEqual(await readSpeechTimings(new Blob([bytes])),[]);
});
