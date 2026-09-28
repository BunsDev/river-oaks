import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigationService } from '../src/navigation-service.js';

const world={scene:'district',bounds_m:[-20,-20,20,20],collisionPolygons:[],roads:[{points:[[-20,0,0],[20,0,0]],width_m:12}]};

test('visitor navigation carries road access to the worker without changing resident defaults',async()=>{
  const previous=globalThis.Worker,packets=[];
  globalThis.Worker=class {
    postMessage(packet){packets.push(packet);if(packet.type==='route')queueMicrotask(()=>this.onmessage({data:{id:packet.id,route:[packet.end]}}));}
    terminate(){}
  };
  try {
    for(const allowRoads of [false,true]) {
      packets.length=0;
      const service=createNavigationService(world,allowRoads?{interiors:true,allowRoads:true}:{});
      await service.route([0,0],[10,0]);
      assert.equal(packets[0].allowRoads,allowRoads);
      service.dispose();
    }
  } finally {globalThis.Worker=previous;}
});

test('the real route worker lets the visitor leave a wide street but retains obstacles and pedestrian defaults',async()=>{
  const previous=globalThis.self,replies=[];
  globalThis.self={postMessage:reply=>replies.push(reply)};
  try {
    await import('../src/navigation-worker.js');
    const route=(allowRoads,target=[10,0],data=world)=>{
      self.onmessage({data:{type:'init',world:data,allowRoads}});
      self.onmessage({data:{type:'route',id:1,start:[0,0],end:target}});
      return replies.at(-1).route;
    };
    assert.equal(route(false),null,'Residents cannot use a road-center route');
    assert.deepEqual(route(true),[[10,0]],'A guided visitor can walk out from the same road as a manual visitor');
    assert.equal(route(true,[10,0],{...world,collisionPolygons:[[[8,-2],[12,-2],[12,2],[8,2]]]}),null,'Road access never permits walking through a building');
  } finally {globalThis.self=previous;}
});
