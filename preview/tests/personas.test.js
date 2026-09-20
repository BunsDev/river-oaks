import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunity, chooseCommunityScenario, interactWithLocal, snapshotForLocal } from '../src/community.js';
import { conversationLine } from '../src/personas.js';
import { voiceFor } from '../src/speech.js';

const world = { communityLocations: Array.from({length:24},(_,i)=>({id:`stop-${i}`,name:`Public stop ${i}`,position:[i*10,0,0]})) };

test('resident roles remain distinct from sourced historic and present-day portrayals', () => {
  const {locals} = createCommunity(world);
  assert.equal(locals.filter(local=>!local.persona.portrayal).length,20);
  const guests = locals.filter(local=>local.persona.portrayal);
  assert.deepEqual(guests.map(local=>local.name),['Ima Hogg','Barbara Jordan','Hakeem Olajuwon','Beyoncé']);
  assert.deepEqual(guests.map(local=>local.persona.era),['historical','historical','present','present']);
  for (const local of guests) {
    assert.equal(new URL(local.persona.source).protocol,'https:');
    assert.match(local.persona.homeContext,/no current private residence/);
    assert.doesNotMatch(conversationLine(local,'greeting'),/I live here/);
  }
  assert.equal(new Set(locals.map(local=>voiceFor(local).voice)).size,24);
});

test('conversation memory belongs to each resident and survives scenario resets only within this scene', () => {
  const state=createCommunity(world), local=state.locals[0], other=state.locals[1];
  assert.match(conversationLine(local,'greeting'),/I live here in River Oaks/);
  assert.match(conversationLine(local,'greeting'),/Welcome back/);
  assert.match(conversationLine(other,'greeting'),/Hi, I’m/);
  assert.notEqual(conversationLine(local,'story'),conversationLine(local,'story'));
  state.running=true;
  interactWithLocal(state,local.id,'ask');
  interactWithLocal(state,local.id,'supply');
  interactWithLocal(state,local.id,'supply'); // rejected cooldown must not add a memory
  assert.equal(local.persona.memory.supportReceived,1);
  chooseCommunityScenario(state,'storm');
  assert.match(conversationLine(local,'greeting'),/remember the support/);
  assert.equal(createCommunity(world).locals[0].persona.memory.encounters,0);
});

test('reactive packets carry bounded role and encounter context without a planning request', () => {
  const state=createCommunity(world), local=state.locals[0];
  conversationLine(local,'greeting');
  const resident=snapshotForLocal(state,local.id,'ask',1).agents[0];
  assert.match(resident.role_context,/River Oaks resident/);
  assert.match(resident.role_context,/Public stop 0/);
  assert.match(resident.role_context,/encounters 1/);
  for (const person of state.locals) {
    const agent=snapshotForLocal(state,person.id,'conversation',2).agents[0];
    assert.ok(agent.role_context.length<=512);
    assert.ok(agent.activity.length<=64);
  }
  assert.match(snapshotForLocal(state,state.locals[22].id,'ask',3).agents[0].role_context,/fictional portrayal/i);
});
