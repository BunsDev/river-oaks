import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLatestCharacter } from '../src/character-studio-loading.js';
test('failed superseded load continues the latest selection',async()=>{
  let wanted={appearanceId:'a'},fail;const accepted=[],errors=[];
  const running=loadLatestCharacter({getWanted:()=>wanted,isDisposed:()=>false,
    load:definition=>definition.appearanceId==='a'?new Promise((_,reject)=>{fail=reject;}):Promise.resolve('b-avatar'),
    discard:()=>{},accept:(avatar,definition)=>accepted.push([avatar,definition.appearanceId]),onError:()=>errors.push('error')});
  wanted={appearanceId:'b'};fail(new Error('old request failed'));await running;
  assert.deepEqual(accepted,[['b-avatar','b']]);assert.deepEqual(errors,[]);
});
test('closed preview discards a late success without accepting it',async()=>{
  let disposed=false,resolve;const disposedAssets=[],accepted=[];
  const running=loadLatestCharacter({getWanted:()=>({appearanceId:'a'}),isDisposed:()=>disposed,load:()=>new Promise(done=>{resolve=done;}),discard:value=>disposedAssets.push(value),accept:value=>accepted.push(value),onError:()=>{}});
  disposed=true;resolve('avatar');await running;assert.deepEqual(disposedAssets,['avatar']);assert.deepEqual(accepted,[]);
});
