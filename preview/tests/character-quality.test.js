import test from 'node:test';
import assert from 'node:assert/strict';
import * as quality from '../src/character-quality.js';

test('effective graphics quality reaches subscribers without sharing mutable state',()=>{
 let observed;const remove=quality.subscribeCharacterQuality(value=>{observed=value;});
 quality.publishCharacterQuality({mode:'smooth',scale:.75,occlusion:false});
 assert.deepEqual(observed,{mode:'smooth',scale:.75,occlusion:false});
 observed.mode='sharp';assert.equal(quality.characterQualitySnapshot().mode,'smooth');
 remove();quality.publishCharacterQuality({mode:'auto',scale:1,occlusion:true});
 assert.equal(observed.scale,.75);
});
