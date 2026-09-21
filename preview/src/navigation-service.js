// At most one route query per world, outside the render thread. Replacement
// worlds terminate the worker and settle its pending promise immediately.
export function createNavigationService(world, { interiors = false } = {}) {
  if(world.scene!=='district') return null;
  let worker=null,pending=null,sequence=0,disposed=false;
  const stop=()=>{worker?.terminate();worker=null;};
  const settle=route=>{
    if(!pending) return;
    clearTimeout(pending.deadline);const {resolve}=pending;pending=null;resolve(route);
  };
  const start=()=>{
    worker=new Worker(new URL('./navigation-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(data.id===pending?.id) settle(data.route);};
    worker.onerror=()=>{stop();settle(null);};
    worker.postMessage({type:'init',world:{scene:world.scene,bounds_m:world.bounds_m,site_ring:world.site_ring,roads:world.roads,collisionPolygons:world.collisionPolygons,terrain:world.terrain,walkSurfaceOffset:world.walkSurfaceOffset,...(interiors ? {stores:world.stores,buildings:world.buildings} : {}),vegetation:{branch_supports:world.vegetation?.branch_supports ?? []}}});
  };
  return {
    route(from,to) {
      if(disposed || pending) return Promise.resolve(null);
      return new Promise(resolve=>{
        const id=++sequence;
        pending={id,resolve,deadline:setTimeout(()=>{stop();settle(null);},2000)};
        try {if(!worker) start();worker.postMessage({type:'route',id,start:from,end:to});}
        catch {stop();settle(null);}
      });
    },
    dispose(){disposed=true;stop();settle(null);},
  };
}
