import test from 'node:test';
import assert from 'node:assert/strict';
import { blankRegion } from '../src/region-draft.js';
import { createStudioDocument, parseRegion, STORAGE_KEY } from '../src/studio/document.js';
import { compileRegionPackage } from '../../server/region-package.js';
const storage = () => { const items=new Map();return {getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value)}; };

test('edit, undo, redo and branch preserve detached publishable regions',()=>{
  const doc=createStudioDocument(blankRegion());
  const id=doc.add('building');
  assert.equal(doc.value.buildings.length,1);
  const before=doc.value;
  doc.update(id,{east:24,north:12,width:14,depth:10,height:8,yaw:45});
  assert.equal(doc.value.buildings[0].center[0],24);
  assert.equal(before.buildings[0].center[0],-24);
  compileRegionPackage(doc.value,'Studio district');
  doc.undo();assert.deepEqual(doc.value,before);
  doc.redo();assert.equal(doc.value.buildings[0].yaw_deg,45);
  doc.undo();doc.add('tree');assert.equal(doc.canRedo,false);
  const leaked=doc.value;leaked.buildings.length=0;assert.equal(doc.value.buildings.length,1);
});

test('invalid full-footprint transforms and imports leave document/history intact',()=>{
  const doc=createStudioDocument(blankRegion()),id=doc.add('building'),before=doc.value;
  for(const patch of [{east:95},{width:500},{yaw:Infinity},{east:0,north:-20}]){
    assert.throws(()=>doc.update(id,patch));assert.deepEqual(doc.value,before);
  }
  for(const value of ['{}','null','{"schema_version":1}', ' '.repeat(131073)])assert.throws(()=>parseRegion(value));
  const dirty=blankRegion();dirty.terrain.heights_m[0]=null;assert.throws(()=>doc.replace(dirty));
  assert.deepEqual(doc.value,before);
  doc.undo();assert.equal(doc.value.buildings.length,0);
});

test('save/reopen persists only on success and protects newer-tab drafts',()=>{
  const store=storage(),a=createStudioDocument(blankRegion());a.add('tree');a.save(store);
  assert.equal(a.dirty,false);
  const b=createStudioDocument();assert.equal(b.restore(store),true);assert.deepEqual(b.value,a.value);
  a.add('building');a.save(store);b.add('place');
  assert.throws(()=>b.save(store),/another tab/i);assert.equal(b.dirty,true);
  const c=createStudioDocument();c.restore(store);assert.deepEqual(c.value,a.value);
  c.add('tree');assert.throws(()=>c.save({getItem:store.getItem,setItem(){throw Error('Storage full');}}),/Storage full/);
  assert.equal(c.dirty,true);
  assert.ok(store.getItem(STORAGE_KEY));
});

test('undo back to the saved document clears dirty, and history is bounded',()=>{
  const doc=createStudioDocument(blankRegion(),{historyLimit:3}),store=storage();doc.save(store);
  const id=doc.add('building');doc.undo();assert.equal(doc.dirty,false);doc.redo();
  for(let east=20;east<30;east++)doc.update(id,{east});
  for(let i=0;i<3;i++)assert.equal(doc.undo(),true);
  assert.equal(doc.undo(),false);
});

test('delete, arrival, rotated bounds, and metadata roundtrip use the existing contract',()=>{
  const doc=createStudioDocument(blankRegion());const id=doc.add('tree');doc.update(id,{east:14,north:15,height:7,radius:2});
  doc.update('@arrival',{east:20,north:20});
  assert.deepEqual(doc.value.spawn,[20,20]);
  const parsed=parseRegion(doc.serialize());assert.deepEqual(parsed,doc.value);
  doc.remove(id);assert.equal(doc.value.trees.length,0);doc.undo();assert.equal(doc.value.trees.length,1);
  assert.throws(()=>doc.remove('@arrival'));assert.throws(()=>doc.update('missing',{east:1}));
});

test('an imported object named arrival does not alias the editor arrival handle',()=>{
  const region=blankRegion();region.buildings.push({id:'arrival',kind:'retail',center:[24,12],size:[12,10,7],yaw_deg:0});
  const doc=createStudioDocument(region);
  assert.equal(new Set(doc.items.map(item=>item.id)).size,doc.items.length);
  doc.update('arrival',{east:30});assert.equal(doc.value.buildings[0].center[0],30);assert.deepEqual(doc.value.spawn,[0,-20]);
});

test('a corrupt saved draft remains untouched until an explicit successful save',()=>{
  const store=storage();store.setItem(STORAGE_KEY,'broken-json');
  const doc=createStudioDocument();assert.throws(()=>doc.restore(store));assert.equal(store.getItem(STORAGE_KEY),'broken-json');
  doc.replace(blankRegion());doc.add('building');doc.save(store);
  const reopened=createStudioDocument();reopened.restore(store);assert.equal(reopened.value.buildings.length,1);
});


test('road render budgets reject oversized imports without changing the draft',()=>{
  const doc=createStudioDocument(),before=doc.value;
  const tooMany=blankRegion();tooMany.roads=Array.from({length:3},(_,i)=>({id:`road-${i}`,name:'Path',kind:'footway',width_m:4,points:Array.from({length:100},(_,n)=>[n%2,0])}));
  compileRegionPackage(tooMany,'Budget fixture');
  assert.throws(()=>doc.replace(tooMany),/256 road segments/);
  const tooLong=blankRegion();tooLong.roads=[{id:'long-road',name:'Path',kind:'footway',width_m:4,points:Array.from({length:80},(_,n)=>[n%2?90:-90,n%2?90:-90])}];
  compileRegionPackage(tooLong,'Budget fixture');
  assert.throws(()=>parseRegion(JSON.stringify(tooLong)),/8192 metres/);
  assert.deepEqual(doc.value,before);assert.equal(doc.canUndo,false);
});
