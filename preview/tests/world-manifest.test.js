import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWorldManifest, validateDistrictLocation, localToWorld, worldToLocal, locationWorldBounds } from '../src/world-manifest.js';
const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
// Keep malformed-input fixtures independent of the bundled location count/order.
const manifest = () => {
  const bundled = read('world-manifest');
  const district = { ...bundled.locations.find(location => location.id === 'river-oaks-district'), adjacent: ['empty-test'] };
  const [west, south, east, north] = district.bounds_m;
  return { ...bundled, default_location: district.id, locations: [district, {
    id: 'empty-test', status: 'reserved', bounds_m: [east, south, east + (east - west), north],
    translation_m: [0, 0, 0], content_revision: 'empty-v1', entries: [], adjacent: [district.id],
  }] };
};

test('registered District preserves original objects, IDs, coordinates and data', () => {
  const district = read('district'), before = structuredClone(district);
  assert.equal(validateDistrictLocation(read('world-manifest'), district), district);
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


test('rejects transformed rectangles that collapse through floating-point precision', () => {
  const value = manifest();
  value.locations = [{ id: 'tiny', status: 'authored', bounds_m: [0, 0, 1, 1],
    translation_m: [1e20, 1e20, 0], content_revision: 'v1', entries: [], adjacent: [] }];
  value.default_location = 'tiny';
  assert.throws(() => validateWorldManifest(value), /Invalid world manifest.*bounds/);
});

test('a reserved location cannot be the default arrival', () => {
  const value = manifest();
  value.default_location = value.locations[1].id;
  assert.throws(() => validateWorldManifest(value), /default.*authored/);
});

test('legacy District rejects an unsupported content revision instead of silently loading stale content', () => {
  const value = manifest(); value.locations[0].content_revision = 'district-v999';
  assert.throws(() => validateDistrictLocation(value, read('district')), /District content revision/);
});

test('registration in a translated local frame can be added, serialized and removed without rewriting District', () => {
  const value = manifest(), district = structuredClone(value.locations[0]);
  const [west, south, east, north] = district.bounds_m;
  const neighbor = value.locations[1];
  neighbor.bounds_m = [0, 0, east - west, north - south];
  neighbor.translation_m = [east, south, 12];
  neighbor.status = 'authored';
  neighbor.content_revision = 'garden-v2';
  neighbor.entries = [{ id: 'west-gate', position_m: [0, 20, 3] }];
  const decoded = validateWorldManifest(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(decoded.locations[0], district);
  assert.deepEqual(localToWorld(decoded.locations[1], neighbor.entries[0].position_m), [east, south + 20, 15]);
  decoded.locations.pop(); decoded.locations[0].adjacent = [];
  assert.equal(validateDistrictLocation(decoded, read('district')).scene, 'district');
});

test('finite inputs cannot overflow transforms or area', () => {
  const location = { translation_m: [Number.MAX_VALUE, 0, 0] };
  assert.throws(() => localToWorld(location, [Number.MAX_VALUE, 0, 0]), /overflow/);
  assert.throws(() => worldToLocal(location, [-Number.MAX_VALUE, 0, 0]), /overflow/);
  const value = manifest(); value.locations = [value.locations[0]];
  value.locations[0].adjacent = [];
  value.locations[0].bounds_m = [-1e200, -1e200, 1e200, 1e200];
  assert.throws(() => validateWorldManifest(value), /area overflow/);
});

for (const [name, mutate] of Object.entries({
  units: value => { value.units = 'feet'; },
  crs: value => { value.crs = 'EPSG:4326'; },
  empty: value => { value.locations = []; },
  invalidId: value => { value.locations[0].id = 'Invalid ID'; },
  status: value => { value.locations[0].status = 'loading'; },
  nonfiniteBounds: value => { value.locations[0].bounds_m[0] = NaN; },
  selfAdjacent: value => { value.locations[0].adjacent = [value.locations[0].id]; },
  duplicateAdjacent: value => { value.locations[0].adjacent.push(value.locations[0].adjacent[0]); },
  cornerOnly: value => { value.locations[1].translation_m[1] = value.locations[0].bounds_m[3] - value.locations[0].bounds_m[1]; },
  entryHeight: value => { value.locations[0].entries[0].position_m[2] = Infinity; },
})) test(`rejects malformed ${name}`, () => {
  const value = manifest(); mutate(value);
  assert.throws(() => validateWorldManifest(value), /Invalid world manifest/);
});

test('rejects a rectangle whose area underflows to zero', () => {
  const value = manifest();
  value.locations = [{ id: 'tiny', status: 'authored', bounds_m: [0, 0, 1e-200, 1e-200],
    translation_m: [0, 0, 0], content_revision: 'v1', entries: [], adjacent: [] }];
  value.default_location = 'tiny';
  assert.throws(() => validateWorldManifest(value), /bounds area underflow/);
});

test('additive metadata survives serialization without changing v1 transforms', () => {
  const value = manifest(); value.metadata = { label: 'World' };
  value.locations[0].metadata = { label: 'District' };
  const decoded = validateWorldManifest(JSON.parse(JSON.stringify(value)));
  assert.deepEqual(decoded, value);
  assert.deepEqual(localToWorld(decoded.locations[0], [1, 2, 3]), [1, 2, 3]);
  decoded.locations[0].metadata.label = 'Changed';
  assert.equal(value.locations[0].metadata.label, 'District');
});

test('programmatic coordinates cannot omit a component through a sparse array', () => {
  const value = manifest();
  delete value.locations[0].entries[0].position_m[2];
  assert.throws(() => validateWorldManifest(value), /Invalid world manifest/);
  const point = [1, 2, 3]; delete point[2];
  const location = { translation_m: [0, 0, 0] };
  assert.throws(() => localToWorld(location, point), /finite coordinate/);
  assert.throws(() => worldToLocal(location, point), /finite coordinate/);
});


test('location and entry identities survive registry reordering', () => {
  const fixture = manifest(), districtRegistration = fixture.locations[0];
  const [west, south] = districtRegistration.bounds_m;
  districtRegistration.entries.push({ id: 'second-entry', position_m: [west + 0.25, south + 0.25, 0] });
  const original = validateWorldManifest(fixture);
  const reordered = structuredClone(original);
  reordered.locations.reverse();
  for (const location of reordered.locations) location.entries.reverse();
  const validated = validateWorldManifest(reordered);
  assert.equal(validated.default_location, original.default_location);
  for (const before of original.locations) {
    const after = validated.locations.find(location => location.id === before.id);
    assert.deepEqual(after.bounds_m, before.bounds_m);
    assert.equal(after.content_revision, before.content_revision);
    assert.deepEqual(after.adjacent, before.adjacent);
    for (const entry of before.entries) {
      assert.deepEqual(localToWorld(after, after.entries.find(item => item.id === entry.id).position_m),
        localToWorld(before, entry.position_m));
    }
  }
  const district = read('district');
  assert.equal(validateDistrictLocation(validated, district), district);
});

test('authored Commons partitions the original reservation without overlaps or total-area growth', () => {
  const value=validateWorldManifest(read('world-manifest')), district=value.locations.find(location=>location.id==='river-oaks-district');
  const commons=value.locations.find(location=>location.id==='east-garden-commons');
  assert.equal(commons.status,'authored');
  assert.equal(commons.content_revision,'east-garden-commons-market-1');
  assert.equal(commons.entries[0].position_m[0],district.bounds_m[2]);
  assert.equal(commons.entries[0].position_m[1],-1335);
  const area=location=>{const [w,s,e,n]=locationWorldBounds(location);return (e-w)*(n-s);};
  // Woodland Heights (woodland-heights-1) is new land east of the original envelope, which the rest still partition exactly.
  const woodland=value.locations.find(location=>location.id==='woodland-heights');
  assert.ok(Math.abs(value.locations.filter(location=>location!==woodland).reduce((sum,location)=>sum+area(location),0)-area(district)*3)<1e-8);
  assert.ok(Math.abs(area(woodland)-45*(district.bounds_m[3]-district.bounds_m[1]))<1e-6);
  // Bayou Heights and Studewood authored the east reserve, and the Bayou Terraces the strips beside the Commons: none remains reserved.
  assert.equal(value.locations.filter(location=>location.status==='reserved').length,0);
  assert.ok(value.locations.filter(location=>location.status==='reserved').every(location=>location.entries.length===0));
});
