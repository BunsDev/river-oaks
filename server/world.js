import { createHash } from 'node:crypto';
import { COMMUNITY_SCENARIOS, createCommunity, interactWithLocal, stepCommunity } from '../preview/src/community.js';
import { createResidentLife, stepResidentLife } from '../preview/src/resident-life.js';
import { createWalkingEnvironment, createWalkingState } from '../preview/src/walking.js';
import { grantWish, undoWish, stepWishes, wishFor } from '../preview/src/wishes.js';

const WISH_COOLDOWN_MS = 5000, TRAVEL_COOLDOWN_MS = 1000, FOCUS_MS = 30000;
const LEDGER_TTL_MS = 60000, MAX_LEDGERS = 4096, MAX_ACTIVE_WISHES = 3;
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const copy = value => structuredClone(value);
const fields = (message, allowed) => Object.keys(message).every(key => allowed.includes(key));
const textId = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
const reject = (error, message = error) => ({ok:false,error,message});

const CHECKPOINT_VERSION = 1, MAX_CHECKPOINT_BYTES = 8 * 1024 * 1024;
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
export function createSharedWorld(worldData, { now = Date.now, maxPlayers = 32 } = {}) {
  const environment = createWalkingEnvironment(worldData);
  const players = new Map(), ledgers = new Map(), focus = new Map();
  const state = createCommunity(worldData, environment.rooms);
  let life = createResidentLife(worldData, state), revision = 0, elapsed = 0;
  const localById = new Map(state.locals.map(local => [local.id,local]));
  const worldFingerprint = digest(worldData);
  const residentIdentities = state.locals.map(({id,name,indoor,storeId})=>({id,name,indoor,storeId}));
  const publicPlayer = player => ({id:player.id,name:player.name,position:[...player.position],yaw:player.yaw,altitude:player.altitude});
  const clearExpiredLedgers = time => {
    for (const [id,ledger] of ledgers) if (!players.has(id) && time-ledger.seen >= LEDGER_TTL_MS) ledgers.delete(id);
  };
  function join(identity) {
    if (!identity || !textId(identity.userId) || typeof identity.name !== 'string') return reject('invalid_identity');
    if (players.has(identity.userId)) return reject('already_joined');
    if (players.size >= maxPlayers) return reject('world_full');
    const time = now();
    clearExpiredLedgers(time);
    if (!ledgers.has(identity.userId)) {
      if (ledgers.size >= MAX_LEDGERS) return reject('world_busy');
      ledgers.set(identity.userId,{wishAt:-Infinity,travelAt:-Infinity,tokens:12,tokenAt:time,seen:time});
    }
    const spawn = createWalkingState(environment).position;
    const player = {id:identity.userId,name:identity.name.slice(0,80),position:[spawn[0],-spawn[2],spawn[1]-1.68],yaw:0,altitude:0,
      poseAt:time,moveBudget:0.1,liftBudget:0.1};
    players.set(player.id,player);
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
    if (!local || local.abducted || player.altitude > 1 || distance(player.position,local.position) > 4) return false;
    const room = environment.roomAt(player.position[0],-player.position[1]);
    if ((room?.storeId ?? null) !== (local.storeId ?? null)) return false;
    return environment.hasSightLine([player.position[0],player.position[1],player.position[2]+1.68+player.altitude],
      [local.position[0],local.position[1],local.position[2]+(local.eyeHeight ?? 1.55)]);
  }
  function pose(player, message, time) {
    const correction = error => ({...reject(error),correction:publicPlayer(player),player:publicPlayer(player)});
    const {position,yaw,altitude} = message;
    if (!fields(message,['type','position','yaw','altitude']) || !Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)
      || !Number.isFinite(yaw) || !Number.isFinite(altitude) || altitude < 0 || altitude > 32) return correction('invalid_pose');
    const ground = environment.groundAt(position[0],-position[1]);
    if (Math.abs(position[2]-ground) > 0.2) return correction('invalid_ground');
    const dt = Math.max(0,Math.min(1,(time-player.poseAt)/1000));
    player.poseAt = time;
    player.moveBudget = Math.min(1,player.moveBudget+dt);
    player.liftBudget = Math.min(1,player.liftBudget+dt);
    const cost = distance(position,player.position) / (Math.max(player.altitude,altitude)>0.1 ? 7.2 : 3.4);
    const liftCost = Math.abs(altitude-player.altitude)/3.2;
    if (cost>player.moveBudget+1e-8 || liftCost>player.liftBudget+1e-8) return correction('movement_too_fast');
    const steps = Math.max(1,Math.ceil(distance(position,player.position)/0.15),Math.ceil(Math.abs(altitude-player.altitude)/0.15));
    for (let i=1;i<=steps;i++) {
      const t=i/steps, x=player.position[0]+(position[0]-player.position[0])*t, north=player.position[1]+(position[1]-player.position[1])*t;
      const height=player.altitude+(altitude-player.altitude)*t;
      if (height>0.1 ? !environment.canFly(x,environment.groundAt(x,-north)+height,-north) : !environment.isFree(x,-north)) return correction('blocked');
    }
    player.moveBudget -= cost;
    player.liftBudget -= liftCost;
    Object.assign(player,{position:[position[0],position[1],ground],yaw:Math.atan2(Math.sin(yaw),Math.cos(yaw)),altitude});
    revision++;
    return {ok:true,player:publicPlayer(player)};
  }
  function travel(player, message, ledger, time) {
    if (!fields(message,['type','localId','storeId','mode']) || Object.hasOwn(message,'localId') && !textId(message.localId)
      || Object.hasOwn(message,'storeId') && !textId(message.storeId) || (textId(message.localId) === textId(message.storeId))) return reject('invalid_destination');
    const local = localById.get(message.localId);
    const store = worldData.stores?.find(store=>store.id===message.storeId);
    const room = environment.rooms.find(room=>room.storeId===message.storeId);
    if (Object.hasOwn(message,'mode') && (!store || !['enter','leave','arrive'].includes(message.mode))) return reject('invalid_destination');
    if (!local && !store) return reject('unknown_destination');
    const mode = message.mode ?? 'enter';
    if (store && mode==='leave' && environment.roomAt(player.position[0],-player.position[1])?.storeId!==store.id) return reject('not_in_store');
    if (time-ledger.travelAt < TRAVEL_COOLDOWN_MS) return reject('travel_cooldown');
    let destination = null;
    if (local) {
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
      const origin = interior ? room.toWorld(0,2.4) : mode==='leave'
        ? store.facade.map((value,index)=>value+(store.outward[index]??0)*2.6)
        : (store.visit??store.facade).map((value,index)=>value+(store.outward[index]??0)*4);
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
    const target=local?.position ?? (mode==='enter' && room ? room.toWorld(room.center,room.depth-1) : store.facade);
    Object.assign(player,{position:destination,altitude:0,yaw:Math.atan2(destination[0]-target[0],target[1]-destination[1]),poseAt:time,moveBudget:0.1,liftBudget:0.1});
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
    if (message.type==='travel') return travel(player,message,ledger,time);
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
      const result=grantWish(state,local.id,message.kind,'jevica');
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
      stepResidentLife(life,dt);
    }
    elapsed+=duration;
    revision++;
  }
  function snapshot() {
    const community={};
    for (const key of ['status','running','elapsed','target','supported','unmet','supplies','helpBudget','jobs','events','scenarioKey','generation','result','storm','resupplied']) community[key]=copy(state[key]);
    return {type:'snapshot',revision,elapsed,players:[...players.values()].map(publicPlayer),wishes:copy(state.wishes),community,
      locals:state.locals.map(local=>({id:local.id,name:local.name,position:[...local.position],indoor:!!local.indoor,storeId:local.storeId??null,
        life:local.life?{speed:local.life.speed,distance:local.life.distance,heading:local.life.heading,status:local.life.status,action:local.life.action,source:local.life.source,blocked:local.life.blocked,visitId:local.life.visitId??null,helping:copy(local.life.helping??null)}:null,
        wish:copy(local.wish??null),wishDisruption:local.wishDisruption??null,priority:local.priority,need:local.need,needKnown:local.needKnown,status:local.status,
        action:local.action,source:local.source,lastInteraction:local.lastInteraction,lastResult:copy(local.lastResult),anchorId:local.anchorId,anchorName:local.anchorName})),
    };
  }
  // Private storage format: the checksum detects corruption, not authorization.
  // Store and restore only through the trusted persistence owner, never clients.
  function checkpoint() {
    if (life?.planning) throw new Error('Cannot checkpoint an unfinished route search');
    const payload=JSON.parse(checkpointJSON({revision,elapsed,state,players:[...players.values()],ledgers:[...ledgers],focus:[...focus],
      life:life?Object.fromEntries(LIFE_FIELDS.map(key=>[key,life[key]])):null}));
    const envelope={version:CHECKPOINT_VERSION,worldFingerprint,payload};
    if (Buffer.byteLength(JSON.stringify(envelope))>MAX_CHECKPOINT_BYTES) throw new Error('Checkpoint capacity exceeded');
    return {...envelope,checksum:digest(envelope)};
  }
  function restore(value) {
    try {
      // Clone before validation. A rejected restore never changes the live world.
      const serialized=JSON.stringify(value);
      if (typeof serialized!=='string' || Buffer.byteLength(serialized)>MAX_CHECKPOINT_BYTES) throw new Error('Invalid size');
      const saved=JSON.parse(serialized);
      if (!record(saved) || !fields(saved,['version','worldFingerprint','payload','checksum']) || saved.version!==CHECKPOINT_VERSION
        || saved.worldFingerprint!==worldFingerprint || saved.checksum!==digest({version:saved.version,worldFingerprint:saved.worldFingerprint,payload:saved.payload})) throw new Error('Invalid envelope');
      const recovered=decodeCheckpoint(JSON.stringify(saved.payload));
      if (!record(recovered) || !integer(recovered.revision) || !nonnegative(recovered.elapsed)) throw new Error('Invalid clocks');
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
        && ['tokenAt','seen'].every(key=>Number.isFinite(ledger[key])) && nonnegative(ledger.tokens) && ledger.tokens<=12);
      if (!Array.isArray(recovered.players)) throw new Error('Invalid players');
      const nextPlayers=restoreMap(recovered.players.map(player=>[player?.id,player]),maxPlayers,player=>record(player)
        && typeof player.name==='string' && player.name.length<=80 && point(player.position,3) && Number.isFinite(player.yaw)
        && nonnegative(player.altitude) && player.altitude<=32 && Number.isFinite(player.poseAt)
        && ['moveBudget','liftBudget'].every(key=>Number.isFinite(player[key]) && player[key]>=-1e-8 && player[key]<=1));
      for (const player of nextPlayers.values()) {
        const [east,north,ground]=player.position;
        if (!nextLedgers.has(player.id) || Math.abs(ground-environment.groundAt(east,-north))>0.2
          || (player.altitude>0.1?!environment.canFly(east,ground+player.altitude,-north):!environment.isFree(east,-north))) throw new Error('Invalid player position');
      }
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
      // Navigation caches/functions derive from the same fingerprinted district.
      // Build them before committing; only serialized simulation state is restored.
      const nextLife=createResidentLife(worldData,createCommunity(worldData,environment.rooms));
      if (nextLife) {Object.assign(nextLife,clock);nextLife.state=state;}
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state,nextState);
      players.clear();for (const [id,player] of nextPlayers) players.set(id,player);
      ledgers.clear();for (const [id,ledger] of nextLedgers) ledgers.set(id,ledger);
      focus.clear();for (const [id,hold] of nextFocus) focus.set(id,hold);
      localById.clear();for (const local of state.locals) localById.set(local.id,local);
      life=nextLife;revision=recovered.revision;elapsed=recovered.elapsed;
      return {ok:true};
    } catch { return reject('invalid_checkpoint'); }
  }
  // Trusted process/admin hook; deliberately absent from the command protocol.
  function reset() {
    const fresh=createCommunity(worldData,environment.rooms);
    fresh.generation=state.generation+1;
    Object.assign(state,fresh);localById.clear();
    for (const local of state.locals) localById.set(local.id,local);
    focus.clear();life=createResidentLife(worldData,state);elapsed=0;revision++;
  }
  return {join,leave,command,step,snapshot,checkpoint,restore,reset,players,state};
}
