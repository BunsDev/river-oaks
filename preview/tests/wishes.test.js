import test from 'node:test';
import assert from 'node:assert/strict';
import { createWishState, grantWish, undoWish, stepWishes, WISHES } from '../src/wishes.js';
import { VISITOR_FORMS, formFor } from '../src/visitor-persona.js';
const setup = () => ({ wishes: createWishState(), locals: [
  { id: 'maya', name: 'Maya', position: [0, 0, 0] },
  { id: 'theo', name: 'Theo', position: [3, 0, 0] },
  { id: 'far', name: 'June', position: [80, 0, 0] },
] });
test('a Force-held recipient cannot receive a conflicting wish',()=>{
  const state=setup();state.locals[0].force={height:1,mode:'lift'};
  assert.equal(grantWish(state,'maya','flight','jevica').ok,false);
  assert.equal(state.locals[0].wish,undefined);assert.equal(state.wishes.granted,0);
  delete state.locals[0].force;assert.equal(grantWish(state,'maya','flight','jevica').ok,true);
});
test('the carriage crew travel with Jevica and cannot receive wishes',()=>{
  const state=setup();state.locals.push({id:'carriage-driver',name:'Prince Jev',position:[1,0,0],vehicleRole:'driver'});
  const result=grantWish(state,'carriage-driver','dragon','jevica');
  assert.equal(result.ok,false);assert.match(result.message,/Prince Jev/);
  assert.equal(state.locals.at(-1).wish,undefined);assert.equal(state.wishes.granted,0);
});
test('Jevica is the only playable identity and wish caster', () => {
  assert.deepEqual(VISITOR_FORMS.map(form => form.id), ['jevica']);
  for (const id of ['alien', 'witch', 'unknown']) assert.equal(formFor(id), null);
  for (const caster of ['alien', 'witch', 'visitor', undefined]) {
    const state = setup();
    assert.equal(grantWish(state, 'maya', WISHES[0].id, caster).ok, false);
    assert.equal(state.locals[0].wish, undefined);
  }

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
test('wish pleas address account names literally, including replacement tokens',()=>{
  const state=setup(),name="A$&B$'";
  assert.equal(grantWish(state,'maya','dragon','jevica',name).ok,true);
  stepWishes(state,29);
  assert.equal(state.locals[0].wish.message,`A$&B$', please take my dragon back before it roasts another shopping bag!`);
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

test('wishes hold an outdoor route while support is paused and undo resumes it', async () => {
  const { createCommunity } = await import('../src/community.js');
  const { createResidentLife, stepResidentLife } = await import('../src/resident-life.js');
  const world = {scene:'district', bounds_m:[-20,-20,20,20], collisionPolygons:[], communityLocations:[
    {id:'west',name:'West',position:[-6,0,0]}, {id:'east',name:'East',position:[6,0,0]},
  ]};
  const state=createCommunity(world), life=createResidentLife(world,state), local=state.locals[0];
  for(let i=0;i<180;i++) stepResidentLife(life,1/60);
  assert.ok(local.life.distance>0);
  grantWish(state,local.id,'flight','jevica');
  const position=[...local.position];
  for(let i=0;i<1800;i++) { stepWishes(state,1/60); stepResidentLife(life,1/60); }
  assert.equal(state.running,false);
  assert.equal(state.elapsed,0);
  assert.equal(local.wish.phase,'pleading');
  assert.deepEqual(local.position,position);
  assert.equal(local.life.speed,0);
  undoWish(state,local.id,'jevica');
  for(let i=0;i<120;i++) stepResidentLife(life,1/60);
  assert.notDeepEqual(local.position,position);
});

test('changing a support scenario preserves active wishes; replacing the world clears them',async()=>{
  const {createCommunity,chooseCommunityScenario}=await import('../src/community.js');
  const world={scene:'district',communityLocations:[{id:'a',name:'Garden',position:[0,0,0]}]};
  const state=createCommunity(world),local=state.locals[0];
  grantWish(state,local.id,'dragon','jevica');stepWishes(state,14);
  chooseCommunityScenario(state,'storm');
  assert.equal(local.wish.phase,'trouble');assert.equal(state.wishes.trouble,1);
  const fresh=createCommunity(world);
  assert.equal(fresh.wishes.granted,0);assert.ok(fresh.locals.every(person=>!person.wish));
});
