import test from 'node:test';
import assert from 'node:assert/strict';
import { RIBBON_RULES, expandRibbon, validateRibbon } from '../../shared/city-kit/ribbon-layout.js';

// A synthetic Ribbon (#825 slice 1): an L-shaped canopy walk and a straight arcade.
// Not a District placement; the real path waits on the parcel ruling.
const fixture = () => ({
  id: 'ribbon-fixture', kit: 'ribbon-1', seed: 825,
  segments: [
    { id: 'a', points: [[0, 0], [12, 0], [12, 9]], width: 3, clearHeight: 3.6, style: 'canopy', seats: { every: 2, side: 'right' } },
    { id: 'b', points: [[20, 0], [20, 10]], width: 2.4, clearHeight: 3.2, style: 'arcade' },
  ],
  exclusions: [
    { id: 'shop-door', kind: 'doorway', rect: [6, -5, 8, -3] },
    { id: 'bench-reach', kind: 'seat-access', rect: [15, 6, 17, 8] },
  ],
});
const withChange = change => { const recipe = fixture(); change(recipe); return recipe; };
const ofSegment = (plan, id) => ['modules', 'posts', 'lamps', 'fans', 'seats'].map(key => plan[key].filter(item => item.segment === id));

test('the same recipe expands to byte-identical placements with stable IDs', () => {
  const first = expandRibbon(fixture()), second = expandRibbon(fixture());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.stats, { segments: 2, modules: 10, posts: 24, lamps: 6, fans: 10, seats: 3, skipped: 0 });
  // Each post records how far along its segment it stands.
  assert.deepEqual(first.posts.filter(post => post.segment === 'b' && post.side === 'left').map(post => post.station), [0, 3.333, 6.667, 10]);
  assert.deepEqual(first.modules.filter(m => m.segment === 'a').map(m => [m.id, m.kind]), [
    ['ribbon:a:module:000', 'end'], ['ribbon:a:module:001', 'straight'], ['ribbon:a:module:002', 'straight'], ['ribbon:a:module:003', 'straight'],
    ['ribbon:a:module:004', 'corner'], ['ribbon:a:module:005', 'straight'], ['ribbon:a:module:006', 'end'],
  ]);
  assert.deepEqual(first.seats.map(seat => seat.id), ['ribbon:a:seat:001', 'ribbon:a:seat:003', 'ribbon:a:seat:005']);
  // Runs split into equal modules near 3 m: 12 m into four, 9 m into three, 10 m into three.
  assert.deepEqual(first.modules.map(m => m.length), [3, 3, 3, 3, 3, 3, 3, 3.333, 3.333, 3.333]);
  // The corner's post pair is mitred: the outside post sits on both outer edges, 1.5 m off each.
  assert.deepEqual(first.posts.find(post => post.id === 'ribbon:a:post:004:r').position, [13.5, -1.5]);
  assert.deepEqual(first.posts.find(post => post.id === 'ribbon:a:post:004:l').position, [10.5, 1.5]);
});

test('the seed varies only fan finishes, never a position', () => {
  const a = expandRibbon(fixture()), b = expandRibbon(withChange(recipe => { recipe.seed = 7; }));
  const strip = plan => ({ ...plan, seed: 0, hash: '', fans: plan.fans.map(({ finish, ...fan }) => fan) });
  assert.deepEqual(strip(a), strip(b));
  assert.notDeepEqual(a.fans.map(fan => fan.finish), b.fans.map(fan => fan.finish));
  assert.ok(a.fans.every(fan => RIBBON_RULES.fanFinishes.includes(fan.finish)));
});

test('moving one control point changes only its own segment', () => {
  const before = expandRibbon(fixture()), after = expandRibbon(withChange(recipe => { recipe.segments[1].points[1] = [20, 13]; }));
  assert.deepEqual(ofSegment(after, 'a'), ofSegment(before, 'a'));
  assert.notDeepEqual(ofSegment(after, 'b'), ofSegment(before, 'b'));
  assert.equal(after.stats.modules, 11);
  assert.notEqual(after.hash, before.hash);
});

test('a walk narrower than 1.2 m or under 3 m of headroom is refused', () => {
  assert.throws(() => validateRibbon(withChange(recipe => { recipe.segments[0].width = 1.1; })), /segment a is narrower than 1.2 m/);
  assert.equal(validateRibbon(withChange(recipe => { recipe.segments[0].width = 1.2; })).segments[0].width, 1.2);
  assert.throws(() => validateRibbon(withChange(recipe => { recipe.segments[1].clearHeight = 2.8; })), /segment b has less than 3 m headroom/);
});

test('a post or seat in a doorway, seat access, no-go or step-free zone is refused', () => {
  // Post 001 left stands at [3, 1.5]; seat 001 (right side) spans x 3.7-5.3, y -2.5 to -1.9.
  for (const kind of RIBBON_RULES.exclusionKinds) {
    const onPost = withChange(recipe => { recipe.exclusions.push({ id: 'probe', kind, rect: [2.8, 1.2, 3.4, 1.8] }); });
    assert.throws(() => expandRibbon(onPost), new RegExp(`ribbon:a:post:001:l lands in ${kind} probe; set maxSpan on segment a or move a point`));
    const onSeat = withChange(recipe => { recipe.exclusions.push({ id: 'probe', kind, rect: [4, -2.4, 5, -2] }); });
    assert.throws(() => expandRibbon(onSeat), new RegExp(`ribbon:a:seat:001 lands in ${kind} probe`));
  }
  // Touching a post's edge is not standing in the zone.
  assert.doesNotThrow(() => expandRibbon(withChange(recipe => { recipe.exclusions.push({ id: 'edge', kind: 'no-go', rect: [3.15, 1, 4, 2] }); })));
});

test('with a maxSpan, a post in a zone is left out and the canopy spans over it; IDs and modules stay put', () => {
  const base = expandRibbon(fixture());
  // Post 002 left (with lamp 002) stands at [6, 1.5].
  const spanning = withChange(recipe => { recipe.segments[0].maxSpan = 6; recipe.exclusions.push({ id: 'door', kind: 'doorway', rect: [5.8, 1.2, 6.4, 2] }); });
  const plan = expandRibbon(spanning);
  assert.deepEqual(plan.skipped, [{ id: 'ribbon:a:post:002:l', segment: 'a', zone: 'door', kind: 'doorway' }]);
  assert.equal(plan.posts.some(post => post.id === 'ribbon:a:post:002:l'), false);
  assert.equal(plan.posts.some(post => post.id === 'ribbon:a:post:002:r'), true, 'the other edge keeps its post');
  assert.equal(plan.lamps.some(lamp => lamp.id === 'ribbon:a:lamp:002'), false, 'a lamp goes with its post');
  assert.deepEqual(plan.stats, { ...base.stats, posts: 23, lamps: 5, skipped: 1 });
  assert.deepEqual(plan.modules, base.modules);
  assert.deepEqual(plan.fans, base.fans);
  assert.deepEqual(plan.seats, base.seats);
});

test('a gap wider than maxSpan, an end post or a seat in a zone is still refused', () => {
  // Posts 001 and 002 left both out: 9 m from post 000 to post 003.
  const wide = withChange(recipe => { recipe.segments[0].maxSpan = 6; recipe.exclusions.push({ id: 'awning', kind: 'no-go', rect: [2.8, 1.2, 6.2, 1.8] }); });
  assert.throws(() => expandRibbon(wide), /a left edge spans 9 m from ribbon:a:post:000:l to ribbon:a:post:003:l, over its maxSpan 6 m \(left out: ribbon:a:post:001:l in no-go awning, ribbon:a:post:002:l in no-go awning\)/);
  const end = withChange(recipe => { recipe.segments[0].maxSpan = 6; recipe.exclusions.push({ id: 'door', kind: 'doorway', rect: [-0.3, 1.2, 0.3, 1.8] }); });
  assert.throws(() => expandRibbon(end), /ribbon:a:post:000:l lands in doorway door; move a point of segment a/);
  const seat = withChange(recipe => { recipe.segments[0].maxSpan = 6; recipe.exclusions.push({ id: 'probe', kind: 'no-go', rect: [4, -2.4, 5, -2] }); });
  assert.throws(() => expandRibbon(seat), /ribbon:a:seat:001 lands in no-go probe/);
  for (const maxSpan of [2, 6.5]) assert.throws(() => validateRibbon(withChange(recipe => { recipe.segments[0].maxSpan = maxSpan; })), /maxSpan must be between 3 and 6 m/);
});

test('a seat on the inside of a corner would block the next run and is refused', () => {
  const inside = withChange(recipe => { recipe.segments[0].seats.side = 'left'; });
  assert.throws(() => expandRibbon(inside), /ribbon:a:seat:003 lands on the walking corridor of ribbon:a/);
});

test('malformed recipes are refused before expansion', () => {
  const cases = [
    [recipe => { recipe.kit = 'ribbon-0'; }, /kit must be ribbon-1/],
    [recipe => { recipe.segments[1].id = 'a'; }, /segment id a/],
    [recipe => { recipe.segments[0].points = [[0, 0]]; }, /two or more/],
    [recipe => { recipe.segments[0].points = [[0, 0], [1, 0]]; }, /run 0 is shorter than 1.5 m/],
    [recipe => { recipe.segments[0].points = [[0, 0], [10, 0], [4, 2]]; }, /turns more than 90° at point 1/],
    [recipe => { recipe.segments[0].style = 'tent'; }, /style must be canopy or arcade/],
    [recipe => { recipe.exclusions[0].kind = 'lawn'; }, /exclusion shop-door kind/],
    [recipe => { recipe.exclusions[0].rect = [1, 1, 0, 2]; }, /exclusion shop-door rect/],
    [recipe => { recipe.extra = true; }, /unknown key extra/],
  ];
  for (const [change, error] of cases) assert.throws(() => expandRibbon(withChange(change)), error);
});
