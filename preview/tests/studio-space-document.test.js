import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioDocument, parseRegion } from '../src/studio/document.js';
import { createDesignerSession, DESIGNER_CAPABILITIES } from '../src/studio/designer-protocol.js';
import { proposalEnvelope } from '../src/studio/agent-chat.js';

const fixture = () => ({ schema_version:1, document_type:'studio-space', name:'Test home', lighting:'daylight', bounds_m:[-12,-12,12,12], spawn:[0,-8], objects:[
  {id:'living-sofa',kind:'sofa',label:'Living sofa',east:-4,north:0,width:2.4,depth:1,height:.85,yaw:0,elevation:0,finish:'fabric'},
] });

test('furnished documents edit, save, restore and export independently of creator regions', () => {
  const source=fixture(), doc=createStudioDocument(source);
  doc.update('living-sofa',{east:-3,finish:'sage'});
  assert.equal(doc.value.objects[0].finish,'sage'); assert.equal(source.objects[0].finish,'fabric');
  doc.undo(); assert.equal(doc.value.objects[0].east,-4); doc.redo();
  const storage=new Map(); storage.getItem=key=>storage.get(key)??null; storage.setItem=(key,value)=>storage.set(key,value);
  doc.save(storage); const restored=createStudioDocument();restored.restore(storage);
  assert.deepEqual(parseRegion(restored.serialize()),doc.value);
  doc.update('@environment',{lighting:'warm'});assert.equal(doc.value.lighting,'warm');doc.undo();assert.equal(doc.value.lighting,'daylight');
});

test('space edits reject unknown properties, invalid dimensions, outside footprints and blocked arrival atomically', () => {
  const doc=createStudioDocument(fixture()),before=doc.serialize();
  for(const patch of [{finish:'javascript:bad'},{east:20},{width:-1},{height:Infinity},{elevation:NaN},{url:'https://example.com'},{east:0,north:-8}]) {
    assert.throws(()=>doc.update('living-sofa',patch));assert.equal(doc.serialize(),before);
  }
  const id=doc.insert('furnishing',{kind:'desk',label:'New desk',east:4,north:0,finish:'oak'});
  assert.equal(doc.items.find(item=>item.id===id).kind,'desk');doc.remove(id);assert.equal(doc.serialize(),before);
  assert.throws(()=>doc.remove('@environment'));
  assert.throws(()=>doc.insert('building',{}));
  for(const change of [s=>s.objects.push({...s.objects[0]}),s=>s.lighting='bad',s=>s.objects[0].kind='script',s=>s.spawn=[NaN,0],s=>s.owner='private']){
    const space=fixture();change(space);assert.throws(()=>parseRegion(JSON.stringify(space)));
  }
});

test('furnishing and lighting agent proposal is one undoable edit and rejects stale or selected-scope changes', () => {
  const doc=createStudioDocument(fixture()),session=createDesignerSession(doc);
  session.connect({id:'local',projectId:'space',packVersion:'1',capabilities:DESIGNER_CAPABILITIES});
  const request=session.begin({brief:'Warm up the living room',scope:'region'});
  const edit={operations:[{op:'update',id:'living-sofa',patch:{finish:'sage'}},{op:'update',id:'@environment',patch:{lighting:'warm'}},{op:'add',type:'furnishing',patch:{kind:'plant',east:6,north:5}}]};
  session.preview(proposalEnvelope(request,edit,doc));session.apply();
  assert.equal(doc.value.lighting,'warm');assert.equal(doc.value.objects.length,2);doc.undo();assert.deepEqual(doc.value,fixture());
  const selected=session.begin({brief:'Change sofa',scope:'selection',selectedIds:['living-sofa']});
  assert.throws(()=>session.preview(proposalEnvelope(selected,{operations:edit.operations.slice(1,2)},doc)),/scope/);
  const stale=session.begin({brief:'Move sofa',scope:'region'});doc.update('living-sofa',{east:-3});
  assert.throws(()=>session.preview(proposalEnvelope(stale,edit,doc)),/changed/);
});
