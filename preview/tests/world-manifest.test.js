import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWorldManifest, validateDistrictLocation, localToWorld, worldToLocal, locationWorldBounds } from '../src/world-manifest.js';
const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const manifest = () => read('world-manifest');

test('registered District preserves original objects, IDs, coordinates and data', () => {
  const district = read('district'), before = structuredClone(district);
  assert.equal(validateDistrictLocation(manifest(), district), district);
  assert.deepEqual(district, before);
  const value = manifest(), validated = validateWorldManifest(value);
  validated.locations[0].bounds_m[0] = 0;
  assert.notDeepEqual(validated, value);
});

test('second empty location registers and removes without changing District', () => {
  const value = manifest();
  const district=value.locations[0], [west,south,east,north]=district.bounds_m;
  const empty={id:'empty-test',status:'reserved',bounds_m:[east,south,east+(east-west),north],translation_m:[0,0,0],content_revision:'empty-v1',entries:[],adjacent:[district.id]};
  district.adjacent=[empty.id];value.locations=[district,empty];
  assert.equal(validateWorldManifest(value).locations[1].status, 'reserved');
  value.locations.pop(); value.locations[0].adjacent = [];
  assert.equal(validateWorldManifest(value).locations.length, 1);
  assert.equal(validateDistrictLocation(value, read('district')).scene, 'district');
});

test('translations round trip east/north/up and transform all bounds', () => {
  const location = {translation_m:[100,-200,8],bounds_m:[-10,-20,30,40]};
  assert.deepEqual(localToWorld(location,[2,3,4]), [102,-197,12]);
  assert.deepEqual(worldToLocal(location,[102,-197,12]),[2,3,4]);
  assert.deepEqual(locationWorldBounds(location),[90,-220,130,-160]);
  assert.throws(() => localToWorld(location,[NaN,0,0]), /finite/);
});

const invalid = {
  version: m => { m.schema_version = 2; },
  origin: m => { m.origin[0] = Infinity; },
  axes: m => { m.axes = 'east-up-north'; },
  duplicate: m => { m.locations[1].id = m.locations[0].id; },
  inverted: m => { m.locations[0].bounds_m.reverse(); },
  translation: m => { m.locations[0].translation_m = [0,0]; },
  overlap: m => { m.locations[1].bounds_m[0] -= 1; },
  translatedOverlap: m => { m.locations[1].translation_m[0] = -10; },
  gap: m => { m.locations[1].bounds_m[0] += 1; },
  dangling: m => { m.locations[0].adjacent = ['missing']; },
  oneWay: m => { m.locations[1].adjacent = []; },
  entry: m => { m.locations[0].entries[0].position_m = [0,0,0]; },
  duplicateEntry: m => { m.locations[0].entries.push(m.locations[0].entries[0]); },
  default: m => { m.default_location = 'missing'; },
  revision: m => { m.locations[0].content_revision = ''; },
};
for (const [name, mutate] of Object.entries(invalid)) test(`rejects ${name}`, () => {
  const value = manifest(); mutate(value);
  assert.throws(() => validateWorldManifest(value), /Invalid world manifest/);
});

test('legacy compatibility rejects moved origin, bounds or identity transform', () => {
  for (const key of ['origin','bounds_m']) {
    const district = read('district'); district[key][0] += 1;
    assert.throws(() => validateDistrictLocation(manifest(),district), /mismatch/);
  }
  const value = manifest(); value.locations[0].translation_m[2] = 1;
  assert.throws(() => validateDistrictLocation(value, read('district')), /identity transform/);
});

test('authored Commons partitions the original reservation without overlaps or total-area growth', () => {
  const value=validateWorldManifest(manifest()), district=value.locations[0];
  const commons=value.locations.find(location=>location.id==='east-garden-commons');
  assert.equal(commons.status,'authored');
  assert.equal(commons.content_revision,'east-garden-commons-market-1');
  assert.equal(commons.entries[0].position_m[0],district.bounds_m[2]);
  assert.equal(commons.entries[0].position_m[1],-1335);
  const area=location=>{const [w,s,e,n]=locationWorldBounds(location);return (e-w)*(n-s);};
  assert.ok(Math.abs(value.locations.reduce((sum,location)=>sum+area(location),0)-area(district)*3)<1e-8);
  assert.equal(value.locations.filter(location=>location.status==='reserved').length,3);
  assert.ok(value.locations.filter(location=>location.status==='reserved').every(location=>location.entries.length===0));
});
