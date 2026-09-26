import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpeechTrack,SPEECH_SHAPES} from '../src/speech-track.js';
const cues=[{phoneme:'m',start:.2,end:.3},{phoneme:'ˈ',start:.3,end:.35},{phoneme:'ɑ',start:.35,end:.5},{phoneme:'ː',start:.5,end:.55},{phoneme:'.',start:.55,end:.7},{phoneme:'f',start:1,end:1.2}];
test('speech track closes bilabials, anticipates vowels and rests through silence',()=>{
 const track=createSpeechTrack(cues);
 assert.ok(track.sample(.245).viseme_PP>.9);
 assert.ok(track.sample(.32).viseme_aa>.1,'Stress marker anticipates the following vowel');
 assert.ok(track.sample(.52).viseme_aa>.6,'Length marker sustains its vowel');
 assert.ok(track.sample(1.1).viseme_FF>.99);
 for(const time of [-1,0,.8,1.5,NaN,Infinity])assert.ok(Object.values(track.sample(time)).every(v=>v===0));
});
test('speech weights stay normalized and continuous across phoneme boundaries and replay',()=>{
 const track=createSpeechTrack(cues);let previous={...track.sample(0)};
 for(let time=.001;time<1.5;time+=.001){const weights=track.sample(time);assert.ok(Object.values(weights).reduce((a,b)=>a+b,0)<=1.0000001);for(const name of SPEECH_SHAPES){assert.ok(weights[name]>=0&&weights[name]<=1);assert.ok(Math.abs(weights[name]-previous[name])<.06);}previous={...weights};}
 const first={...track.sample(.4)};track.sample(1.4);assert.deepEqual(track.sample(.4),first,'Seeking or replaying has no accumulated drift');
});
test('speech sampling gives identical poses at 30, 60 and 120 Hz',()=>{
 const expected={...createSpeechTrack(cues).sample(.4)};
 for(const hz of [30,60,120]){const track=createSpeechTrack(cues);for(let i=0;i<.4*hz;i++)track.sample(i/hz);assert.deepEqual(track.sample(.4),expected);}
});
