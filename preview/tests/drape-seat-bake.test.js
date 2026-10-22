import {verifyBakeProvenance} from '../../scripts/lib/bake-provenance.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {LYRA_DRAPE_MORPHS} from '../src/lyra-drape-morph-data.js';
import {LYRA_DRAPES,createDrapeGeometry} from '../src/drape-geometry.js';

test('Lyra layered corrective retains provenance, finite data and bounded topology',async()=>{
  const root=new URL('../../',import.meta.url),receipt=JSON.parse(await readFile(new URL('preview/src/lyra-drape-morph-receipt.json',root),'utf8'));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  await verifyBakeProvenance({root, bake: 'lyra-drape', receipt});
  assert.equal(hash(await readFile(new URL('preview/src/lyra-drape-morph-data.js',root))),receipt.outputSha256);
  assert.equal(LYRA_DRAPE_MORPHS.length,2);
  for(const [i,data]of LYRA_DRAPE_MORPHS.entries()){
    const geometry=createDrapeGeometry(LYRA_DRAPES[i]);
    try{
      assert.equal(geometry.attributes.position.count,925);
      assert.equal(data.sourcePositions.length,925*3);
      assert.equal(data.sourceWeights.length,925*4);
      assert.equal(data.positionDelta.length,data.sourcePositions.length);
      assert.equal(data.normalDelta.length,data.sourcePositions.length);
      assert(data.positionDelta.every(value=>Number.isFinite(value)&&Math.abs(value)<1.2));
      assert(data.normalDelta.every(value=>Number.isFinite(value)&&Math.abs(value)<=2));
      assert.equal(receipt.diagnostics[i].penetrating,0);
      assert(receipt.diagnostics[i].maxReconstruction<1e-6);
    }finally{geometry.dispose();}
  }
});
