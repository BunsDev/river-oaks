import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTACK_KEY, EVADE_KEY, describeAction, describeHit, nearestRival, policeStatus, rivalFigures, starsLabel, starsOf, starsText } from '../src/crime-ui.js';
import { createResidentGestures } from '../src/resident-gestures.js';
import { poseFor } from '../src/crime-poses.js';

const rival = (change = {}) => ({ id: 'rival:westcreek', name: 'Westcreek rival', appearance: 'sable-human', position: [-2908, -1320, 17.8], yaw: 1, health: 75, maxHealth: 100, incapacitated: false, staggered: false, ...change });

test('wanted stars read the same to the eye and to a screen reader', () => {
  assert.deepEqual([0, 2, 5].map(starsText), ['☆☆☆☆☆', '★★☆☆☆', '★★★★★']);
  assert.equal(starsLabel(2), 'Wanted level: 2 of 5 stars');
  assert.equal(starsOf({ wanted: [['alice', 3]] }, 'alice'), 3);
  assert.equal(starsOf({ wanted: [['alice', 3]] }, 'bob'), 0);
  assert.equal(starsOf(undefined, 'bob'), 0);
});

test('the HUD offers the nearest rival from the town\'s position and says when it is in reach', () => {
  const crime = { targets: [rival(), rival({ id: 'rival:far', position: [-2800, -1440, 18] })] };
  assert.equal(nearestRival({ position: [-2906.6, -1320, 17.8] }, crime).inReach, true);
  assert.equal(nearestRival({ position: [-2905, -1320, 17.8] }, crime).inReach, false);
  assert.equal(nearestRival({ position: [-2765, -1295, 18] }, crime), null, 'far from every rival');
  assert.equal(nearestRival(null, crime), null);
  assert.equal(ATTACK_KEY, 'KeyT');
});

test('hits are described only from the town\'s reply', () => {
  assert.equal(describeHit({ health: 75, incapacitated: false, stars: 1 }, 'Westcreek rival'), 'Hit landed. Westcreek rival has 75 health left. Wanted level 1 of 5.');
  assert.equal(describeHit({ health: 0, incapacitated: true, stars: 4 }, 'Westcreek rival'), 'Hit landed. Westcreek rival is down. Wanted level 4 of 5.');
});

test('rivals render as figures that stagger when hit and double over while down', () => {
  const [standing, hit, down] = rivalFigures({ targets: [rival(), rival({ staggered: true }), rival({ health: 0, incapacitated: true })] });
  assert.deepEqual([standing.gesture, hit.gesture, down.gesture], [null, 'stagger', 'down']);
  assert.equal(down.name, 'Westcreek rival · down');
  assert.deepEqual([standing.altitude, standing.vehicle, standing.sitting], [0, null, null]);
  assert.deepEqual(rivalFigures(undefined), []);
  // Existing poses, not new ones: garment bakes stay valid. Each reads differently from rest.
  assert.deepEqual(['shove', 'stagger', 'down', 'wave', null].map(poseFor), ['throw-release', 'startled', 'bow', 'wave', null]);
  const settle = action => { const gestures = createResidentGestures();let pose;for (let i = 0; i < 90; i++)pose = gestures.update(action, 0.016);return JSON.stringify(pose); };
  const poses = ['shove', 'stagger', 'down', 'continue'].map(gesture => settle(poseFor(gesture)));
  assert.equal(new Set(poses).size, 4);
  const still = createResidentGestures({ reducedMotion: true });
  assert.equal(JSON.stringify(still.update(poseFor('shove'), 0.016)), settle('continue'));
});

test('police actors and status follow authoritative pursuit, search and capture without motion-only cues', async () => {
  const { policeFigures, policeStatus } = await import('../src/crime-ui.js');
  const police = { units: [{ id: 'police:0', position: [1, 2, 3], yaw: 1, state: 'search', targetId: 'alice' }], surrendered: [] };
  const [figure] = policeFigures(police);
  assert.equal(figure.id, 'police:0'); assert.match(figure.name, /Police.*search/i);
  assert.equal(figure.character.palette, 'midnight');
  assert.deepEqual(figure.position, [1, 2, 3]);
  assert.match(policeStatus(police, 'alice'), /last seen/i);
  assert.equal(policeStatus(police, 'bob'), '');
  police.surrendered = ['alice']; assert.match(policeStatus(police, 'alice'), /surrender/i);
  police.units[0].state = 'arrest'; assert.match(policeStatus(police, 'alice'), /arrest/i);
});

test('surrender uses the shared optional sound, waits for authority and releases its cue on disposal', async t => {
  const { createCrimeUI } = await import('../src/crime-ui.js');
  class Element {
    constructor() { this.children=[];this.style={};this.events={};this.textContent=''; }
    append(...items) { this.children.push(...items); }
    setAttribute() {}
    addEventListener(type,fn) { this.events[type]=fn; }
    remove() {}
  }
  const prior=globalThis.document;t.after(()=>{globalThis.document=prior;});
  globalThis.document={createElement:()=>new Element()};
  const events=[],host=new Element(); let reply;
  const town={selfId:'a',snapshot:{players:[{id:'a',position:[20,20,0]}],crime:{targets:[],wanted:[['a',1]]},police:{units:[],surrendered:[],eligible:['a']}}};
  const ui=createCrimeUI({host,getTown:()=>town,keys:null,request:()=>new Promise(resolve=>{reply=resolve;}),
    getSounds:()=>({unlock(){events.push('unlock');},play(kind){events.push(kind);return {stop(){events.push('stop');}};}})});
  ui.sync();const button=host.children[0].children.find(el=>el.className==='crime-surrender');
  const pending=button.events.click();assert.deepEqual(events,['unlock']);assert.equal(button.disabled,true);
  reply({ok:true,surrendered:true});await pending;assert.deepEqual(events,['unlock','tap']);
  ui.dispose();assert.deepEqual(events,['unlock','tap','stop']);
});

test('server eligibility hides surrender in peaceful and disconnected states, and capture restores keyboard focus', async t => {
  const {createCrimeUI}=await import('../src/crime-ui.js');
  class Element {
    constructor(){this.children=[];this.style={};this.events={};this.textContent='';}
    append(...items){this.children.push(...items);}
    setAttribute(){}
    addEventListener(type,fn){this.events[type]=fn;}
    remove(){}
    focus(){globalThis.document.activeElement=this;}
  }
  const prior=globalThis.document;t.after(()=>{globalThis.document=prior;});
  globalThis.document={createElement:()=>new Element()};const host=new Element();
  const town={connected:true,selfId:'a',snapshot:{players:[{id:'a',position:[20,20,0]}],crime:{targets:[],wanted:[['a',1]]},police:{units:[],surrendered:[],eligible:[]}}};
  const ui=createCrimeUI({host,getTown:()=>town,keys:null,request:async()=>({ok:true})});t.after(()=>ui.dispose());
  const hud=host.children[0],button=hud.children.find(el=>el.className==='crime-surrender');
  ui.sync();assert.equal(button.hidden,true,'server marks safe/off/interior players ineligible');
  town.snapshot.police.eligible=['a'];ui.sync();assert.equal(button.hidden,false);
  town.connected=false;ui.sync();assert.equal(button.hidden,true);
  town.connected=true;town.snapshot.police.surrendered=['a'];town.snapshot.police.eligible=[];ui.sync();
  assert.equal(button.hidden,false,'existing hold retains a way to resume');button.focus();
  town.snapshot.police.units=[{targetId:'a',state:'arrest'}];ui.sync();assert.equal(button.disabled,true);
  assert.notEqual(globalThis.document.activeElement,button,'focus moves to status when capture disables the action');
});

test('a delayed surrender reply cannot overwrite a newer completed arrest', async t => {
  const {createCrimeUI}=await import('../src/crime-ui.js');
  class Element {
    constructor(){this.children=[];this.style={};this.events={};this.textContent='';}
    append(...items){this.children.push(...items);}
    setAttribute(){}
    addEventListener(type,fn){this.events[type]=fn;}
    remove(){}
  }
  const prior=globalThis.document;t.after(()=>{globalThis.document=prior;});
  globalThis.document={createElement:()=>new Element()};const host=new Element();let reply;
  const town={connected:true,selfId:'a',snapshot:{revision:1,players:[{id:'a',position:[20,20,0]}],crime:{targets:[],wanted:[['a',1]]},police:{units:[],surrendered:[],eligible:['a']}}};
  const ui=createCrimeUI({host,getTown:()=>town,keys:null,request:()=>new Promise(resolve=>{reply=resolve;}),
    getSounds:()=>({unlock(){},play(){return null;}})});t.after(()=>ui.dispose());
  ui.sync();const hud=host.children[0],button=hud.children.find(el=>el.className==='crime-surrender');
  const pending=button.events.click();
  town.snapshot={...town.snapshot,revision:2,police:{units:[],surrendered:['a'],eligible:['a']}};ui.sync();
  town.snapshot={...town.snapshot,revision:3,crime:{targets:[],wanted:[]},police:{units:[],surrendered:[],eligible:[]}};ui.sync();
  reply({ok:true,surrendered:true});await pending;
  assert.equal(hud.children.find(el=>el.className==='crime-result').textContent,'You are no longer wanted. You may move again.');
});

test('a newly rendered stationary officer faces the authoritative direction of travel', async () => {
  const {policeFigures}=await import('../src/crime-ui.js');
  const unit={id:'police:0',position:[0,0,0],yaw:Math.PI/2,state:'pursue',targetId:'alice'};
  const [figure]=policeFigures({units:[unit]});
  // Existing peer figures interpret yaw as the walking camera's angle and add pi.
  // Its forward vector must point east, toward the player, even before a movement frame.
  const renderedHeading=figure.yaw+Math.PI;
  assert.ok(Math.abs(Math.sin(renderedHeading)-1)<1e-9,'officer must face east instead of away from the target');
  assert.ok(Math.abs(Math.cos(renderedHeading))<1e-9);
});

test('timed strikes are confirmed from the snapshot outcome, never the admission reply (#640)', () => {
  assert.equal(EVADE_KEY, 'KeyU');
  const strike = { id: 'strike:1', kind: 'strike', actorId: 'a', targetId: 'rival:westcreek', direction: [-1, 0] };
  assert.equal(describeAction({ ...strike, phase: 'windup', outcome: null }, 'Westcreek rival', 'a'), 'Winding up…');
  assert.equal(describeAction({ ...strike, phase: 'contact', outcome: 'hit', effect: { health: 75, incapacitated: false, stars: 1 } }, 'Westcreek rival', 'a'),
    'Hit landed. Westcreek rival has 75 health left. Wanted level 1 of 5.');
  assert.equal(describeAction({ ...strike, outcome: 'miss', reason: 'attack_out_of_reach' }, 'Westcreek rival', 'a'), 'Missed. Westcreek rival was out of reach.');
  assert.equal(describeAction({ ...strike, outcome: 'miss', reason: 'attack_out_of_arc' }, 'Westcreek rival', 'a'), 'Missed. Westcreek rival moved out of the swing.');
  assert.equal(describeAction({ ...strike, outcome: 'cancelled', reason: 'violence_off' }, 'Westcreek rival', 'a'), 'Stopped. The town is peaceful right now.');
  const counter = { id: 'counter:2', kind: 'counter', actorId: 'rival:westcreek', targetId: 'a', direction: [1, 0] };
  assert.equal(describeAction({ ...counter, phase: 'windup', outcome: null }, 'Westcreek rival', 'a'), 'Westcreek rival is winding up to strike back. Evade with U.');
  assert.equal(describeAction({ ...counter, outcome: 'evaded' }, 'Westcreek rival', 'a'), 'You evaded Westcreek rival.');
  assert.equal(describeAction({ ...counter, outcome: 'hit', effect: { health: 80, down: false } }, 'Westcreek rival', 'a'), 'Westcreek rival hit you. 80 health left.');
  assert.equal(describeAction({ ...counter, outcome: 'hit', effect: { health: 0, down: true } }, 'Westcreek rival', 'a'), 'Westcreek rival knocked you down. You will get back up shortly.');
  assert.equal(describeAction({ ...counter, targetId: 'b', outcome: 'hit', effect: { health: 0, down: true } }, 'Westcreek rival', 'a'), '', 'other players\' fights are not announced');
});

function harness(t, town, request) {
  class Element {
    constructor(){this.children=[];this.style={};this.events={};this.textContent='';this.dataset={};}
    append(...items){this.children.push(...items);}
    setAttribute(){}
    addEventListener(type,fn){this.events[type]=fn;}
    removeEventListener(type){delete this.events[type];}
    remove(){}
    focus(){}
  }
  const prior=globalThis.document;t.after(()=>{globalThis.document=prior;});
  globalThis.document={createElement:()=>new Element()};const host=new Element(),keys=new Element();
  return import('../src/crime-ui.js').then(({createCrimeUI})=>{
    const ui=createCrimeUI({host,getTown:()=>town,keys,request,getSounds:()=>({unlock(){},play(){return null;}})});t.after(()=>ui.dispose());
    const hud=host.children[0],find=(className,exact=false)=>hud.children.concat(hud.children.flatMap(child=>child.children??[])).find(el=>exact?el.className===className:String(el.className).split(' ').includes(className));
    return {ui,hud,keys,find};
  });
}

test('the HUD waits for the snapshot outcome, retries once with the same ID, and offers an evade by key and touch (#640)', async t => {
  const rival = { id: 'rival:westcreek', name: 'Westcreek rival', appearance: 'sable-human', position: [-2908, -1320, 0], yaw: 0, health: 100, maxHealth: 100, incapacitated: false, staggered: false, engagedId: null };
  const { defaultWorldPolicy, clockMinute, dangerActive } = await import('../src/world-policy.js');
  const base = defaultWorldPolicy(), rules = { ...base, violence: { ...base.violence, mode: 'forced', zones: ['westcreek-lane'] } };
  const worldPolicy = { ...rules, minute: clockMinute(rules.clock), active: dangerActive(rules) };
  const town = { connected: true, selfId: 'a', snapshot: { revision: 1, worldId: 'river-oaks', worldPolicy, players: [{ id: 'a', position: [-2906.8, -1320, 0], levelId: null }], crime: { targets: [rival], wanted: [], actions: [] }, police: { units: [], surrendered: [], eligible: [] } } };
  const sent = [];let calls = 0;
  const { ui, find, keys } = await harness(t, town, async message => {
    sent.push(message);calls++;
    if (message.type === 'attack' && calls === 1) throw new Error('lost');
    if (message.type === 'attack') return { ok: true, action: { id: 'strike:1', kind: 'strike', actorId: 'a', targetId: rival.id, phase: 'windup', remainingMs: 300, outcome: null, reason: null, direction: [-1, 0] } };
    return { ok: true, evade: { direction: message.direction ?? 'back', remainingMs: 350 } };
  });
  ui.sync();
  const shove = find('crime-attack', true), result = find('crime-result'), evade = find('crime-evade');
  assert.ok(evade, 'an evade button exists for touch and pointer');
  shove.events.click();await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.filter(message => message.type === 'attack').length, 2, 'a lost reply is retried once');
  assert.equal(sent[0].attackId, sent[1].attackId, 'with the same ID');
  assert.equal(result.textContent, 'Winding up…', 'the admission reply never claims a hit');
  town.snapshot = { ...town.snapshot, revision: 2, crime: { ...town.snapshot.crime, targets: [{ ...rival, health: 75, staggered: true }], wanted: [['a', 1]],
    actions: [{ id: 'strike:1', kind: 'strike', actorId: 'a', targetId: rival.id, phase: 'contact', remainingMs: 120, outcome: 'hit', reason: null, direction: [-1, 0], effect: { damage: 25, health: 75, incapacitated: false, stars: 1 } }] } };
  ui.sync();
  assert.equal(result.textContent, 'Hit landed. Westcreek rival has 75 health left. Wanted level 1 of 5.');
  // The rival telegraphs: the HUD names it and U evades, with the town deciding the outcome.
  town.snapshot = { ...town.snapshot, revision: 3, crime: { ...town.snapshot.crime, actions: [{ id: 'counter:2', kind: 'counter', actorId: rival.id, targetId: 'a', phase: 'windup', remainingMs: 700, outcome: null, reason: null, direction: [1, 0] }] } };
  ui.sync();
  assert.equal(result.textContent, 'Westcreek rival is winding up to strike back. Evade with U.');
  assert.equal(evade.hidden, false);assert.equal(evade.disabled, false);
  let prevented = false;
  keys.events.keydown({ code: 'KeyU', repeat: false, target: {}, preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prevented, true);
  assert.deepEqual(sent.filter(message => message.type === 'evade').map(message => Object.keys(message).sort()), [['evadeId', 'type']]);
  town.snapshot = { ...town.snapshot, revision: 4, crime: { ...town.snapshot.crime, actions: [{ id: 'counter:2', kind: 'counter', actorId: rival.id, targetId: 'a', phase: 'recovery', remainingMs: 600, outcome: 'evaded', reason: null, direction: [1, 0] }] } };
  ui.sync();
  assert.equal(result.textContent, 'You evaded Westcreek rival.');
  // Peaceful again: no evade, no shove.
  town.snapshot = { ...town.snapshot, revision: 5, crime: { targets: [rival], wanted: [], actions: [] } };
  ui.sync();
  assert.equal(evade.hidden, true);
});


test('a cancelled counter stops the warning, and an officer reaching to grab is said in words (#640)', () => {
  const counter = { id: 'counter:3', kind: 'counter', actorId: 'rival:westcreek', targetId: 'a', direction: [1, 0], reason: null };
  assert.match(describeAction({ ...counter, phase: 'windup', outcome: null }, 'Westcreek rival', 'a'), /winding up to strike back/);
  assert.equal(describeAction({ ...counter, phase: 'done', outcome: 'cancelled', reason: 'captured' }, 'Westcreek rival', 'a'), 'Westcreek rival backed off.');
  const unit = { id: 'police:0', position: [0, 0, 0], yaw: 0, targetId: 'a' };
  assert.match(policeStatus({ units: [{ ...unit, state: 'grab', remainingMs: 600 }], surrendered: [], subdued: [] }, 'a'), /reaching to grab you\. Evade with U, step away or surrender/);
  assert.match(policeStatus({ units: [{ ...unit, state: 'pursue' }], surrendered: [], subdued: ['a'] }, 'a'), /has hold of you/);
});
