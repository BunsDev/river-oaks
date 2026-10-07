import { createHash } from 'node:crypto';
import { COMMUNITY_SCENARIOS, createCommunity, interactWithLocal, stepCommunity } from '../preview/src/community.js';
import { createResidentLife, stepResidentLife } from '../preview/src/resident-life.js';
import { personElevation } from '../preview/src/person-position.js';
import { createWalkingEnvironment, createWalkingState } from '../preview/src/walking.js';
import { grantWish, undoWish, stepWishes, wishFor, refreshWishTrouble } from '../preview/src/wishes.js';
import { storefrontSpot } from '../preview/src/arrival.js';
import { placesOf } from '../preview/src/places.js';
import { APPEARANCE_COOLDOWN_MS, MOVEMENTS, canFlyAs, canUseAppearance, isBeastAppearance, isJevicaOwner, permittedAppearance, sharedAppearance } from '../preview/src/shared-appearances.js';
import { traversalForAppearance } from '../preview/src/beast-traversal.js';
import { VEHICLES, vehicleKind } from '../preview/src/vehicle-config.js';
import { buildKind, buildGeometry, buildYaw, buildFinish, buildRoads, buildRoomAt, checkBuildSite, BUILD_REACH, BUILD_EDIT_REACH, BUILD_PLAYER_GAP, MAX_SAVED_DESIGNS } from '../preview/src/shared-build.js';
import { resolveSeat, seatYaw, SEAT_REACH } from '../preview/src/shared-seating.js';
import { WATER_REACH, WATER_MS, benchSeats, boutiquePlanters, buildPlanters, headingTo, lanePlanters, resolveBenchSeat } from '../preview/src/world-interactions.js';
import { objectCollider, blocksPlayer } from '../preview/src/creator-object.js';
import { isJevicaAdmin } from './admin.js';
import { accountName } from '../preview/src/resident-names.js';
import { DEFAULT_WORLD_ID, WORLD_PROTOCOL_VERSION, validateWorldId } from '../preview/src/world-contract.js';

const WISH_COOLDOWN_MS = 5000, TRAVEL_COOLDOWN_MS = 1000, CHAT_COOLDOWN_MS = 1000, GESTURE_COOLDOWN_MS = 1500, GESTURE_DURATION_MS = 3200, FOCUS_MS = 30000;
const LEDGER_TTL_MS = 60000, MAX_LEDGERS = 4096, MAX_ACTIVE_WISHES = 3;
const MAX_CHAT_HISTORY = 40, MAX_CHAT_LENGTH = 280;
const MAX_APPEARANCES = 4096, MAX_BUILDS = 192, MAX_BUILDS_PER_USER = 24;
const MAX_DESIGNS = 4096;
const MAX_HOME_GUESTS = 16;
const GESTURES = ['wave','bow'];
// Watering is a gesture the server starts for a planter in reach; a player
// cannot request it as a bare gesture.
const SHOWN_GESTURES = [...GESTURES,'water'];
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const copy = value => structuredClone(value);
const fields = (message, allowed) => Object.keys(message).every(key => allowed.includes(key));
const textId = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
const reject = (error, message = error) => ({ok:false,error,message});

const CHECKPOINT_VERSION = 4, MAX_CHECKPOINT_BYTES = 8 * 1024 * 1024;
const LIFE_FIELDS = ['elapsed','storm','revision','packet','cursor','paused','stats'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nonnegative = value => Number.isFinite(value) && value >= 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const point = (value, size) => Array.isArray(value) && value.length === size && value.every(Number.isFinite);
function checkpointJSON(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && (!Number.isFinite(item) || Object.is(item,-0))) {
      if (Number.isNaN(item)) throw new Error('Invalid checkpoint number');
      return {$number:Object.is(item,-0)?'-0':String(item)};
    }
    if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') throw new Error('Invalid checkpoint value');
    return item;
  });
}
function decodeCheckpoint(json) {
  return JSON.parse(json,(key,value)=>{
    if (['__proto__','prototype','constructor'].includes(key)) throw new Error('Invalid checkpoint key');
    if (record(value) && Object.hasOwn(value,'$number')) {
      if (Object.keys(value).length!==1 || !['Infinity','-Infinity','-0'].includes(value.$number)) throw new Error('Invalid checkpoint number');
      return Number(value.$number);
    }
    return value;
  });
}

// The transport authenticates identities. Only this object advances the town;
// client messages contain player intent, never resident state or elapsed time.
export function createSharedWorld(worldData, { now = Date.now, maxPlayers = 32, sharedPopulation = true, isAdmin = isJevicaAdmin, worldId = DEFAULT_WORLD_ID } = {}) {
  validateWorldId(worldId);
  const colliders=[],placementEnvironment=createWalkingEnvironment(worldData);
  const environment = createWalkingEnvironment(worldData,colliders);
  const players = new Map(), ledgers = new Map(), focus = new Map(), chat = [], appearanceByUser = new Map(), movementByUser = new Map(), builds = new Map(), inventory = new Map(), homeGuests = new Map();
  let colliderKey='[]';
  const syncColliders=(navigation=life?.navigation)=>{
    const objects=[...builds.values()].filter(item=>item.kind==='object');
    const key=JSON.stringify(objects.map(({id,assembly,position,ground,yaw})=>({id,assembly,position,ground,yaw})));
    // Furniture changes do not evict resident geography caches.
    if(key===colliderKey)return;
    colliderKey=key;colliders.splice(0,colliders.length,...objects.map(objectCollider));
    navigation?.setPlacedObjects(colliders);
  };
  const state = createCommunity(worldData, environment.rooms, {carriage:false,sharedPopulation});
  let life = createResidentLife(worldData, state), revision = 0, elapsed = 0;
  // Reserve the whole grounded-to-lifted column, so undoing a wish or lowering
  // a Force hold cannot return the resident through confirmed geometry.
  const residentBlocked=(collider,local)=>{
    const ground=local.position[2],up=personElevation(local);
    return collider.contains(local.position[0],(ground+up)/2+.9,-local.position[1],.35,.9+Math.abs(up-ground)/2);
  };
  const localById = new Map(state.locals.map(local => [local.id,local]));
  const worldFingerprint = digest(worldData);
  const residentIdentities = state.locals.map(({id,name,indoor,storeId})=>({id,name,indoor,storeId}));
  const roads=buildRoads(worldData);
  // The same rule the browser's builder mode previews (shared-build.js).
  const buildSite=(position,kind,occupied=builds,ignoreId=null)=>checkBuildSite({environment:placementEnvironment,roads,position,kind,builds:[...occupied.values()],ignoreId}).ground ?? null;
  // Beast movement is an account preference that only shows in a beast form,
  // so switching to a humanoid form and back keeps it.
  const movementOf = player => movementByUser.get(player.id)==='beast' && isBeastAppearance(player.appearance) ? 'beast' : 'upright';
  // Every name leaves the world checked against its account: only Jevica's
  // accounts are Jevica, whatever a stored or restored record says.
  const publicPlayer = player => ({id:player.id,name:accountName(player.id,player.name),appearance:player.appearance,movement:movementOf(player),gesture:player.gestureUntil>now()?player.gesture:null,canBuild:Boolean(isAdmin(player.id)),canGrantWishes:Boolean(isAdmin(player.id)),vehicle:player.vehicle??null,sitting:publicSeat(player),position:[...player.position],yaw:player.yaw,altitude:player.altitude});
  // Seats are Jevica's garden seats and lounge chairs, and the two places on
  // every storefront bench ('bench:<store>', slots 0 and 1).
  const benches=benchSeats(worldData);
  const seatAt=(buildId,slot,source=builds)=>String(buildId).startsWith('bench:')
    ? resolveBenchSeat(benches,buildId,slot,(x,north)=>environment.groundAt(x,-north)) : resolveSeat(source.get(buildId),slot);
  // A townsperson resting on a bench place holds it as a player would.
  const residentOnSeat=(buildId,slot)=>state.locals.some(local=>local.life?.seat?.id===`${buildId}:${slot}`);
  // Planters: two by each boutique door, the street planters, and Jevica's.
  let staticPlanters=null;
  const planterSites=()=>{
    staticPlanters??=[...boutiquePlanters(worldData),...lanePlanters(worldData,(x,z)=>environment.isFree(x,z) && !environment.roomAt(x,z))];
    return new Map([...staticPlanters,...buildPlanters([...builds.values()])].map(planter=>[planter.id,planter]));
  };
  function publicSeat(player) {
    const seat=player.sitting && seatAt(player.sitting.buildId,player.sitting.slot);
    return seat?{buildId:seat.buildId,slot:seat.slot,height:seat.height,yaw:seat.yaw}:null;
  }
  const seatOccupied=(buildId,slot)=>[...players.values()].some(p=>p.sitting?.buildId===buildId && p.sitting.slot===slot);
  const buildOccupied=id=>[...players.values()].some(p=>p.sitting?.buildId===id);
  function sit(player,message,time) {
    if(!fields(message,['type','buildId','slot']) || !textId(message.buildId))return reject('invalid_seat');
    const seat=seatAt(message.buildId,message.slot);
    if(!seat)return reject('invalid_seat');
    if(player.sitting)return reject('already_seated','Stand up before choosing another seat.');
    if(seatOccupied(seat.buildId,seat.slot) || residentOnSeat(seat.buildId,seat.slot))return reject('seat_occupied','Someone is already using this seat.');
    const room=buildRoomAt(environment,seat.position),playerRoom=buildRoomAt(environment,player.position);
    if(room && ownerOnlyHomes.has(room.storeId) && !canEnterHome(player.id,room.storeId))return reject('private_home');
    if(player.altitude>.1 || player.vehicle || distance(player.position,seat.position)>SEAT_REACH
      || (room?.storeId??null)!==(playerRoom?.storeId??null)
      || !environment.hasSightLine([player.position[0],player.position[1],player.position[2]+1.68],
        [seat.position[0],seat.position[1],seat.position[2]+seat.height+.6]))
      return reject('seat_out_of_reach','Stand on the ground near the seat in the same room.');
    if(!environment.isFree(seat.position[0],-seat.position[1])
      || [...players.values()].some(other=>other.id!==player.id && distance(other.position,seat.position)<.6))
      return reject('seat_blocked','Someone is standing at the seat.');
    focus.delete(player.id);
    Object.assign(player,{position:seat.position,yaw:seatYaw(seat.yaw-Math.PI),altitude:0,vehicle:null,
      sitting:{buildId:seat.buildId,slot:seat.slot},poseAt:time,moveBudget:.1,liftBudget:.1,gesture:null,gestureUntil:0});
    revision++;return {ok:true,player:publicPlayer(player)};
  }
  function stand(player,message,time) {
    if(!fields(message,['type']))return reject('invalid_seat');
    if(!player.sitting)return reject('not_seated');
    const build=builds.get(player.sitting.buildId),roomId=buildRoomAt(environment,player.position)?.storeId??null;
    // A bench has no build: stand up around the place itself, in front first.
    const anchor=build??seatAt(player.sitting.buildId,player.sitting.slot);
    const centre=anchor?[anchor.position[0],anchor.position[1]]:[player.position[0],player.position[1]],facing=anchor?.yaw??seatYaw(player.yaw+Math.PI);
    const objects=[...builds.values()],others=[...players.values()];
    let destination=null;
    for(const radius of [1.65,2.2,2.8]) {
      for(const angle of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,3*Math.PI/4,-3*Math.PI/4,Math.PI]) {
        const yaw=facing+angle,x=centre[0]+Math.sin(yaw)*radius,north=centre[1]-Math.cos(yaw)*radius;
        const ground=environment.groundAt(x,-north);
        if(!Number.isFinite(ground) || Math.abs(ground-player.position[2])>.35
          || (buildRoomAt(environment,[x,north])?.storeId??null)!==roomId
          || objects.some(item=>distance(item.position,[x,north])<buildGeometry(item).radius+.4)
          || others.some(other=>other.id!==player.id && distance(other.position,[x,north])<.85))continue;
        const steps=Math.ceil(distance(player.position,[x,north])/.15);let clear=true;
        for(let i=0;i<=steps;i++) {
          const t=i/steps,east=player.position[0]+(x-player.position[0])*t,n=player.position[1]+(north-player.position[1])*t;
          if(!environment.isFree(east,-n) || Math.abs(environment.groundAt(east,-n)-ground)>.35
            || (buildRoomAt(environment,[east,n])?.storeId??null)!==roomId
            || objects.some(item=>item.id!==build?.id && distance(item.position,[east,n])<buildGeometry(item).radius+.3)) {clear=false;break;}
        }
        if(clear){destination=[x,north,ground];break;}
      }
      if(destination)break;
    }
    if(!destination)return reject('stand_blocked','There is no clear space to stand. Use Places to travel out.');
    Object.assign(player,{position:destination,sitting:null,poseAt:time,moveBudget:.1,liftBudget:.1,gesture:null,gestureUntil:0});
    revision++;return {ok:true,player:publicPlayer(player)};
  }
  // Watering is only an animation: the planter keeps no state. Anyone may
  // water a planter in reach, in the same room or on the same street.
  function water(player,message,ledger,time) {
    if(!fields(message,['type','planterId']) || !textId(message.planterId))return reject('invalid_planter');
    const planter=planterSites().get(message.planterId);
    if(!planter)return reject('unknown_planter','That planter is not here.');
    if(player.sitting)return reject('seated','Stand up first.');
    if(player.altitude>.1 || player.vehicle)return reject('water_on_foot','Step out or land first.');
    if(distance(player.position,[planter.x,planter.north])>WATER_REACH
      || (buildRoomAt(environment,[planter.x,planter.north])?.storeId??null)!==(buildRoomAt(environment,player.position)?.storeId??null))
      return reject('planter_out_of_reach','Walk closer to the planter.');
    if(time-ledger.gestureAt<GESTURE_COOLDOWN_MS)return reject('gesture_cooldown','Wait a moment before watering again.');
    // The body turns to the planter; a player's yaw is the camera's, behind them.
    player.yaw=seatYaw(headingTo(player.position,[planter.x,planter.north])+Math.PI);
    player.gesture='water';player.gestureUntil=time+WATER_MS;ledger.gestureAt=time;revision++;
    return {ok:true,player:publicPlayer(player)};
  }
  const rememberAppearance = (id,appearance) => {
    appearanceByUser.delete(id);appearanceByUser.set(id,appearance);
    if (appearanceByUser.size>MAX_APPEARANCES) {
      const oldest=[...appearanceByUser.keys()].find(key=>!players.has(key));
      if(oldest){appearanceByUser.delete(oldest);movementByUser.delete(oldest);}
    }
  };
  // Trusted gateway hooks. A room checkpoint keeps its own copy, while the
  // account preference selects the same look on arrival in another world.
  function accountAppearance(userId) {
    return {appearance:players.get(userId)?.appearance??appearanceByUser.get(userId)??permittedAppearance(userId),
      movement:movementByUser.get(userId)??'upright'};
  }
  function applyAccountAppearance(userId,preference) {
    if(!textId(userId) || !preference || typeof preference!=='object' || Array.isArray(preference)
      || !MOVEMENTS.includes(preference.movement))throw new Error('Invalid account appearance');
    const chosen=sharedAppearance(preference.appearance);
    if(!chosen || !canUseAppearance(userId,chosen.id))throw new Error('Invalid account appearance');
    const current=accountAppearance(userId);
    const player=players.get(userId);
    if(current.appearance!==chosen.id || current.movement!==preference.movement) {
      rememberAppearance(userId,chosen.id);
      if(preference.movement==='beast')movementByUser.set(userId,'beast');else movementByUser.delete(userId);
      if(player)player.appearance=chosen.id;
      revision++;
    }
    return player?publicPlayer(player):null;
  }
  const clearExpiredLedgers = time => {
    for (const [id,ledger] of ledgers) if (!players.has(id) && time-ledger.seen >= LEDGER_TTL_MS) ledgers.delete(id);
  };
  // Everyone arrives at the same walk spawn; without spreading, two players
  // stood inside each other. Each takes the first free spot on rings around
  // the spawn at least 1.2 m from anyone already in town.
  function arrivalSpot(x0, north0) {
    const taken = [...players.values()];
    const clear = (x, north) => taken.every(other => Math.hypot(other.position[0]-x, other.position[1]-north) >= 1.2);
    if (clear(x0, north0)) return [x0, north0];
    for (let ring = 1; ring <= 4; ring++) for (let step = 0; step < ring * 6; step++) {
      const angle = step / (ring * 6) * Math.PI * 2, x = x0 + Math.cos(angle) * ring * 1.6, north = north0 + Math.sin(angle) * ring * 1.6;
      if (environment.isFree(x, -north) && clear(x, north)) return [x, north];
    }
    return [x0, north0];
  }
  // A resident who is still in the world when they sign in again keeps their
  // place but takes the name their current session carries.
  function rename(identity) {
    const player=identity && players.get(identity.userId);
    if (!player || typeof identity.name!=='string') return null;
    const name=accountName(identity.userId,identity.name.slice(0,80));
    if (player.name!==name) {player.name=name;revision++;}
    return publicPlayer(player);
  }
  function join(identity) {
    if (!identity || !textId(identity.userId) || typeof identity.name !== 'string') return reject('invalid_identity');
    if (players.has(identity.userId)) return reject('already_joined');
    if (players.size >= maxPlayers) return reject('world_full');
    const time = now();
    clearExpiredLedgers(time);
    if (!ledgers.has(identity.userId)) {
      if (ledgers.size >= MAX_LEDGERS) return reject('world_busy');
      ledgers.set(identity.userId,{wishAt:-Infinity,travelAt:-Infinity,chatAt:-Infinity,appearanceAt:-Infinity,gestureAt:-Infinity,tokens:12,tokenAt:time,seen:time});
    }
    const spawn = createWalkingState(environment).position, [x,north] = arrivalSpot(spawn[0],-spawn[2]);
    const appearance=permittedAppearance(identity.userId,appearanceByUser.get(identity.userId));
    const player = {id:identity.userId,name:accountName(identity.userId,identity.name.slice(0,80)),appearance,position:[x,north,environment.groundAt(x,-north)],yaw:0,altitude:0,
      poseAt:time,moveBudget:0.1,liftBudget:0.1,gesture:null,gestureUntil:0};
    players.set(player.id,player);
    rememberAppearance(player.id,appearance);
    revision++;
    return {ok:true,player:publicPlayer(player)};
  }
  function leave(userId) {
    if (!players.delete(userId)) return false;
    focus.delete(userId);
    const ledger = ledgers.get(userId);
    if (ledger) ledger.seen = now();
    // Transport calls leave after its reconnect grace, releasing abandoned wishes.
    for (const local of state.locals) if (local.wish?.ownerId === userId) undoWish(state,local.id,'jevica');
    revision++;
    return true;
  }
  function reachable(player, local) {
    if (!local || player.altitude > 1 || distance(player.position,local.position) > 4) return false;
    const room = environment.roomAt(player.position[0],-player.position[1]);
    if ((room?.storeId ?? null) !== (local.storeId ?? null)) return false;
    return environment.hasSightLine([player.position[0],player.position[1],player.position[2]+1.68+player.altitude],
      [local.position[0],local.position[1],local.position[2]+(local.eyeHeight ?? 1.55)]);
  }
  const ownerOnlyHomes = new Set((worldData.stores??[]).filter(store=>store.category==='home' && store.access==='owner').map(store=>store.id));
  const canEnterHome = (userId,storeId,access=homeGuests) => isAdmin(userId) || access.get(storeId)?.includes(userId);
  const restrictedRoomAt = (x,north) => {
    const room=environment.roomAt(x,-north);
    return room && ownerOnlyHomes.has(room.storeId) && room.contains(x,north) ? room : null;
  };
  function pose(player, message, time) {
    const correction = error => ({...reject(error),correction:publicPlayer(player),player:publicPlayer(player)});
    const {position,yaw,altitude} = message;
    if (!fields(message,['type','position','yaw','altitude','vehicle']) || (message.vehicle != null && !vehicleKind(message.vehicle))
      || !Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)
      || !Number.isFinite(yaw) || !Number.isFinite(altitude) || altitude < 0 || altitude > environment.flightCeiling) return correction('invalid_pose');
    if(player.sitting) {
      if(distance(position,player.position)>1e-6 || Math.abs(position[2]-player.position[2])>1e-6
        || altitude!==0 || message.vehicle)return correction('stand_before_moving');
      return {ok:true,player:publicPlayer(player)};
    }
    if (message.vehicle && !isJevicaOwner(player.id)) return correction('exclusive_vehicle');
    if (message.vehicle && altitude>0.1) return correction('invalid_pose');
    if (altitude>0 && !canFlyAs(player.id,player.appearance)) return correction('flight_not_allowed');
    const ground = environment.groundAt(position[0],-position[1]);
    if (Math.abs(position[2]-ground) > 0.2) return correction('invalid_ground');
    const dt = Math.max(0,Math.min(1,(time-player.poseAt)/1000));
    player.poseAt = time;
    player.moveBudget = Math.min(1,player.moveBudget+dt);
    player.liftBudget = Math.min(1,player.liftBudget+dt);
    const beast=movementOf(player)==='beast'?traversalForAppearance(player.appearance):null;
    const cost = distance(position,player.position) / (message.vehicle ? VEHICLES[message.vehicle].maxSpeed : Math.max(player.altitude,altitude)>0.1 ? 7.2 : beast ? beast.sprint+.2 : 3.4);
    const liftCost = Math.abs(altitude-player.altitude)/3.2;
    if (cost>player.moveBudget+1e-8 || liftCost>player.liftBudget+1e-8) return correction('movement_too_fast');
    const steps = Math.max(1,Math.ceil(distance(position,player.position)/0.15),Math.ceil(Math.abs(altitude-player.altitude)/0.15));
    for (let i=1;i<=steps;i++) {
      const t=i/steps, x=player.position[0]+(position[0]-player.position[0])*t, north=player.position[1]+(position[1]-player.position[1])*t;
      const height=player.altitude+(altitude-player.altitude)*t;
      const privateRoom=height<=0.1 && restrictedRoomAt(x,north);
      if (privateRoom && !canEnterHome(player.id,privateRoom.storeId)) return correction('private_home');
      if (height>0.1 ? !environment.canFly(x,environment.groundAt(x,-north)+height,-north) : !environment.isFree(x,-north)) return correction('blocked');
    }
    player.moveBudget -= cost;
    player.liftBudget -= liftCost;
    // Watering keeps the body turned to the planter; walking off ends it.
    if (player.gesture==='water' && distance(position,player.position)>0.3) {player.gesture=null;player.gestureUntil=0;}
    const watering = player.gesture==='water' && player.gestureUntil>time;
    Object.assign(player,{position:[position[0],position[1],ground],yaw:watering?player.yaw:Math.atan2(Math.sin(yaw),Math.cos(yaw)),altitude,vehicle:message.vehicle??null});
    if(altitude>0.1 || message.vehicle){player.gesture=null;player.gestureUntil=0;}
    revision++;
    return {ok:true,player:publicPlayer(player)};
  }
  // A travel names exactly one destination: a resident, a player in this room,
  // a store (with a mode), a community place, or a bare [x, north]. The server
  // resolves people at command time and still checks the arrival geometry.
  const inBounds = (x,north) => x>=worldData.bounds_m[0] && x<=worldData.bounds_m[2] && north>=worldData.bounds_m[1] && north<=worldData.bounds_m[3];
  function travel(player, message, ledger, time) {
    if (!fields(message,['type','localId','peerId','storeId','mode','placeId','position']) || Object.hasOwn(message,'localId') && !textId(message.localId)
      || Object.hasOwn(message,'peerId') && !textId(message.peerId) || Object.hasOwn(message,'storeId') && !textId(message.storeId) || Object.hasOwn(message,'placeId') && !textId(message.placeId)
      || Object.hasOwn(message,'position') && !(Array.isArray(message.position) && message.position.length===2 && message.position.every(Number.isFinite))) return reject('invalid_destination');
    if (['localId','peerId','storeId','placeId','position'].filter(key=>Object.hasOwn(message,key)).length!==1) return reject('invalid_destination');
    const local = localById.get(message.localId);
    const peer = players.get(message.peerId);
    const store = worldData.stores?.find(store=>store.id===message.storeId);
    const room = environment.rooms.find(room=>room.storeId===message.storeId);
    const place = (worldData.communityLocations ?? []).find(place=>place.id===message.placeId);
    const point = Object.hasOwn(message,'position') ? message.position : null;
    if (Object.hasOwn(message,'mode') && (!store || !['enter','leave','arrive'].includes(message.mode))) return reject('invalid_destination');
    if (point && !inBounds(point[0],point[1])) return reject('invalid_destination');
    if (!local && !peer && !store && !place && !point) return reject('unknown_destination');
    if (peer===player) return reject('invalid_destination');
    const mode = message.mode ?? 'enter';
    if (local && ownerOnlyHomes.has(local.storeId) && !canEnterHome(player.id,local.storeId)
      || store && mode==='enter' && ownerOnlyHomes.has(store.id) && !canEnterHome(player.id,store.id))
      return reject('private_home','This home is private. Jevica can invite you inside.');
    if (store && mode==='leave' && environment.roomAt(player.position[0],-player.position[1])?.storeId!==store.id) return reject('not_in_store');
    if (time-ledger.travelAt < TRAVEL_COOLDOWN_MS) return reject('travel_cooldown');
    let destination = null;
    if (peer) {
      // Meeting another player never bypasses a private door. Stand beside an
      // outdoor peer, clear of everyone in the room, rather than on their feet.
      const [east,north]=peer.position;
      if (environment.roomAt(east,-north) || !environment.isFree(east,-north)) return reject('destination_blocked');
      const angle=Math.atan2(player.position[1]-north,player.position[0]-east);
      const occupied=[...players.values()].filter(other=>other.id!==player.id);
      for (const radius of [2,2.6,3.2]) {
        if (destination) break;
        for (let step=0;step<24;step++) {
          const theta=angle+step*Math.PI/12,x=east+Math.cos(theta)*radius,z=north+Math.sin(theta)*radius;
          if (!inBounds(x,z) || !environment.isFree(x,-z) || environment.roomAt(x,-z)
            || occupied.some(other=>Math.hypot(other.position[0]-x,other.position[1]-z)<1.2)) continue;
          destination=[x,z,environment.groundAt(x,-z)];break;
        }
      }
    } else if (place || point) {
      // Outdoors only, close to the asked-for spot: a place a few metres off
      // is still that place, a link to inside a wall is not honoured.
      const origin = place ? place.position : point;
      const accept = (x,north) => {
        if (!environment.isFree(x,-north) || environment.roomAt(x,-north)) return false;
        destination=[x,north,environment.groundAt(x,-north)];
        return true;
      };
      accept(origin[0],origin[1]);
      for (const radius of (place ? [0.6,1.2,1.8,2.4,3,4] : [0.4,0.8,1.2])) {
        if (destination) break;
        for (let i=0;i<24;i++) {
          const angle=i/24*Math.PI*2;
          if (accept(origin[0]+Math.cos(angle)*radius,origin[1]+Math.sin(angle)*radius)) break;
        }
      }
    } else if (local) {
      // Search a small, deterministic ring for a clear conversation position,
      // including seated residents behind low counters inside stores.
      for (const radius of [1.8,1.2,2.5,0.8,3.2]) {
        for (let i=0;i<24;i++) {
          const angle=i/24*Math.PI*2, x=local.position[0]+Math.cos(angle)*radius, north=local.position[1]+Math.sin(angle)*radius;
          if (!environment.isFree(x,-north)) continue;
          const position=[x,north,environment.groundAt(x,-north)];
          if (reachable({...player,position,altitude:0},local)) { destination=position; break; }
        }
        if (destination) break;
      }
    } else {
      const interior = mode==='enter' && room;
      const origin = interior ? room.toWorld(0,2.4)
        : storefrontSpot(worldData, store, mode==='leave' ? 'leave' : 'arrive', { isFree: (x,z)=>environment.isFree(x,z) && !environment.roomAt(x,z) });
      const accept = (x,north) => {
        if (!environment.isFree(x,-north)) return false;
        const atRoom=environment.roomAt(x,-north);
        if (interior ? atRoom?.storeId!==store.id || !room.contains(x,north,0.35) : !!atRoom) return false;
        destination=[x,north,environment.groundAt(x,-north)];
        return true;
      };
      // Fixture layouts can cover the authored arrival point. Only search a
      // small radius around that known destination, on the correct side of its door.
      accept(origin[0],origin[1]);
      for (const radius of [0.4,0.8,1.2,1.8,2.4,3]) {
        if (destination) break;
        for (let i=0;i<24;i++) {
          const angle=i/24*Math.PI*2;
          if (accept(origin[0]+Math.cos(angle)*radius,origin[1]+Math.sin(angle)*radius)) break;
        }
      }
    }
    if (!destination) return reject('destination_blocked');
    ledger.travelAt=time;
    focus.delete(player.id);
    const target=local?.position ?? peer?.position ?? place?.position ?? (point ? null : mode==='enter' && room ? room.toWorld(room.center,room.depth-1) : store.facade);
    // A bare position keeps the traveller's own facing; a place faces its spot.
    const yaw=target && !(target[0]===destination[0] && target[1]===destination[1]) ? Math.atan2(destination[0]-target[0],target[1]-destination[1]) : player.yaw;
    Object.assign(player,{position:destination,sitting:null,altitude:0,yaw,poseAt:time,moveBudget:0.1,liftBudget:0.1,vehicle:null,gesture:null,gestureUntil:0});
    revision++;
    return {ok:true,player:publicPlayer(player)};
  }
  function command(userId, message) {
    const player=players.get(userId);
    if (!player) return reject('not_joined');
    if (!message || typeof message!=='object' || Array.isArray(message)) return reject('invalid_command');
    const ledger=ledgers.get(userId),time=now();
    ledger.seen=time;
    if (message.type==='pose') return pose(player,message,time);
    ledger.tokens=Math.min(12,ledger.tokens+Math.max(0,time-ledger.tokenAt)/500);
    ledger.tokenAt=time;
    if (ledger.tokens<1) return reject('rate_limited');
    ledger.tokens--;
    if(message.type==='sit')return sit(player,message,time);
    if(message.type==='stand')return stand(player,message,time);
    if (message.type==='travel') return travel(player,message,ledger,time);
    if (message.type==='water') return water(player,message,ledger,time);
    if (message.type==='gesture') {
      if(!fields(message,['type','kind']) || !GESTURES.includes(message.kind))return reject('invalid_gesture');
      if(player.altitude>0.1 || player.vehicle)return reject('gesture_on_foot','Step out or land before greeting someone.');
      if(time-ledger.gestureAt<GESTURE_COOLDOWN_MS)return reject('gesture_cooldown','Wait a moment before another gesture.');
      player.gesture=message.kind;player.gestureUntil=time+GESTURE_DURATION_MS;ledger.gestureAt=time;revision++;
      return {ok:true,player:publicPlayer(player)};
    }
    if (message.type==='appearance') {
      // A retired ID resolves to its replacement, which is what the town keeps.
      const chosen=fields(message,['type','appearance']) ? sharedAppearance(message.appearance) : null;
      if (!chosen) return reject('invalid_appearance');
      if (!canUseAppearance(userId,chosen.id)) return reject('exclusive_appearance','Jevica is reserved for her account.');
      if (player.appearance===chosen.id) return {ok:true,player:publicPlayer(player)};
      if (player.altitude>0) return reject('land_before_appearance','Land before changing character or form.');
      if (time-ledger.appearanceAt<APPEARANCE_COOLDOWN_MS) return reject('appearance_cooldown','Wait a moment before changing appearance again.');
      player.appearance=chosen.id;ledger.appearanceAt=time;
      rememberAppearance(userId,player.appearance);revision++;
      return {ok:true,player:publicPlayer(player)};
    }
    if (message.type==='movement') {
      if (!fields(message,['type','movement']) || !MOVEMENTS.includes(message.movement)) return reject('invalid_movement');
      if (message.movement==='beast' && !isBeastAppearance(player.appearance)) return reject('beast_form_required','Choose a beast form before moving like one.');
      if ((movementByUser.get(userId)??'upright')===message.movement) return {ok:true,player:publicPlayer(player)};
      if (message.movement==='beast') movementByUser.set(userId,'beast'); else movementByUser.delete(userId);
      revision++;
      return {ok:true,player:publicPlayer(player)};
    }
    if (message.type==='homeAccess') {
      if (message.action==='list' && fields(message,['type','action'])) {
        const homes=(worldData.stores??[]).filter(store=>ownerOnlyHomes.has(store.id)
          && (isAdmin(userId) || homeGuests.get(store.id)?.includes(userId)))
          .map(store=>({storeId:store.id,name:store.name,
            ...(isAdmin(userId)?{guestIds:[...(homeGuests.get(store.id)??[])]}:{})}));
        return {ok:true,homes};
      }
      if (!isAdmin(userId)) return reject('admin_only','Only Jevica can invite visitors into private homes.');
      if (!fields(message,['type','action','storeId','peerId']) || !['grant','revoke'].includes(message.action)
        || !ownerOnlyHomes.has(message.storeId) || !textId(message.peerId)) return reject('invalid_home_access');
      const guests=homeGuests.get(message.storeId)??[];
      if (message.action==='grant') {
        if (guests.includes(message.peerId)) return {ok:true,storeId:message.storeId,peerId:message.peerId,granted:true};
        if (guests.length>=MAX_HOME_GUESTS) return reject('home_guest_limit','This home already has 16 invited visitors.');
        homeGuests.set(message.storeId,[...guests,message.peerId]);revision++;
        return {ok:true,storeId:message.storeId,peerId:message.peerId,granted:true};
      }
      if (!guests.includes(message.peerId)) return reject('not_invited');
      if (guests.length===1) homeGuests.delete(message.storeId);
      else homeGuests.set(message.storeId,guests.filter(id=>id!==message.peerId));
      const peer=players.get(message.peerId),privateRoom=peer && restrictedRoomAt(peer.position[0],peer.position[1]);
      if (privateRoom?.storeId===message.storeId) {
        const store=worldData.stores.find(item=>item.id===message.storeId);
        const outside=storefrontSpot(worldData,store,'leave',{isFree:(x,z)=>environment.isFree(x,z) && !environment.roomAt(x,z)});
        peer.position=[outside[0],outside[1],environment.groundAt(outside[0],-outside[1])];
        peer.altitude=0;peer.vehicle=null;peer.sitting=null;peer.poseAt=time;peer.moveBudget=peer.liftBudget=0.1;
        peer.gesture=null;peer.gestureUntil=0;focus.delete(peer.id);
      }
      revision++;
      return {ok:true,storeId:message.storeId,peerId:message.peerId,granted:false};
    }
    if (message.type==='inventory') {
      if (!isAdmin(userId)) return reject('admin_only','Only Jevica can use building designs in the shared town.');
      if (message.action==='list' && fields(message,['type','action'])) return {ok:true,items:copy(inventory.get(userId)??[])};
      if (message.action==='save' && fields(message,['type','action','buildId']) && typeof message.buildId==='string') {
        const build=builds.get(message.buildId);
        if (!build) return reject('unknown_build');
        if (build.ownerId!==userId) return reject('not_build_owner');
        const own=inventory.get(userId)??[];
        if (own.length>=MAX_SAVED_DESIGNS || [...inventory.values()].reduce((total,items)=>total+items.length,0)>=MAX_DESIGNS) return reject('inventory_limit','Your design inventory is full.');
        const item={id:`design-${revision+1}`,kind:build.kind,finish:build.finish,...(build.assembly?{assembly:copy(build.assembly)}:{}),createdAt:time};
        inventory.set(userId,[...own,item]);revision++;
        return {ok:true,item:copy(item),items:copy(inventory.get(userId))};
      }
      if (message.action==='remove' && fields(message,['type','action','id']) && typeof message.id==='string') {
        const own=inventory.get(userId)??[],next=own.filter(item=>item.id!==message.id);
        if (next.length===own.length) return reject('unknown_design');
        if (next.length) inventory.set(userId,next); else inventory.delete(userId);
        revision++;return {ok:true,items:copy(next)};
      }
      return reject('invalid_inventory');
    }
    if (message.type==='build') {
      if (!isAdmin(userId)) return reject('admin_only','Only Jevica can build in the shared town.');
      if(message.action==='remove'){
        if(!fields(message,['type','action','id']) || typeof message.id!=='string')return reject('invalid_build');
        const item=builds.get(message.id);
        if(!item)return reject('unknown_build');
        if(buildOccupied(item.id))return reject('seat_in_use','Ask everyone to stand before removing this seat.');
        // The admin can clear creations left by visitors before this policy.
        builds.delete(item.id);syncColliders();revision++;return {ok:true,id:item.id};
      }
      const placing=message.action==='place',editing=message.action==='edit';
      const saved=placing && Object.hasOwn(message,'templateId');
      if(!placing&&!editing || !fields(message,placing?(saved?['type','action','templateId','position','yaw']:['type','action','kind','finish','assembly','position','yaw']):['type','action','id','assembly','position','yaw'])
        || !point(message.position,2) || !Number.isFinite(message.yaw))return reject('invalid_build');
      const previous=editing?builds.get(message.id):null;
      if(editing&&!previous)return reject('unknown_build');
      if(editing&&buildOccupied(previous.id))return reject('seat_in_use','Ask everyone to stand before moving this seat.');
      const template=saved?(inventory.get(userId)??[]).find(item=>item.id===message.templateId):null;
      if(saved&&!template)return reject('unknown_design');
      const definition=placing?(saved?template:message):{...previous,...(Object.hasOwn(message,'assembly')?{assembly:message.assembly}:{})};
      const kind=buildGeometry(definition),finish=buildFinish(definition.finish);
      if(!kind || !finish)return reject('invalid_build');
      const playerRoom=buildRoomAt(environment,player.position)?.storeId??null;
      const playerThreshold=environment.roomAt(player.position[0],-player.position[1]);
      const targetRoom=buildRoomAt(environment,message.position)?.storeId??null;
      const previousRoom=previous ? buildRoomAt(environment,previous.position)?.storeId??null : null;
      if(player.altitude>.1 || playerThreshold && !playerThreshold.contains(player.position[0],player.position[1])
        || playerRoom!==targetRoom || editing && playerRoom!==previousRoom
        || distance(player.position,message.position)>BUILD_REACH || editing&&distance(player.position,previous.position)>BUILD_EDIT_REACH)
        return reject('build_out_of_reach',placing?'Stand outside on the ground nearby, or inside the same home.':'Stand outside on the ground near this creation, or inside the same home.');
      if(placing&&(builds.size>=MAX_BUILDS || [...builds.values()].filter(item=>item.ownerId===userId).length>=MAX_BUILDS_PER_USER))return reject('build_limit');
      const ground=buildSite(message.position,kind,builds,previous?.id);
      if(ground===null)return reject('blocked_build_site','Find open, level ground away from roads and other creations.');
      if([...players.values()].some(other=>distance(other.position,message.position)<kind.radius+BUILD_PLAYER_GAP))return reject('blocked_build_site');
      const yaw=buildYaw(message.yaw);
      const collider=objectCollider({...definition,position:message.position,ground,yaw});
      if([...players.values()].some(other=>blocksPlayer(collider,other))
        || collider && state.locals.some(local=>residentBlocked(collider,local)))
        return reject('blocked_build_site');
      const item=placing
        ? {id:`build-${revision+1}`,ownerId:userId,ownerName:player.name,kind:kind.id,finish:finish.id,position:[...message.position],ground,yaw,createdAt:time,...(definition.assembly?{assembly:copy(definition.assembly)}:{})}
        : {...previous,...(definition.assembly?{assembly:copy(definition.assembly)}:{}),position:[...message.position],ground,yaw};
      builds.set(item.id,item);syncColliders();revision++;return {ok:true,item:copy(item)};
    }
    if (message.type==='chat') {
      if (!fields(message,['type','text']) || typeof message.text!=='string'
        || /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(message.text)) return reject('invalid_chat');
      const content=message.text.trim().replace(/\s+/gu,' ');
      if (!content || [...content].length>MAX_CHAT_LENGTH || Buffer.byteLength(content,'utf8')>MAX_CHAT_LENGTH*4) return reject('invalid_chat');
      if (time-ledger.chatAt<CHAT_COOLDOWN_MS) return reject('chat_cooldown','Wait a moment before sending another message.');
      ledger.chatAt=time;
      const entry={id:revision+1,authorId:player.id,authorName:player.name,text:content,at:time};
      chat.push(entry);if(chat.length>MAX_CHAT_HISTORY)chat.shift();
      revision++;
      return {ok:true,id:entry.id};
    }
    if (message.type==='scenario') {
      if (!fields(message,['type','action']) || !['start','pause'].includes(message.action)) return reject('invalid_action');
      if (['success','failed'].includes(state.status)) return reject('scenario_finished');
      state.running=message.action==='start';
      state.status=state.running?'running':'paused';
      revision++;
      return {ok:true};
    }
    if (message.type==='focus' && message.localId===null && fields(message,['type','localId'])) {
      focus.delete(userId);revision++;return {ok:true};
    }
    if (message.type==='wish' && !isAdmin(userId)) return reject('admin_only','Only Jevica can grant wishes in the shared town.');
    if (!['wish','undoWish','support','focus'].includes(message.type)) return reject('invalid_command');
    const allowed=['type','localId',...(message.type==='wish'?['kind']:message.type==='support'?['action']:[])];
    if (!fields(message,allowed) || !textId(message.localId)) return reject('invalid_command');
    const local=localById.get(message.localId);
    if (!reachable(player,local)) return reject('out_of_reach','Move closer to this resident with a clear view.');
    if (message.type==='focus') {
      focus.set(userId,{localId:local.id,until:time+FOCUS_MS});revision++;return {ok:true};
    }
    if (message.type==='wish') {
      if (!wishFor(message.kind)) return reject('invalid_wish');
      if (local.wish) return reject('already_enchanted');
      if (time-ledger.wishAt<WISH_COOLDOWN_MS) return reject('wish_cooldown','Wait a few seconds before granting another wish.');
      if (state.locals.filter(local=>local.wish?.ownerId===userId).length>=MAX_ACTIVE_WISHES) return reject('wish_limit','Undo one of your three active wishes first.');
      const result=grantWish(state,local.id,message.kind,'jevica',player.name);
      if (result.ok) { local.wish.ownerId=userId;ledger.wishAt=time;revision++; }
      return {...result,localId:local.id};
    }
    if (message.type==='undoWish') {
      if (!local.wish || local.wish.ownerId!==userId) return reject('not_wish_owner','Only the visitor who granted this wish can undo it.');
      const result=undoWish(state,local.id,'jevica');revision++;return {...result,localId:local.id};
    }
    const result=interactWithLocal(state,local.id,message.action);
    state.selectedId=null; // Selection belongs to each visitor, not the shared scenario.
    if (result.ok) revision++;
    return result;
  }
  function step(delta) {
    if (!Number.isFinite(delta) || delta<=0) return;
    const duration=Math.min(delta,0.25),time=now();
    clearExpiredLedgers(time);
    for (const [id,hold] of focus) if (hold.until<=time || !reachable(players.get(id),localById.get(hold.localId))) focus.delete(id);
    const held=new Set([...focus.values()].map(hold=>hold.localId));
    for (const local of state.locals) {
      if (held.has(local.id)) local.visitorReaction={sharedFocus:true};
      else delete local.visitorReaction;
    }
    const steps=Math.ceil(duration/0.05),dt=duration/steps;
    for (let i=0;i<steps;i++) {
      stepWishes(state,dt);
      stepCommunity(state,dt);
      stepResidentLife(life,dt,{takenSeats:new Set([...players.values()].filter(player=>player.sitting).map(player=>`${player.sitting.buildId}:${player.sitting.slot}`))});
    }
    elapsed+=duration;
    revision++;
  }
  function snapshot() {
    const community={};
    for (const key of ['status','running','elapsed','target','supported','unmet','supplies','helpBudget','jobs','events','scenarioKey','generation','result','storm','resupplied']) community[key]=copy(state[key]);
    return {type:'snapshot',worldId,protocolVersion:WORLD_PROTOCOL_VERSION,revision,elapsed,players:[...players.values()].map(publicPlayer),
      chat:copy(chat).map(entry=>({...entry,authorName:accountName(entry.authorId,entry.authorName)})),
      builds:copy([...builds.values()]).map(item=>({...item,ownerName:accountName(item.ownerId,item.ownerName)})),wishes:copy(state.wishes),community,
      locals:state.locals.map(local=>({id:local.id,name:local.name,position:[...local.position],indoor:!!local.indoor,storeId:local.storeId??null,
        life:local.life?{speed:local.life.speed,distance:local.life.distance,heading:local.life.heading,status:local.life.status,action:local.life.action,source:local.life.source,blocked:local.life.blocked,visitId:local.life.visitId??null,helping:copy(local.life.helping??null),seat:copy(local.life.seat??null)}:null,
        wish:copy(local.wish??null),wishDisruption:local.wishDisruption??null,priority:local.priority,need:local.need,needKnown:local.needKnown,status:local.status,
        action:local.action,source:local.source,lastInteraction:local.lastInteraction,lastResult:copy(local.lastResult),anchorId:local.anchorId,anchorName:local.anchorName})),
    };
  }
  // Private storage format: the checksum detects corruption, not authorization.
  // Store and restore only through the trusted persistence owner, never clients.
  function checkpoint() {
    if (life?.planning) throw new Error('Cannot checkpoint an unfinished route search');
    const payload=JSON.parse(checkpointJSON({revision,elapsed,state,players:[...players.values()],ledgers:[...ledgers],focus:[...focus],chat,appearances:[...appearanceByUser],movements:[...movementByUser],builds:[...builds.values()],inventory:[...inventory],homeGuests:[...homeGuests],
      life:life?Object.fromEntries(LIFE_FIELDS.map(key=>[key,life[key]])):null}));
    const envelope={version:CHECKPOINT_VERSION,worldId,worldFingerprint,payload};
    if (Buffer.byteLength(JSON.stringify(envelope))>MAX_CHECKPOINT_BYTES) throw new Error('Checkpoint capacity exceeded');
    return {...envelope,checksum:digest(envelope)};
  }
  function restore(value) {
    try {
      // Clone before validation. A rejected restore never changes the live world.
      const serialized=JSON.stringify(value);
      if (typeof serialized!=='string' || Buffer.byteLength(serialized)>MAX_CHECKPOINT_BYTES) throw new Error('Invalid size');
      const saved=JSON.parse(serialized);
      const legacy=saved?.version===1 && worldId===DEFAULT_WORLD_ID;
      const envelope=legacy
        ? {version:saved.version,worldFingerprint:saved.worldFingerprint,payload:saved.payload}
        : {version:saved.version,worldId:saved.worldId,worldFingerprint:saved.worldFingerprint,payload:saved.payload};
      if (!record(saved) || !fields(saved,legacy?['version','worldFingerprint','payload','checksum']:['version','worldId','worldFingerprint','payload','checksum'])
        || !(legacy || [2,3,CHECKPOINT_VERSION].includes(saved.version) && saved.worldId===worldId)
        || saved.worldFingerprint!==worldFingerprint || saved.checksum!==digest(envelope)) throw new Error('Invalid envelope');
      let recovered=decodeCheckpoint(JSON.stringify(saved.payload));
      if (sharedPopulation && recovered.state?.locals?.length!==residentIdentities.length) {
        // Validate the entire old checkpoint before dropping any retired shop
        // residents. This keeps invalid data in a removed record from being
        // laundered into an accepted reduced-population checkpoint.
        const fullPopulation=createSharedWorld(worldData,{now,maxPlayers,sharedPopulation:false,isAdmin,worldId});
        if (!fullPopulation.restore(saved).ok) throw new Error('Invalid legacy checkpoint');
        const activeIds=new Set(residentIdentities.map(local=>local.id));
        const kept=recovered.state.locals.filter(local=>activeIds.has(local.id));
        const removed=recovered.state.locals.filter(local=>!activeIds.has(local.id));
        if (kept.length!==residentIdentities.length) throw new Error('Invalid population migration');
        for (const local of removed) {
          if (recovered.state.jobs.some(job=>job.localId===local.id || job.helperId===local.id)) throw new Error('Active visit on retired resident');
          if (!local.wish) continue;
          // Keep the wish in its shop when possible. A crowded shop may have
          // no free retained host; another resident can still carry the wish
          // so migration does not strand the entire persistent town.
          const recipient=kept.find(other=>other.storeId===local.storeId && !other.wish)??kept.find(other=>!other.wish);
          if (!recipient) throw new Error('No resident for active wish');
          recipient.wish=local.wish;
          for (const event of recovered.state.wishes.events) if(event.localId===local.id)event.localId=recipient.id;
        }
        recovered.state.locals=kept;
        if (recovered.life) recovered.life.cursor%=Math.max(1,kept.length);
        refreshWishTrouble(recovered.state);
      }
      if (!record(recovered) || !integer(recovered.revision) || !nonnegative(recovered.elapsed)) throw new Error('Invalid clocks');
      const nextChat=recovered.chat??[];
      if (!Array.isArray(nextChat) || nextChat.length>MAX_CHAT_HISTORY || !nextChat.every((entry,index)=>record(entry)
        && fields(entry,['id','authorId','authorName','text','at']) && integer(entry.id) && entry.id<=recovered.revision
        && (index===0 || entry.id>nextChat[index-1].id) && textId(entry.authorId)
        && typeof entry.authorName==='string' && entry.authorName.length<=80 && typeof entry.text==='string'
        && entry.text.length>0 && [...entry.text].length<=MAX_CHAT_LENGTH && !/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(entry.text)
        && Number.isFinite(entry.at))) throw new Error('Invalid chat');
      const nextState=recovered.state;
      if (!record(nextState) || !Array.isArray(nextState.locals) || nextState.locals.length!==residentIdentities.length
        || !Object.hasOwn(COMMUNITY_SCENARIOS,nextState.scenarioKey) || digest(nextState.scenario)!==digest(COMMUNITY_SCENARIOS[nextState.scenarioKey])
        || !integer(nextState.generation) || !['ready','running','paused','success','failed'].includes(nextState.status)
        || typeof nextState.running!=='boolean' || typeof nextState.physicalVisits!=='boolean' || nextState.selectedId!==null
        || !['elapsed','target','supported','unmet','supplies','helpBudget','resupplied','_accumulator'].every(key=>nonnegative(nextState[key]))
        || !Array.isArray(nextState.events) || nextState.events.length>8 || !Array.isArray(nextState.jobs) || nextState.jobs.length>8
        || !record(nextState.wishes) || !['granted','resolved','trouble','affected'].every(key=>integer(nextState.wishes[key]))
        || !Array.isArray(nextState.wishes.events) || nextState.wishes.events.length>12) throw new Error('Invalid community');
      const restoreMap=(entries,limit,valid)=>{
        if (!Array.isArray(entries) || entries.length>limit) throw new Error('Invalid map');
        const map=new Map();
        for (const entry of entries) {
          if (!Array.isArray(entry) || entry.length!==2 || !textId(entry[0]) || map.has(entry[0]) || !valid(entry[1])) throw new Error('Invalid entry');
          map.set(entry[0],entry[1]);
        }
        return map;
      };
      const nextLedgers=restoreMap(recovered.ledgers,MAX_LEDGERS,ledger=>record(ledger)
        && ['wishAt','travelAt'].every(key=>Number.isFinite(ledger[key]) || ledger[key]===-Infinity)
        && (ledger.chatAt===undefined || Number.isFinite(ledger.chatAt) || ledger.chatAt===-Infinity)
        && (ledger.appearanceAt===undefined || Number.isFinite(ledger.appearanceAt) || ledger.appearanceAt===-Infinity)
        && (ledger.gestureAt===undefined || Number.isFinite(ledger.gestureAt) || ledger.gestureAt===-Infinity)
        && ['tokenAt','seen'].every(key=>Number.isFinite(ledger[key])) && nonnegative(ledger.tokens) && ledger.tokens<=12);
      for (const ledger of nextLedgers.values()) {ledger.chatAt??=-Infinity;ledger.appearanceAt??=-Infinity;ledger.gestureAt??=-Infinity;}
      const nextAppearances=restoreMap(recovered.appearances??[],MAX_APPEARANCES,appearance=>Boolean(sharedAppearance(appearance)));
      // Checkpoints written before an appearance was retired keep its replacement.
      for (const [id,appearance] of nextAppearances) nextAppearances.set(id,permittedAppearance(id,appearance));
      const nextMovements=restoreMap(recovered.movements??[],MAX_APPEARANCES,movement=>movement==='beast');
      if(!Array.isArray(recovered.builds??[]) || (recovered.builds??[]).length>MAX_BUILDS)throw new Error('Invalid builds');
      const nextBuilds=new Map(),ownerCounts=new Map();
      for(const item of recovered.builds??[]){
        const kind=buildGeometry(item);
        if(!record(item) || !fields(item,['id','ownerId','ownerName','kind','finish','assembly','position','ground','yaw','createdAt'])
          || saved.version<4 && item.assembly!==undefined
          || typeof item.id!=='string' || !/^build-[1-9]\d*$/.test(item.id) || nextBuilds.has(item.id)
          || Number(item.id.slice(6))>recovered.revision || !textId(item.ownerId)
          || typeof item.ownerName!=='string' || item.ownerName.length>80 || !kind || !buildFinish(item.finish)
          || !point(item.position,2) || !Number.isFinite(item.ground) || !Number.isFinite(item.yaw)
          || Math.abs(item.yaw-Math.round(item.yaw/(Math.PI/8))*(Math.PI/8))>1e-6
          || !Number.isFinite(item.createdAt) || Math.abs((buildSite(item.position,kind,nextBuilds)??Infinity)-item.ground)>.02)throw new Error('Invalid build');
        const count=(ownerCounts.get(item.ownerId)??0)+1;
        if(count>MAX_BUILDS_PER_USER)throw new Error('Invalid build owner limit');
        ownerCounts.set(item.ownerId,count);nextBuilds.set(item.id,item);
      }
      const designIds=new Set();let designCount=0;
      const nextInventory=restoreMap(recovered.inventory??[],MAX_DESIGNS,items=>Array.isArray(items)
        && items.length>0 && items.length<=MAX_SAVED_DESIGNS && items.every(item=>record(item)
          && fields(item,['id','kind','finish','assembly','createdAt']) && !(saved.version<4 && item.assembly!==undefined) && typeof item.id==='string'
          && /^design-[1-9]\d*$/.test(item.id) && Number(item.id.slice(7))<=recovered.revision
          && buildGeometry(item) && buildFinish(item.finish) && Number.isFinite(item.createdAt)));
      for(const items of nextInventory.values())for(const item of items){
        if(designIds.has(item.id) || ++designCount>MAX_DESIGNS)throw new Error('Invalid inventory');
        designIds.add(item.id);
      }
      const nextHomeGuests=restoreMap(recovered.homeGuests??[],ownerOnlyHomes.size,ids=>Array.isArray(ids)
        && ids.length>0 && ids.length<=MAX_HOME_GUESTS && ids.every(textId) && new Set(ids).size===ids.length);
      for(const storeId of nextHomeGuests.keys())if(!ownerOnlyHomes.has(storeId))throw new Error('Invalid private home');
      if (!Array.isArray(recovered.players)) throw new Error('Invalid players');
      const nextPlayers=restoreMap(recovered.players.map(player=>[player?.id,player]),maxPlayers,player=>record(player)
        && typeof player.name==='string' && player.name.length<=80 && (player.appearance===undefined || Boolean(sharedAppearance(player.appearance)))
        && (player.sitting==null || saved.version>=3 && record(player.sitting) && fields(player.sitting,['buildId','slot'])
          && textId(player.sitting.buildId) && Number.isInteger(player.sitting.slot))
        && point(player.position,3) && Number.isFinite(player.yaw)
        && (player.vehicle == null || isJevicaOwner(player.id) && vehicleKind(player.vehicle) && player.altitude<=0.1)
        && nonnegative(player.altitude) && player.altitude<=environment.flightCeiling && Number.isFinite(player.poseAt)
        && (player.gesture===undefined && player.gestureUntil===undefined
          || (player.gesture===null || SHOWN_GESTURES.includes(player.gesture)) && nonnegative(player.gestureUntil))
        && ['moveBudget','liftBudget'].every(key=>Number.isFinite(player[key]) && player[key]>=-1e-8 && player[key]<=1));
      const recoveredEnvironment=createWalkingEnvironment(worldData,[...nextBuilds.values()].map(objectCollider).filter(Boolean));
      const occupiedSeats=new Set();
      for (const player of nextPlayers.values()) {
        player.gesture??=null;player.gestureUntil??=0;
        player.appearance=permittedAppearance(player.id,player.appearance??nextAppearances.get(player.id));
        if(nextAppearances.has(player.id) && nextAppearances.get(player.id)!==player.appearance) throw new Error('Invalid player appearance');
        if(!nextAppearances.has(player.id))nextAppearances.set(player.id,player.appearance);
        const [east,north,ground]=player.position;
        if (!nextLedgers.has(player.id) || (!player.sitting && Math.abs(ground-recoveredEnvironment.groundAt(east,-north))>0.2)
          || (player.altitude>0.1?!recoveredEnvironment.canFly(east,ground+player.altitude,-north):!recoveredEnvironment.isFree(east,-north))) throw new Error('Invalid player position');
        if(player.sitting) {
          const seat=seatAt(player.sitting.buildId,player.sitting.slot,nextBuilds),key=`${player.sitting.buildId}:${player.sitting.slot}`;
          if(!seat || occupiedSeats.has(key) || player.altitude!==0 || player.vehicle
            || seat.position.some((value,index)=>Math.abs(value-player.position[index])>1e-6)
            || Math.abs(seatYaw(player.yaw-(seat.yaw-Math.PI)))>1e-6)throw new Error('Invalid seated player');
          occupiedSeats.add(key);
        }
        // Older signed checkpoints allowed every player to fly. Keep their
        // account and appearance, but restore non-Jevica players on safe ground.
        if(player.altitude>0&&!canFlyAs(player.id,player.appearance)){
          const grounded=createWalkingState(recoveredEnvironment,[east,north]).position;
          player.position=[grounded[0],-grounded[2],recoveredEnvironment.groundAt(grounded[0],grounded[2])];
          player.altitude=0;
        }
        const privateRoom=restrictedRoomAt(player.position[0],player.position[1]);
        if(privateRoom && !canEnterHome(player.id,privateRoom.storeId,nextHomeGuests)){
          const store=worldData.stores.find(item=>item.id===privateRoom.storeId);
          const outside=storefrontSpot(worldData,store,'leave',{isFree:(x,z)=>recoveredEnvironment.isFree(x,z) && !recoveredEnvironment.roomAt(x,z)});
          if(!recoveredEnvironment.isFree(outside[0],-outside[1]) || recoveredEnvironment.roomAt(outside[0],-outside[1]))throw new Error('Invalid private home exit');
          player.position=[outside[0],outside[1],recoveredEnvironment.groundAt(outside[0],-outside[1])];
          player.altitude=0;player.vehicle=null;player.sitting=null;
        }
      }
      if(nextAppearances.size>MAX_APPEARANCES) throw new Error('Invalid appearances');
      // A preference without a remembered appearance has nothing to apply to.
      for (const id of nextMovements.keys()) if (!nextAppearances.has(id)) nextMovements.delete(id);
      const nextFocus=restoreMap(recovered.focus,maxPlayers,hold=>record(hold) && textId(hold.localId) && Number.isFinite(hold.until));
      for (const [id,hold] of nextFocus) if (!nextPlayers.has(id) || !localById.has(hold.localId)) throw new Error('Invalid focus');
      for (let index=0;index<nextState.locals.length;index++) {
        const local=nextState.locals[index],identity=residentIdentities[index],motion=local?.life;
        if (!record(local) || !Object.keys(identity).every(key=>local[key]===identity[key]) || !point(local.position,3)
          || !nonnegative(local.need) || local.need>100 || typeof local.needKnown!=='boolean' || typeof local.priority!=='boolean'
          || !record(local.persona) || !record(local.persona.memory)) throw new Error('Invalid resident');
        if (life && (!record(motion) || !['speed','distance','routeVersion','visits','reactionUntil'].every(key=>nonnegative(motion[key]))
          || !Number.isFinite(motion.heading) || !(nonnegative(motion.waitUntil) || motion.waitUntil===Infinity)
          || !Array.isArray(motion.route) || motion.route.length>40000 || !motion.route.every(step=>point(step,2))
          || motion.route.length && !record(motion.destination))) throw new Error('Invalid resident route');
        if (local.wish && (!wishFor(local.wish.kind) || !nextPlayers.has(local.wish.ownerId) || !nonnegative(local.wish.age)
          || !['gift','trouble','pleading'].includes(local.wish.phase) || typeof local.wish.message!=='string')) throw new Error('Invalid wish');
      }
      const jobIds=new Set();
      for (const job of nextState.jobs) {
        if (!record(job) || !textId(job.id) || jobIds.has(job.id) || job.generation!==nextState.generation || !localById.has(job.localId)
          || job.helperId!==null && !localById.has(job.helperId) || !nonnegative(job.progress) || !nonnegative(job.duration) || job.progress>job.duration
          || !['queued','routing','traveling','assisting','storm_hold','abstract'].includes(job.phase)) throw new Error('Invalid volunteer visit');
        jobIds.add(job.id);
      }
      for (const local of nextState.locals) if (local.life?.visitId && !nextState.jobs.some(job=>job.id===local.life.visitId && job.helperId===local.id)) {
        // A completed visit is released on the following resident step.
        if (local.life.helping?.onSite!==true) throw new Error('Invalid volunteer assignment');
      }
      const clock=recovered.life;
      if (Boolean(clock)!==Boolean(life) || clock && (!record(clock) || !nonnegative(clock.elapsed) || !integer(clock.revision)
        || !integer(clock.cursor) || clock.cursor>=Math.max(1,nextState.locals.length) || typeof clock.storm!=='boolean'
        || typeof clock.paused!=='boolean' || clock.packet!==null || !record(clock.stats))) throw new Error('Invalid resident clock');
      // Older v4 writers let residents walk/land inside assemblies. Repair
      // only those occupied starts before committing recovery. Normal walking
      // never teleports. Search nearby free ground in the same room, leaving
      // players/other residents clear and preserving the original destination.
      const nextColliders=[...nextBuilds.values()].map(objectCollider).filter(Boolean);
      const nextLife=createResidentLife(worldData,createCommunity(worldData,environment.rooms,{carriage:false,sharedPopulation}));
      nextLife?.navigation.setPlacedObjects(nextColliders);
      const repairedResidents=new Set();
      for(const local of nextState.locals){
        if(!nextColliders.some(collider=>residentBlocked(collider,local)))continue;
        const original=[...local.position],roomId=recoveredEnvironment.roomAt(original[0],-original[1])?.storeId??null;
        let repaired=false;
        for(let radius=.25;radius<=4&&!repaired;radius+=.25)for(let i=0;i<32;i++){
          const angle=i/32*Math.PI*2,x=original[0]+Math.cos(angle)*radius,north=original[1]+Math.sin(angle)*radius;
          const ground=recoveredEnvironment.groundAt(x,-north),candidate={...local,position:[x,north,ground]};
          if(!recoveredEnvironment.isFree(x,-north)
            || nextLife && (!nextLife.navigation.free([x,north])||nextLife.navigation.pedestrian.classify([x,north])==='road')
            || Math.abs(ground-original[2])>.35
            || (recoveredEnvironment.roomAt(x,-north)?.storeId??null)!==roomId
            || nextColliders.some(collider=>residentBlocked(collider,candidate))
            || [...nextPlayers.values()].some(player=>Math.hypot(player.position[0]-x,player.position[1]-north)<.7)
            || nextState.locals.some(other=>other!==local&&Math.abs(other.position[2]-ground)<1.8&&Math.hypot(other.position[0]-x,other.position[1]-north)<.7))continue;
          local.position=candidate.position;
          if(local.life){local.life.speed=0;local.life.velocity=0;local.life.blocked=false;local.life.replanAt=0;local.life.seat=null;}
          repairedResidents.add(local.id);repaired=true;break;
        }
        if(!repaired)throw new Error('Cannot recover enclosed resident');
      }
      // A repaired recipient/helper invalidates the visit approach saved by
      // an older writer. Requeue it without spending another supply/visit.
      for(const job of nextState.jobs)if(['routing','traveling','assisting'].includes(job.phase)
        && (repairedResidents.has(job.localId)||repairedResidents.has(job.helperId))){
        job.phase='queued';job.approachAttempt=0;
        const helper=nextState.locals.find(local=>local.id===job.helperId);
        if(helper?.life){helper.life.route=[];helper.life.destination=null;helper.life.routeVersion++;if(helper.life.helping)helper.life.helping.onSite=false;}
      }
      // Navigation caches/functions derive from the same fingerprinted district.
      // Build them before committing; only serialized simulation state is restored.
      if (nextLife) {Object.assign(nextLife,clock);nextLife.state=state;}
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state,nextState);
      players.clear();for (const [id,player] of nextPlayers) players.set(id,player);
      ledgers.clear();for (const [id,ledger] of nextLedgers) ledgers.set(id,ledger);
      focus.clear();for (const [id,hold] of nextFocus) focus.set(id,hold);
      chat.splice(0,chat.length,...nextChat);
      appearanceByUser.clear();for(const [id,appearance] of nextAppearances) appearanceByUser.set(id,appearance);
      movementByUser.clear();for(const [id,movement] of nextMovements) movementByUser.set(id,movement);
      builds.clear();for(const [id,item] of nextBuilds)builds.set(id,item);syncColliders(nextLife?.navigation);
      nextLife?.navigation.setPlacedObjects(colliders);
      inventory.clear();for(const [id,items] of nextInventory)inventory.set(id,items);
      homeGuests.clear();for(const [storeId,ids] of nextHomeGuests)homeGuests.set(storeId,ids);
      localById.clear();for (const local of state.locals) localById.set(local.id,local);
      life=nextLife;revision=recovered.revision;elapsed=recovered.elapsed;
      return {ok:true};
    } catch { return reject('invalid_checkpoint'); }
  }
  // Trusted process/admin hook; deliberately absent from the command protocol.
  function reset() {
    const fresh=createCommunity(worldData,environment.rooms,{carriage:false,sharedPopulation});
    fresh.generation=state.generation+1;
    Object.assign(state,fresh);localById.clear();
    for (const local of state.locals) localById.set(local.id,local);
    for(const player of players.values())if(player.sitting)Object.assign(player,{sitting:null,
      position:[player.position[0],player.position[1],environment.groundAt(player.position[0],-player.position[1])],
      poseAt:now(),moveBudget:.1,liftBudget:.1,gesture:null,gestureUntil:0});
    focus.clear();chat.length=0;builds.clear();syncColliders();life=createResidentLife(worldData,state);elapsed=0;revision++;
  }
  const resolvePlace = placeId => placesOf(worldData).find(place=>place.id===placeId)??null;
  return {worldId,join,rename,leave,command,step,snapshot,checkpoint,restore,reset,accountAppearance,applyAccountAppearance,resolvePlace,players,state};
}

/** Validate an old room, then transfer durable account and creation state to a new geography. */
export function migrateWorldCheckpoint({fromData,toData,checkpoint,worldId=DEFAULT_WORLD_ID,now=Date.now,isAdmin=isJevicaAdmin}={}) {
  if(!fromData || !toData || !checkpoint)return reject('invalid_checkpoint');
  const oldWorld=createSharedWorld(fromData,{worldId,now,isAdmin});
  if(!oldWorld.restore(checkpoint).ok)return reject('invalid_checkpoint');
  const old=oldWorld.checkpoint();
  const fresh=createSharedWorld(toData,{worldId,now,isAdmin}).checkpoint();
  const payload=fresh.payload,previous=old.payload;
  // Simulation and NPC routes depend on geography. Account-owned state does not.
  payload.revision=previous.revision+1;
  for(const field of ['ledgers','chat','appearances','movements','builds','inventory'])payload[field]=copy(previous[field]??[]);
  const retainedHomes=new Set((toData.stores??[]).filter(store=>store.category==='home' && store.access==='owner').map(store=>store.id));
  payload.homeGuests=(previous.homeGuests??[]).filter(([storeId])=>retainedHomes.has(storeId));
  const envelope={version:CHECKPOINT_VERSION,worldId,worldFingerprint:fresh.worldFingerprint,payload};
  const migrated={...envelope,checksum:digest(envelope)};
  const probe=createSharedWorld(toData,{worldId,now,isAdmin});
  if(!probe.restore(migrated).ok)return reject('incompatible_region');
  return {ok:true,checkpoint:migrated,disconnectedPlayers:previous.players.length,
    clearedWishes:previous.state.locals.filter(local=>Boolean(local.wish)).length};
}
