import test from 'node:test';
import assert from 'node:assert/strict';
import { createWishState, grantWish, undoWish, stepWishes, WISHES } from '../src/wishes.js';
import { VISITOR_FORMS, formFor } from '../src/visitor-persona.js';
const setup = () => ({ wishes: createWishState(), locals: [
  { id: 'maya', name: 'Maya', position: [0, 0, 0] },
  { id: 'theo', name: 'Theo', position: [3, 0, 0] },
  { id: 'far', name: 'June', position: [80, 0, 0] },
] });
<<<<<<< Updated upstream
test('only Jevica grants and undoes wishes, whichever forms are playable', () => {
  assert.ok(VISITOR_FORMS.some(form => form.id === 'jevica'));
  assert.equal(formFor('unknown'), null);
  for (const caster of ['alien', 'witch', 'visitor', undefined]) {
    const state = setup();
    assert.equal(grantWish(state, 'maya', WISHES[0].id, caster).ok, false, String(caster));
    assert.equal(state.locals[0].wish, undefined);
  }
  const state = setup();
  assert.equal(grantWish(state, 'maya', WISHES[0].id, 'jevica').ok, true);
  assert.equal(undoWish(state, 'maya', 'witch').ok, false, 'another form cannot undo Jevica’s wish');
=======
test('Jevica is the only playable identity', () => {
  assert.deepEqual(VISITOR_FORMS.map(form => form.id), ['jevica']);
  for (const id of ['alien', 'witch', 'unknown']) assert.equal(formFor(id), null);
>>>>>>> Stashed changes
});
for (const definition of WISHES) test(`${definition.id}: gift becomes trouble, resident requests removal, undo releases the town`, () => {
  const state = setup();
  assert.equal(grantWish(state, 'maya', definition.id, 'jevica').ok, true);
  assert.equal(state.locals[0].wish.phase, 'gift');
  stepWishes(state, definition.twistAfter);
  assert.equal(state.locals[0].wish.phase, 'trouble');
  assert.equal(state.wishes.trouble, 1);
  assert.ok(state.locals[0].wishDisruption);
  assert.ok(state.locals[1].wishDisruption);
  assert.equal(state.locals[2].wishDisruption, undefined);
  stepWishes(state, definition.pleaAfter);
  assert.equal(state.locals[0].wish.phase, 'pleading');
  assert.match(state.locals[0].wish.message, /Jevica/);
  assert.equal(undoWish(state, 'maya', 'jevica').ok, true);
  assert.equal(state.locals[0].wish, undefined);
  assert.equal(state.locals[1].wishDisruption, undefined);
  assert.equal(state.wishes.trouble, 0);
  assert.equal(state.wishes.resolved, 1);
  assert.equal(undoWish(state, 'maya', 'jevica').ok, false);
});
test('invalid, duplicate, non-Jevica and absent resident grants do not mutate state', () => {
  const state = setup();
  for (const args of [['maya','dragon','witch'],['missing','dragon','jevica'],['maya','missing','jevica']]) assert.equal(grantWish(state,...args).ok,false);
  assert.equal(state.wishes.granted,0);
  grantWish(state,'maya','dragon','jevica');
  assert.equal(grantWish(state,'maya','flight','jevica').ok,false);
  assert.equal(state.locals[0].wish.kind,'dragon');
  assert.equal(undoWish(state,'maya','alien').ok,false);
});
test('time is finite, frame independent, and gifts can be undone early', () => {
  const a=setup(),b=setup();
  grantWish(a,'maya','flight','jevica');grantWish(b,'maya','flight','jevica');
  for(const dt of [NaN,Infinity,-1,0])stepWishes(a,dt);
  assert.equal(a.locals[0].wish.age,0);
  stepWishes(a,40);for(let i=0;i<400;i++)stepWishes(b,0.1);
  assert.equal(a.locals[0].wish.phase,b.locals[0].wish.phase);
  assert.equal(a.wishes.trouble,b.wishes.trouble);
  const early=setup();grantWish(early,'maya','dog','jevica');undoWish(early,'maya','jevica');stepWishes(early,100);
  assert.equal(early.wishes.trouble,0);
});
test('removing one overlapping incident preserves the other and event history stays bounded', () => {
  const state=setup();grantWish(state,'maya','dragon','jevica');grantWish(state,'theo','dog','jevica');stepWishes(state,40);
  undoWish(state,'maya','jevica');assert.ok(state.locals[0].wishDisruption);assert.equal(state.wishes.trouble,1);
  undoWish(state,'theo','jevica');
  for(let i=0;i<30;i++){grantWish(state,'maya','dragon','jevica');undoWish(state,'maya','jevica');}
  assert.ok(state.wishes.events.length<=12);
});
test('incidents respect room boundaries and new worlds have independent wishes', () => {
  const state=setup();state.locals[1].storeId='shop';
  grantWish(state,'maya','dragon','jevica');stepWishes(state,40);
  assert.equal(state.locals[1].wishDisruption,undefined);
  assert.equal(setup().wishes.granted,0);
});
test('wish trouble pauses physical volunteer work until the incident is undone',async()=>{
  const {createCommunity,stepCommunity}=await import('../src/community.js');
  const state=createCommunity({scene:'district',communityLocations:[
    {id:'a',name:'West',position:[0,0,0]},{id:'b',name:'East',position:[1,0,0]},
  ]});
  const [recipient,helper]=state.locals;
  state.running=true;recipient.status='aid_en_route';helper.life={action:'continue'};
  state.jobs=[{id:'test-visit',localId:recipient.id,helperId:helper.id,generation:state.generation,phase:'assisting',progress:0,duration:60}];
  grantWish(state,helper.id,'dog','jevica');stepWishes(state,10);stepCommunity(state,0.1);
  assert.equal(state.jobs[0].progress,0,'A sneezing dog cannot continue volunteer work');
  undoWish(state,helper.id,'jevica');stepCommunity(state,0.1);
  assert.ok(state.jobs[0].progress>0,'Work resumes once the wish is undone');
});
