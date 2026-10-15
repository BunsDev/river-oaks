import test from 'node:test';
import assert from 'node:assert/strict';
import { officePlayerVisible } from '../src/office-scene.js';
test('first-person office view does not render inside an overlapping body',()=>{
 const owner={id:'owner',position:[0,1.25,0]},guest={id:'guest',position:[0,1.25,0]};
 assert.equal(officePlayerVisible(owner,'owner',[0,1.25],false),true);
 assert.equal(officePlayerVisible(owner,'owner',[0,1.25],true),false);
 assert.equal(officePlayerVisible(owner,'guest',[0,1.25],true),false);
 assert.equal(officePlayerVisible(guest,'owner',[0,2.3],true),true);
});
test('peers on another floor of the penthouse stay visible even directly above or below', () => {
 const above = {id:'guest',position:[-12,18],office:{levelId:'jevica-office/l1'}};
 assert.equal(officePlayerVisible(above,'owner',[-12,18],true,'jevica-office/l0'),true);
 assert.equal(officePlayerVisible({...above,office:{levelId:'jevica-office/l0'}},'owner',[-12,18],true,'jevica-office/l0'),false);
});
