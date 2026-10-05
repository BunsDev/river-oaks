import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { AVATAR_PROFILES,loadResidentAvatar } from '../src/avatars.js';

test('all seven rigs sit with bent knees and soles above ground on the authored high cushions',async()=>{
  const load=GLTFLoader.prototype.loadAsync,document=globalThis.document,window=globalThis.window;
  GLTFLoader.prototype.loadAsync=async url=>({scene:(await loadCharacterRig(url.split('/').at(-1).replace('.glb',''))).scene});
  globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}})})};
  globalThis.window={matchMedia:()=>({matches:false})};
  try{
    for(const profile of [...AVATAR_PROFILES,'jevica'])for(const height of [.595,.705]) {
      const avatar=await loadResidentAvatar(0,`furniture-${profile}-${height}`,profile,{folk:false,faceRecipe:{}}),root=avatar.object;
      try{
        root.position.y=height-avatar.rig.hipHeight+.025;root.rotation.y=.7;
        for(let frame=0;frame<10;frame++)avatar.update(frame*16,'continue',false,{speed:0,riding:true,ridingKind:'seat',seatToFloor:height},()=>0);
        root.updateWorldMatrix(true,true);
        const arm=avatar.rig.model.getObjectByName('upperarm_r'),restArm=arm.quaternion.clone();
        for(let frame=10;frame<70;frame++)avatar.update(frame*16,'wave',false,{speed:0,riding:true,ridingKind:'seat',seatToFloor:height},()=>0);
        assert.ok(arm.quaternion.angleTo(restArm)>.7,`${profile}: seated visitors can visibly wave`);
        root.updateWorldMatrix(true,true);
        for(const leg of avatar.feet) {
          const hip=leg.thigh.getWorldPosition(new THREE.Vector3()),knee=leg.calf.getWorldPosition(new THREE.Vector3()),ankle=leg.foot.getWorldPosition(new THREE.Vector3());
          const bend=180-hip.clone().sub(knee).angleTo(ankle.clone().sub(knee))*180/Math.PI;
          assert.ok(bend>70 && bend<115,`${profile}/${height}: seated knee angle ${bend}`);
          assert.ok(Math.abs(hip.y-height-.025)<.015,`${profile}: hips remain on the cushion`);
          const sole=Math.min(...leg.sole.map(point=>leg.foot.localToWorld(point.clone()).y));
          assert.ok(sole>=-.01,`${profile}: footwear must not enter the floor (${sole})`);
          assert.ok(leg.error<.015,`${profile}: feet remain in reach`);
        }
      }finally{avatar.dispose();}
    }
  }finally{GLTFLoader.prototype.loadAsync=load;globalThis.document=document;globalThis.window=window;}
});
