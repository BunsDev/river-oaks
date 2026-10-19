import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedWorld } from '../world.js';
import { configuredOfficeLayout } from '../offices.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';
import { OFFICE_LAYOUT_PENTHOUSE as layout } from '../../preview/src/office-layouts.js';
const data=JSON.parse(readFileSync(new URL('../../preview/public/data/district.json',import.meta.url)));
const owner=JEVICA_ADMIN_USER_IDS[0],officeId='jevica-office';
test('unset, retired and invalid office settings select only the penthouse',()=>{
  for(const value of [undefined,null,'','office-legacy-1','unknown',layout])assert.equal(configuredOfficeLayout(value),layout);
});
test('only Jevica can create invitations; invited guests enter the sole penthouse and revocation ejects them',()=>{
  for(const configured of [undefined,'office-legacy-1',layout]){
    let now=10000;const world=createSharedWorld(data,{now:()=>now,officeLayout:configured});
    for(const userId of [owner,'guest','impostor'])assert.ok(world.join({userId,name:'Jevica'}).ok);
    const send=(user,action,more={})=>{now+=2000;return world.command(user,{type:'office',officeId,action,...more});};
    const listed=send(owner,'list');assert.equal(listed.offices.length,1);
    const lobby=listed.offices[0].entrance;
    assert.equal(send('impostor','invite',{peerId:'guest'}).error,'office_owner_required');
    assert.equal(send('guest','enter').error,'office_permission_required');
    assert.ok(send(owner,'invite',{peerId:'guest'}).ok);
    now+=2000;assert.ok(world.command('guest',{type:'travel',position:lobby}).ok);
    assert.equal(send('guest','enter').office.layout,layout);
    assert.equal(send('guest','invite',{peerId:'impostor'}).error,'office_owner_required');
    assert.equal(send('guest','move',{layout:'office-legacy-1',position:[0,2],yaw:0}).error,'office_layout_stale');
    assert.ok(send(owner,'revoke',{peerId:'guest'}).ok);
    assert.equal(world.snapshot().players.find(p=>p.id==='guest').office,null);
    assert.equal(send('guest','enter').error,'office_permission_required');
  }
});
