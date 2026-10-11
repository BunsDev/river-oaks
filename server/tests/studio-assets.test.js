import test from 'node:test';
import assert from 'node:assert/strict';
import { protectedGameAsset } from '../game-assets.js';
test('World Studio document and build chunks retain the approved-account asset gate',()=>{
  for(const path of ['/studio','/studio.html','/STUDIO.html','/%73tudio.html','/assets/studio-ab123.js','/assets/main-abc123.js'])assert.equal(protectedGameAsset(path),true,path);
});
