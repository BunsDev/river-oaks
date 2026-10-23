import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHARED_APPEARANCES} from '../src/shared-appearances.js';
import {isRealisticHumanRig} from '../src/character-fidelity-contract.js';
import {IPIC_SEATED_REACH} from '../src/ipic-circulation.js';
import {CAMPUS_BODY} from '../../shared/garden-campus-layout.js';

test('realistic human bundles fit unchanged campus and directional IPIC clearances',()=>{
 const receipt=JSON.parse(readFileSync(new URL('../../docs/design/garden-campus/avatar-envelope.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(receipt.looks).sort(),SHARED_APPEARANCES.map(look=>look.id).sort());
 const fixtures=SHARED_APPEARANCES.filter(look=>isRealisticHumanRig(look.rig));assert.deepEqual(fixtures.map(look=>look.id).sort(),['imani-human','morgan-human']);
 for(const {id} of fixtures){
  const look=receipt.looks[id];
  assert.ok(look.widthM/2<=CAMPUS_BODY.bodyHalfWidth&&look.heightM<=CAMPUS_BODY.height&&look.turningRadiusM<=CAMPUS_BODY.turningRadius&&look.seated.footprintRadiusM<=CAMPUS_BODY.seatedRadius,id);
  for(const [direction,limit] of Object.entries({left:IPIC_SEATED_REACH.side,right:IPIC_SEATED_REACH.side,front:IPIC_SEATED_REACH.front,back:IPIC_SEATED_REACH.back})){
   const value=look.seated[direction];assert.ok(Number.isFinite(value)&&value>=0&&value<=limit,`${id} seated ${direction}: ${value} > ${limit}`);
  }
 }
});
