import test from 'node:test';
import assert from 'node:assert/strict';
import { nearbyPeople } from '../src/nearby-people.js';

const person = (id, x, y, z = 0) => ({ id, name: id, position: [x, y, z] });
test('nearby encounters follow walking distance and stay on the same level', () => {
  const people = [person('far', 80, 0), person('next', 8, 0), person('nearest', 3, 4), person('upstairs', 0, 0, 10)];
  assert.deepEqual(nearbyPeople(people, [0, 0, 1.68]).map(item => [item.local.id, item.distance]), [['nearest', 5], ['next', 8]]);
  assert.equal(people[0].id, 'far');
  assert.deepEqual(nearbyPeople(people, [80, 0, 1.68]).map(item => item.local.id), ['far']);
});
test('missing positions and an empty street do not offer unreachable encounters', () => {
  assert.deepEqual(nearbyPeople([person('invalid', NaN, 0), person('far', 80, 0)], [0, 0, 0]), []);
  assert.deepEqual(nearbyPeople([person('local', 0, 0)], null), []);
});


test('nearby encounters follow an enchanted resident up into the air',()=>{
  const flying={...person('flying',2,0),wish:{kind:'flight',age:4}};
  assert.deepEqual(nearbyPeople([flying],[0,0,5.18]).map(item=>item.local.id),['flying']);
  assert.deepEqual(nearbyPeople([flying],[0,0,12]),[]);
});

test('reachable encounters are considered before the nearby result limit',()=>{
  const people=Array.from({length:8},(_,index)=>({...person(`person-${index}`,index+1,0),storeId:index<7?'other-room':null}));
  const checked=[];
  const nearby=nearbyPeople(people,[0,0,1.68],40,1,local=>{
    checked.push(local.id);return local.storeId===null;
  });
  assert.deepEqual(nearby.map(item=>item.local.id),['person-7']);
  assert.equal(checked.length,8,'unreachable nearer people do not starve a valid encounter');
  checked.length=0;
  assert.equal(nearbyPeople(people,[0,0,1.68],40,1,local=>{checked.push(local.id);return true;}).length,1);
  assert.equal(checked.length,1,'stop testing reachability once the requested results are found');
});

test('nearby offers include the full vertical talking range',()=>{
  const local=person('below',0,0);
  assert.deepEqual(nearbyPeople([local],[0,0,5.75]).map(item=>item.local.id),['below']);
  assert.deepEqual(nearbyPeople([local],[0,0,6]).map(item=>item.local.id),['below']);
  assert.deepEqual(nearbyPeople([local],[0,0,6.01]),[]);
});
