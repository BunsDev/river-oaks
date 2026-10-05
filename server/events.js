import { accountName } from '../preview/src/resident-names.js';
import { randomUUID } from 'node:crypto';
import { validateWorldId } from '../preview/src/world-contract.js';

const DAY=86_400_000, LIMIT=128, HOST_LIMIT=5;
const validId=value=>typeof value==='string' && value.length>0 && value.length<=160 && !/[\u0000-\u001f\u007f]/.test(value);
const clean=(value,max)=>typeof value==='string' && value===value.trim() && [...value].length<=max
  && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
const cleanDescription=value=>typeof value==='string' && value===value.trim() && [...value].length<=400
  && !/[\u0000-\u0009\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
const fields=['title','description','placeId','startsAt','endsAt','capacity'];
const invalid=()=>({ok:false,reason:'invalid_event'});
function proposal(actor,data,venue,now,createId) {
  if(!validId(actor?.userId) || !data || typeof data!=='object' || Array.isArray(data)
    || Object.keys(data).some(key=>!fields.includes(key)) || !clean(data.title,64) || !data.title
    || !cleanDescription(data.description) || !Number.isSafeInteger(data.startsAt) || !Number.isSafeInteger(data.endsAt)
    || data.startsAt<now || data.startsAt>now+30*DAY || data.endsAt-data.startsAt<900_000 || data.endsAt-data.startsAt>8*3_600_000
    || !Number.isSafeInteger(data.capacity) || data.capacity<2 || data.capacity>32
    || !venue || data.placeId!==venue.placeId || !/^(arrival|(?:spot|shop):[\w.:-]{1,80})$/.test(data.placeId)
    || !clean(venue.worldTitle,64) || !venue.worldTitle || !clean(venue.placeName,40) || !venue.placeName)return null;
  try {validateWorldId(venue.worldId);} catch {return null;}
  return {...data,id:createId(),hostId:actor.userId,hostName:String(actor.name??'Resident').trim().slice(0,60)||'Resident',
    worldId:venue.worldId,worldTitle:venue.worldTitle,placeName:venue.placeName,attendees:[actor.userId]};
}
const view=(event,userId,admin)=>{
  const {attendees,hostId,...publicFields}=event;
  return {...publicFields,hostName:accountName(hostId,publicFields.hostName),going:attendees.includes(userId),attending:attendees.length,isHost:hostId===userId,canCancel:admin||hostId===userId};
};
const ordered=events=>events.sort((a,b)=>a.startsAt-b.startsAt || a.id.localeCompare(b.id));

export function createMemoryEvents({now=Date.now,createId=randomUUID}={}) {
  const records=new Map();
  const prune=()=>{for(const [id,event] of records)if(event.endsAt<=now())records.delete(id);};
  return {
    async list(userId,admin=false) {prune();return ordered([...records.values()].map(event=>view(event,userId,admin)));},
    async create(actor,data,venue) {
      const event=proposal(actor,data,venue,now(),createId);if(!event)return invalid();
      prune();
      if(records.size>=LIMIT || [...records.values()].filter(item=>item.hostId===actor.userId).length>=HOST_LIMIT)return {ok:false,reason:'event_limit'};
      if(records.has(event.id))return {ok:false,reason:'event_conflict'};
      records.set(event.id,event);return {ok:true,event:view(event,actor.userId,false)};
    },
    async rsvp(userId,id,going) {
      if(!validId(userId)||!validId(id)||typeof going!=='boolean')return invalid();
      prune();const event=records.get(id);if(!event)return {ok:false,reason:'event_missing'};
      if(!going&&event.hostId===userId)return {ok:false,reason:'event_host'};
      if(going&&!event.attendees.includes(userId)){
        if(event.attendees.length>=event.capacity)return {ok:false,reason:'event_full'};
        event.attendees.push(userId);
      } else if(!going)event.attendees=event.attendees.filter(item=>item!==userId);
      return {ok:true};
    },
    async cancel(userId,id,admin=false) {
      if(!validId(userId)||!validId(id))return invalid();
      prune();const event=records.get(id);if(!event)return {ok:false,reason:'event_missing'};
      if(!admin&&event.hostId!==userId)return {ok:false,reason:'event_forbidden'};
      records.delete(id);return {ok:true};
    },
  };
}

const CHANGE=`
local records = redis.call('HGETALL', KEYS[1])
local hosted = 0
for i = 1, #records, 2 do
  local event = cjson.decode(records[i + 1])
  if event.endsAt <= tonumber(ARGV[2]) then
    redis.call('HDEL', KEYS[1], records[i])
  elseif event.hostId == ARGV[3] then hosted = hosted + 1 end
end
local action = ARGV[1]
if action == 'list' then return redis.call('HVALS', KEYS[1]) end
if action == 'create' then
  if redis.call('HLEN', KEYS[1]) >= 128 or hosted >= 5 then return 'event_limit' end
  if redis.call('HEXISTS', KEYS[1], ARGV[4]) == 1 then return 'event_conflict' end
  redis.call('HSET', KEYS[1], ARGV[4], ARGV[5])
  return 'ok'
end
local raw = redis.call('HGET', KEYS[1], ARGV[4])
if not raw then return 'event_missing' end
local event = cjson.decode(raw)
if action == 'cancel' then
  if event.hostId ~= ARGV[3] and ARGV[5] ~= 'admin' then return 'event_forbidden' end
  redis.call('HDEL', KEYS[1], ARGV[4])
  return 'ok'
end
if action ~= 'rsvp' then return 'invalid_event' end
if ARGV[5] == 'no' and event.hostId == ARGV[3] then return 'event_host' end
local found = nil
for i, id in ipairs(event.attendees) do if id == ARGV[3] then found = i end end
if ARGV[5] == 'yes' and not found then
  if #event.attendees >= event.capacity then return 'event_full' end
  table.insert(event.attendees, ARGV[3])
elseif ARGV[5] == 'no' and found then table.remove(event.attendees, found) end
redis.call('HSET', KEYS[1], ARGV[4], cjson.encode(event))
return 'ok'
`;
export function createRedisEvents({redis,prefix,now=Date.now,createId=randomUUID}={}) {
  if(!redis?.eval || typeof prefix!=='string' || !/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid event storage');
  const key=`${prefix}:events:v1`;
  const change=async(action,userId,id='',payload='')=>{
    const reason=await redis.eval(CHANGE,1,key,action,now(),userId,id,payload);
    return {ok:reason==='ok',...(reason==='ok'?{}:{reason})};
  };
  return {
    async list(userId,admin=false) {
      const records=await redis.eval(CHANGE,1,key,'list',now(),userId,'','');
      return ordered(records.map(raw=>view(JSON.parse(raw),userId,admin)));
    },
    async create(actor,data,venue) {
      const event=proposal(actor,data,venue,now(),createId);if(!event)return invalid();
      const result=await change('create',actor.userId,event.id,JSON.stringify(event));
      return result.ok?{ok:true,event:view(event,actor.userId,false)}:result;
    },
    async rsvp(userId,id,going) {
      return validId(userId)&&validId(id)&&typeof going==='boolean'?change('rsvp',userId,id,going?'yes':'no'):invalid();
    },
    async cancel(userId,id,admin=false) {
      return validId(userId)&&validId(id)?change('cancel',userId,id,admin?'admin':''):invalid();
    },
  };
}
