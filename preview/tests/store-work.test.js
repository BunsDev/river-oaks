import test from 'node:test';
import assert from 'node:assert/strict';
import { staffWorkPose, blendStationPose } from '../src/store-work.js';

test('work cycles return smoothly to rest without moving support legs',()=>{
  for(const theme of ['fashion','dining','gelato','gallery','salon','wellness']) {
    const initial=staffWorkPose(theme,0),end=staffWorkPose(theme,12);
    assert.deepEqual(initial,end);
    let previous=initial;
    for(let i=1;i<=720;i++) {
      const pose=staffWorkPose(theme,i/60);
      for(const [joint,angles] of Object.entries(pose)) {
        assert.ok(!/thigh|calf|foot/.test(joint));
        angles.forEach((angle,axis)=>{assert.ok(Number.isFinite(angle));assert.ok(Math.abs(angle-previous[joint][axis])<0.035,'no discontinuous joint jumps');});
      }
      previous=pose;
    }
  }
  assert.notDeepEqual(staffWorkPose('dining',5),staffWorkPose('salon',5));
});
test('seated conversation preserves legs, limits head twist and blends away from work',()=>{
  const base={thigh_l:[1.45,0,0],calf_l:[-1.4,0,0]},work=staffWorkPose('salon',5);
  const listening=blendStationPose(base,work,1,Math.PI);
  assert.deepEqual(listening.thigh_l,base.thigh_l);assert.deepEqual(listening.calf_l,base.calf_l);
  assert.equal(listening.head[1],0.85);assert.deepEqual(listening.upperarm_l,[0,0,0]);
  const halfway=blendStationPose(base,work,0.5,0.6);
  assert.equal(halfway.head[1],(work.head[1]+0.6)/2);
});

test('conversation height is shared by head and neck without changing supported limbs',()=>{
  const base={thigh_l:[1.45,0,0],calf_l:[-1.4,0,0]},work=staffWorkPose('dining',5);
  const level=blendStationPose(base,work,1,0,0),up=blendStationPose(base,work,1,0,-.45),down=blendStationPose(base,work,1,0,.3);
  assert.ok(up.head[0]<level.head[0]-.2 && up.neck_01?.[0]<-.1,'Look up through the neck and head');
  assert.ok(down.head[0]>level.head[0]+.15 && down.neck_01?.[0]>.08,'Look down toward a seated visitor');
  for(const joint of ['thigh_l','calf_l','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r'])assert.deepEqual(up[joint],level[joint]);
});
