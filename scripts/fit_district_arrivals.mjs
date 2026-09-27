// Rebuild authored arrival points after a road-width change; source facades stay fixed.
import {readFileSync,writeFileSync} from 'node:fs';
import {storefrontSpot} from '../preview/src/arrival.js';
import {createWalkingEnvironment} from '../preview/src/walking.js';
import {clearOfRoads} from '../preview/src/street-furniture.js';
const path=new URL('../preview/public/data/district.json',import.meta.url),world=JSON.parse(readFileSync(path));
const environment=createWalkingEnvironment(world);
for(const store of world.stores){const spot=storefrontSpot(world,store,'leave',{isFree:environment.isFree});if(!clearOfRoads(world,spot[0],-spot[1],0,{vehiclesOnly:true})||!environment.isFree(spot[0],-spot[1]))throw new Error(`No safe arrival at ${store.name}`);store.mapped_visit??=store.visit;store.visit=spot;}
writeFileSync(path,JSON.stringify(world)+'\n');console.log(`Fitted ${world.stores.length} storefront arrivals to widened streets`);
