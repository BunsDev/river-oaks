import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStudioDocument} from '../src/studio/document.js';
import {buildNeighborhood} from '../../shared/neighborhood/preserve.js';
import {hash} from '../../shared/neighborhood/format.js';
import {createNeighborhoodSession} from '../src/studio/neighborhood-session.js';
const recipe = JSON.parse(readFileSync(new URL('../../config/neighborhoods/garden-blocks.json', import.meta.url)));
const storage = () => {let value=null;return {getItem:()=>value,setItem:(_,next)=>{value=next;}};};

test('authoring baseline and approvals travel with Studio history and device save', () => {
  const doc=createStudioDocument(), first=buildNeighborhood(recipe), id=first.region.buildings[0].id;
  doc.openNeighborhood(first);
  doc.update(id,{height:8});
  assert.equal(doc.neighborhood.sha256,first.sha256,'ordinary edits retain reconciliation baseline');
  const approved=buildNeighborhood(recipe,{previous:doc.neighborhood,edited:doc.value,approve:[id]});
  doc.openNeighborhood(approved);
  assert.deepEqual(doc.neighborhood.approved,[id]);
  doc.undo();assert.deepEqual(doc.neighborhood.approved,[]);assert.equal(doc.value.buildings[0].size[2],8);
  doc.redo();assert.deepEqual(doc.neighborhood.approved,[id]);
  const store=storage();doc.save(store);
  const reopened=createStudioDocument();reopened.restore(store);
  assert.deepEqual(reopened.neighborhood,approved);assert.deepEqual(reopened.value,doc.value);
  reopened.open(first.region);assert.equal(reopened.neighborhood,null);
  reopened.undo();assert.deepEqual(reopened.neighborhood,approved);
});

test('invalid or stale neighborhood application cannot change the draft or history', () => {
  const doc=createStudioDocument(), candidate=buildNeighborhood(recipe), before=doc.value;
  assert.throws(()=>doc.openNeighborhood({...candidate,sha256:'bad'}),/integrity/);
  assert.deepEqual(doc.value,before);assert.equal(doc.canUndo,false);
  doc.add('tree');
  assert.throws(()=>doc.openNeighborhood(candidate,{baseRevision:0}),/changed/);
  assert.equal(doc.neighborhood,null);assert.equal(doc.value.buildings.length,0);
});

test('a recomputed checksum cannot authorize geometry inconsistent with the artifact baseline', () => {
  const doc=createStudioDocument(), {sha256,...forged}=buildNeighborhood(recipe);
  forged.region.buildings[0].center=[0,0];
  assert.throws(()=>doc.openNeighborhood({...forged,sha256:hash(forged)}),/integrity|inconsistent/);
  assert.equal(doc.neighborhood,null);assert.equal(doc.canUndo,false);
});

test('preview cancellation, late responses and intervening edits never replace the document', async () => {
  const doc=createStudioDocument(), jobs=[];
  const session=createNeighborhoodSession(doc,{compile:request=>new Promise(resolve=>jobs.push({request,resolve})),cancel:()=>{}});
  const first=session.preview(recipe);session.cancel();
  jobs[0].resolve(buildNeighborhood(recipe));await assert.rejects(first,/cancelled/);
  assert.equal(doc.neighborhood,null);
  const second=session.preview(recipe);jobs[1].resolve(buildNeighborhood(recipe));await second;
  doc.add('tree');assert.throws(()=>session.apply(),/changed/);
  assert.equal(doc.neighborhood,null);
});

test('session reconciles edited and approved buildings across a seed change and artifact export', async () => {
  const doc=createStudioDocument();doc.openNeighborhood(buildNeighborhood(recipe));
  const id=doc.value.buildings[0].id;doc.update(id,{height:8});
  const session=createNeighborhoodSession(doc,{compile:async ({recipe,options})=>buildNeighborhood(recipe,options),cancel:()=>{}});
  await session.preview({...recipe,seed:'studio-variation'},{approve:[id]});
  assert.equal(doc.neighborhood.recipe.seed,recipe.seed,'preview is detached');
  session.apply();assert.equal(doc.neighborhood.recipe.seed,'studio-variation');
  assert.equal(doc.value.buildings[0].size[2],8);assert.deepEqual(doc.neighborhood.approved,[id]);
  doc.remove(id);
  const exported=await session.exportArtifact();assert.ok(exported.overrides.some(item=>item.id===id&&item.value===null));
  assert.ok(!exported.region.buildings.some(b=>b.id===id));
});

test('worker entry validates the imported artifact before applying a new seed', async () => {
  const prior=globalThis.self, messages=[];
  globalThis.self={postMessage:value=>messages.push(value)};
  try{
    await import('../src/studio/neighborhood-worker.js');
    const artifact=buildNeighborhood(recipe);
    self.onmessage({data:{artifact,seed:'worker-next'}});
    assert.equal(messages[0].artifact.recipe.seed,'worker-next');
    const {sha256,...forged}=artifact;forged.region.buildings[0].center=[0,0];
    self.onmessage({data:{artifact:{...forged,sha256:hash(forged)},seed:'worker-next'}});
    assert.match(messages[1].error,/inconsistent/);assert.equal(messages[1].artifact,undefined);
  }finally{if(prior===undefined)delete globalThis.self;else globalThis.self=prior;}
});
