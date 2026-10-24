import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../../server/district-data.js';
import { DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';
import { attachEastGardenCommons } from '../src/east-garden-commons.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';
import { MARKET_NAME, DISTRICT_NAME, connectedLocationAt, locationCrossing } from '../src/world-location-label.js';
const district=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const world=attachEastGardenCommons(district), layout=world.eastGardenCommons;

test('worlds without connected locations keep their existing path label',()=>{
  assert.equal(connectedLocationAt(district,layout.edge-5,-1335),null);
  assert.equal(connectedLocationAt(null,0,0),null);
});

test('a walker crossing the seam is told where they are, once per crossing',()=>{
  const environment=createWalkingEnvironment(world),walker=createWalkingState(environment,[layout.edge-6,-1335,0],-Math.PI/2);
  const announcements=[];let location=null;
  const paint=()=>{const next=connectedLocationAt(world,walker.position[0],-walker.position[2]),crossing=locationCrossing(location,next);location=next;if(crossing)announcements.push(crossing);};
  paint();
  assert.equal(location,DISTRICT_NAME);
  for(let i=0;i<400;i++){stepWalking(walker,environment,{forward:1,fast:true},.04);paint();}
  assert.equal(location,MARKET_NAME);
  walker.yaw=Math.PI/2;walker.velocity=[0,0];walker.acceleration=[0,0];
  for(let i=0;i<400;i++){stepWalking(walker,environment,{forward:1,fast:true},.04);paint();}
  assert.equal(location,DISTRICT_NAME);
  assert.deepEqual(announcements,[`Entering ${MARKET_NAME}`,`Back in ${DISTRICT_NAME}`]);
});

test('the District edge itself belongs to the District, matching server crossing rules',()=>{
  assert.equal(connectedLocationAt(world,layout.edge,-1335),DISTRICT_NAME);
  assert.equal(connectedLocationAt(world,layout.edge+.01,-1335),MARKET_NAME);
  assert.equal(locationCrossing(null,MARKET_NAME),null);
  assert.equal(locationCrossing(MARKET_NAME,MARKET_NAME),null);
});

test('the composed destination is named Bayou Market Commons on arrival', async () => {
  const market = await loadDistrictData({districtRevision:'east-garden-commons-market-1'});
  const name = connectedLocationAt(market,market.eastGardenCommons.edge+20,-1335);
  assert.equal(name,'Bayou Market Commons');
  assert.equal(locationCrossing(DISTRICT_NAME,name),'Entering Bayou Market Commons');
});
