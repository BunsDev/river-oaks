import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../district-data.js';
import { createSharedWorld } from '../world.js';
import { measureSnapshotSections, compareSnapshotSections } from '../snapshot-sections.js';

const encodedBytes=frame=>Buffer.byteLength(JSON.stringify(frame),'utf8');
// One opening brace, one closing brace, and a comma between each pair of members.
const framingFor=count=>2+Math.max(0,count-1);

let district;
async function warmedWorld(players) {
  district??=await loadDistrictData();
  const world=createSharedWorld(district);
  for (let i=0;i<players;i++) assert.equal(world.join({userId:`size-${i}`,name:`Size ${i}`}).ok,true);
  for (let i=0;i<20;i++) world.step(.05);
  return world;
}
// The broadcast loop steps every 50 ms and sends every 200 ms.
function nextBroadcast(world) {
  for (let i=0;i<4;i++) world.step(.05);
  return world.snapshot();
}

test('section accounting is exact for multi-byte text and omitted members',()=>{
  const frame={type:'snapshot',chat:[{text:'café ☕'}],skipped:undefined,callback(){},revision:3};
  const measured=measureSnapshotSections(frame);
  assert.equal(measured.total,encodedBytes(frame));
  assert.equal(measured.total,62);
  // Largest first; omitted members are not sections, as they are not in the frame.
  assert.deepEqual(measured.sections,[{key:'chat',bytes:29},{key:'type',bytes:17},{key:'revision',bytes:12}]);
  assert.equal(measured.framing,framingFor(3));
  assert.deepEqual(measureSnapshotSections({}),{total:2,framing:2,sections:[]});
});

test('comparison marks changed, unchanged and new sections against the previous frame',()=>{
  const previous={type:'snapshot',revision:1,chat:[],locals:[{id:'a',position:[0,0,0]}]};
  const next={type:'snapshot',revision:2,chat:[],locals:[{id:'a',position:[1,0,0]}],builds:[]};
  const compared=compareSnapshotSections(previous,next);
  const changed=Object.fromEntries(compared.sections.map(item=>[item.key,item.changed]));
  assert.deepEqual(changed,{type:false,revision:true,chat:false,locals:true,builds:true});
  assert.equal(compared.total,encodedBytes(next));
  assert.equal(compared.framing,framingFor(5));
  const bytesOf=key=>compared.sections.find(item=>item.key===key).bytes;
  assert.equal(compared.unchangedBytes,bytesOf('type')+bytesOf('chat'));
  // Identical frames repeat every byte except the framing.
  const same=compareSnapshotSections(next,structuredClone(next));
  assert.equal(same.sections.every(item=>!item.changed),true);
  assert.equal(same.unchangedBytes,same.total-same.framing);
});

for (const players of [1,8]) {
  test(`a real ${players}-player frame splits into sections that sum to its encoded size`,async t=>{
    const world=await warmedWorld(players);
    const previous=world.snapshot();
    const frame=nextBroadcast(world);
    const compared=compareSnapshotSections(previous,frame);
    const measured=measureSnapshotSections(frame);

    // Every member the frame encodes is counted exactly once, and nothing else.
    assert.equal(measured.total,encodedBytes(frame));
    assert.equal(measured.total,measured.framing+measured.sections.reduce((sum,item)=>sum+item.bytes,0));
    assert.equal(measured.framing,framingFor(measured.sections.length));
    assert.deepEqual(measured.sections.map(item=>item.key).sort(),Object.keys(JSON.parse(JSON.stringify(frame))).sort());
    assert.deepEqual(compared.sections.map(({key,bytes})=>({key,bytes})),measured.sections);
    assert.equal(frame.players.length,players);

    // The clock always moves between broadcasts; with no commands, chat and builds cannot.
    const changed=new Map(compared.sections.map(item=>[item.key,item.changed]));
    assert.equal(changed.get('revision'),true);
    assert.equal(changed.get('elapsed'),true);
    assert.equal(changed.get('chat'),false);
    assert.equal(changed.get('builds'),false);

    t.diagnostic(`${players} player(s): ${measured.total} bytes, framing ${measured.framing}, unchanged since previous broadcast ${compared.unchangedBytes}`);
    for (const item of compared.sections) t.diagnostic(`${item.key}: ${item.bytes} bytes${item.changed?' (changed)':''}`);
  });
}
