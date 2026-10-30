import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDepthOccurrences, compareDepthBaseline, burnDownDepthBaseline } from '../src/depth-layer-baseline.js';

const occurrence = (extra = {}) => ({ a:'wall|stone', b:'trim|brass', normal:[0,1,0], cell:[0,0,0], bounds:[0,0,0,2,0,2], count:2, overlap:4, size:2, gapMin:0, gapMax:0, ...extra });
const baseline = (...items) => ({ version:2, occurrences:items });

test('a known pair moved elsewhere, enlarged, duplicated or turned cannot reuse its exemption', () => {
  const original = occurrence(), known = baseline(original);
  assert.equal(compareDepthBaseline(known,[original]).length,0);
  for (const changed of [occurrence({cell:[25,0,0],bounds:[100,0,0,102,0,2]}), occurrence({bounds:[0,0,0,3,0,2],overlap:6,size:2}), occurrence({count:3}), occurrence({normal:[0,-1,0]})])
    assert.equal(compareDepthBaseline(known,[changed]).length,1,JSON.stringify(changed));
});

test('submillimetre numerical noise is tolerated but a newly smaller separation is not', () => {
  const original=occurrence({gapMin:.01,gapMax:.012});
  assert.equal(compareDepthBaseline(baseline(original),[occurrence({bounds:[.0001,0,0,2,0,2],gapMin:.01001,gapMax:.01201})]).length,0);
  assert.equal(compareDepthBaseline(baseline(original),[occurrence({gapMin:.001,gapMax:.012})]).length,1);
});

test('stations combine worst observed budgets instead of counting the same triangles three times', () => {
  const a=occurrence(), b=occurrence({count:3,overlap:5});
  const actual=collectDepthOccurrences([{occurrences:[a]},{occurrences:[b]}]);
  assert.equal(actual.length,1);assert.equal(actual[0].count,3);assert.equal(actual[0].overlap,5);
});

test('burn-down refuses an addition before producing a replacement and removes resolved occurrences', () => {
  const a=occurrence(), b=occurrence({cell:[2,0,0]});
  assert.throws(()=>burnDownDepthBaseline(baseline(a),[a,b]),/regression/i);
  assert.deepEqual(burnDownDepthBaseline(baseline(a,b),[a]).occurrences,[a]);
  assert.throws(()=>compareDepthBaseline({pairs:[]},[a]),/version 2/i);
});

test('recording tolerated numerical drift never increases a retained budget',()=>{
  const a=occurrence({gapMin:.01,gapMax:.012}), original=baseline(a);
  let recorded=original;
  for(let i=0;i<10;i++)recorded=burnDownDepthBaseline(recorded,[occurrence({bounds:[0,0,0,2+.0019,0,2],gapMin:.00981,gapMax:.012})]);
  assert.ok(recorded.occurrences[0].bounds[3]<=a.bounds[3]);
  assert.ok(recorded.occurrences[0].gapMin>=a.gapMin);
});

test('recording noise on a zero-thickness plane retains valid conservative bounds',()=>{
  const original=baseline(occurrence());
  const recorded=burnDownDepthBaseline(original,[occurrence({bounds:[0,.001,0,2,.001,2]})]);
  assert.ok(recorded.occurrences[0].bounds[1]<=recorded.occurrences[0].bounds[4]);
  assert.equal(compareDepthBaseline(recorded,original.occurrences).length,0);
});
