import {createCompanionNavigation} from './companion-navigation.js';
let navigation=null;
self.onmessage=({data})=>{
  if(data.type==='init')navigation=createCompanionNavigation(data.world,{placement:data.placement});
  if(data.type==='route')self.postMessage({id:data.id,route:navigation?.route(data.start,data.end)??null});
};
