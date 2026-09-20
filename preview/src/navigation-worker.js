import { createResidentNavigation } from './navigation.js';

let navigation=null;
self.onmessage=({data})=>{
  if(data.type==='init') {navigation=createResidentNavigation(data.world);return;}
  if(data.type==='route') self.postMessage({id:data.id,route:navigation?.route(data.start,data.end) ?? null});
};
