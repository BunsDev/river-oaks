import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve, sep, extname } from 'node:path';
import { stat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { sendFrame } from './backpressure.js';
import { createRateLimiter } from './rate-limit.js';
import { createClientAddress } from './client-address.js';
import { createWaitlistRoutes } from './waitlist-routes.js';
import { protectedGameAsset } from './game-assets.js';
import { DEFAULT_WORLD_ID, WORLD_PROTOCOL_VERSION, validateWorldId } from '../preview/src/world-contract.js';
import { isJevicaAdmin } from './admin.js';
import { MAX_REGION_REQUEST_BYTES } from './region-package.js';
import { socialAction } from './social-api.js';
import { profileAction } from './profile-api.js';

const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.hdr':'application/octet-stream','.svg':'image/svg+xml','.woff2':'font/woff2' };
const equal = (a,b) => typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const json = (res,status,value) => { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value)); };
export function createGameServer({ auth, world, worldTitle = world.title, landmarks, social = null, profiles = null, worldCatalog = null, worldDirectory = () => worldCatalog.list(), isAdmin = isJevicaAdmin, onApplyRegion, regionSha256 = null, onBan = null, origin, staticRoot, moderation, waitlist, waitlistAdmins = [], moderators = [], trustedProxyIPs = [], now = Date.now }) {
  if (!waitlist) throw new Error('Waitlist is required');
  const worldId=validateWorldId(world.worldId??DEFAULT_WORLD_ID);
  const matchesWorld=url=>(url.searchParams.get('world')??(worldId===DEFAULT_WORLD_ID?DEFAULT_WORLD_ID:null))===worldId;
  const clientAddress = createClientAddress(trustedProxyIPs);
  const connections = new Map(), tickets = new Map(), departures = new Map();
  const frames = createRateLimiter(40,1000), issuing = createRateLimiter(10,60000), reports = createRateLimiter(3,60000), socialWrites = createRateLimiter(12,60000);
  const access = createRateLimiter(120,60000,4096), moderatorIds = new Set(moderators);
  let stopped = false;
  const isBanned = id => moderation?.isBanned(id) ?? false;
  const send = (ws,value,options) => sendFrame(ws,value,options);
  const snapshot=()=>({...world.snapshot(),...(regionSha256?{regionSha256}:{})});
  const authorized = async (req,res) => {
    const identity = await auth.authenticate(req);
    if (!identity) {json(res,401,{error:'Sign in to join the town.'});return null;}
    if (isBanned(identity.userId)) {json(res,403,{error:'This account cannot join the town.'});return null;}
    if (!(await waitlist.isApproved(identity.userId))) {json(res,403,{error:'waitlist_approval_required'});return null;}
    if (req.headers.origin!==origin || !equal(req.headers['x-csrf-token'],identity.csrfToken)) {json(res,403,{error:'Invalid request origin or security token.'});return null;}
    return identity;
  };
  const disconnectUser = (id, code=4003, reason='Session ended') => {
    for (const [key,ticket] of tickets) if (ticket.identity.userId===id) tickets.delete(key);
    clearTimeout(departures.get(id)); departures.delete(id);
    const connection=connections.get(id);connections.delete(id);
    connection?.ws.close(code,reason);world.leave(id);
  };
  const handleWaitlist = createWaitlistRoutes({ auth, waitlist, admins: waitlistAdmins, origin,
    onRevoke: async userId => {
      disconnectUser(userId, 4003, 'Waitlist approval ended');
      await onBan?.(userId);
    } });
  async function body(req,max=4096) {
    let size=0,chunks=[];
    for await (const chunk of req) {size+=chunk.length;if(size>max)throw new Error('Request too large');chunks.push(chunk);}
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  const server = createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    try {
      const pathname=new URL(req.url,'http://localhost').pathname;
      if (pathname==='/health') return json(res,200,{ok:true,players:connections.size});
      if ((pathname.startsWith('/auth/') || pathname.startsWith('/api/')) && !access(clientAddress(req))) return json(res,429,{error:'Too many requests. Try again shortly.'});
      if (await auth.handle(req,res)) return;
      if (await handleWaitlist(req, res, pathname)) return;
      if (pathname==='/api/world-data' && req.method==='GET' && worldCatalog) {
        const ids=new URL(req.url,'http://localhost').searchParams.getAll('world');
        if(ids.length!==1)return json(res,400,{error:'Choose one world.'});
        const meta=await worldCatalog.get(ids[0]);
        if(!meta && ids[0]!==world.worldId)return json(res,404,{error:'World not found.'});
        return json(res,200,meta?.template==='region-v1'
          ? {template:meta.template,regionSha256:meta.regionSha256,world:await worldCatalog.getRegion(meta.id)}:{template:meta?.template??'river-oaks'});
      }
      if (pathname==='/api/worlds' && req.method==='GET' && worldCatalog) return json(res,200,{worlds:await worldDirectory()});
      if (pathname==='/api/worlds' && req.method==='POST' && worldCatalog) {
        const identity=await authorized(req,res);if(!identity)return;
        if(!isAdmin(identity.userId))return json(res,403,{error:'Only Jevica can publish a world.'});
        let data;
        try {data=await body(req,MAX_REGION_REQUEST_BYTES);}catch{return json(res,400,{error:'Invalid world.'});}
        const result=await worldCatalog.publish(data,identity.userId);
        return json(res,result.ok?201:['invalid_world','invalid_region'].includes(result.reason)?400:409,result.ok?{world:result.world}:{error:result.reason});
      }
      if (pathname.startsWith('/api/world-draft/') && req.method==='POST' && worldCatalog) {
        const identity=await authorized(req,res);if(!identity)return;
        if(!isAdmin(identity.userId))return json(res,403,{error:'Only Jevica can edit a region draft.'});
        const action=pathname.slice('/api/world-draft/'.length);
        let data;
        try {data=await body(req,action==='save'?MAX_REGION_REQUEST_BYTES:4096);}catch{return json(res,400,{error:'Invalid region draft request.'});}
        if(action==='load') {
          const editable=await worldCatalog.editable(data?.id);
          return editable?json(res,200,editable):json(res,404,{error:'Editable region not found.'});
        }
        if(action==='save') {
          const result=await worldCatalog.saveDraft(data,identity.userId);
          return json(res,result.ok?200:result.reason==='invalid_draft'?400:result.reason==='missing'||result.reason==='unsupported'?404:409,
            result.ok?result:{error:result.reason});
        }
        if(action==='discard') {
          const result=await worldCatalog.discardDraft(data?.id,data?.expectedDraftVersion);
          return json(res,result.ok?200:result.reason==='invalid_draft'?400:409,result.ok?result:{error:result.reason});
        }
        if(action==='apply' && onApplyRegion) {
          const result=await onApplyRegion(data?.id,data?.expectedDraftVersion,identity.userId);
          const status=result.ok?200:result.error==='invalid_draft'?400:result.error==='missing'?404:409;
          return json(res,status,result);
        }
        return json(res,404,{error:'Not found.'});
      }
      if (pathname==='/api/multiplayer/ticket' && req.method==='POST') {
        const identity=await authorized(req,res);if(!identity)return;
        if(!matchesWorld(new URL(req.url,'http://localhost')))return json(res,404,{error:'World not found.'});
        if (!issuing(identity.userId)) return json(res,429,{error:'Please wait before reconnecting.'});
        for(const [key,value] of tickets)if(value.until<=now())tickets.delete(key);
        if(tickets.size>=512)return json(res,503,{error:'The town is busy. Try again shortly.'});
        const ticket=randomBytes(32).toString('base64url');tickets.set(ticket,{identity,until:now()+15000});
        return json(res,200,{ticket,worldId,protocolVersion:WORLD_PROTOCOL_VERSION,moderator:moderatorIds.has(identity.userId)});
      }
      if (pathname.startsWith('/api/landmarks/') && req.method==='POST') {
        const identity=await authorized(req,res);if(!identity)return;
        if(!matchesWorld(new URL(req.url,'http://localhost')))return json(res,404,{error:'World not found.'});
        if(!landmarks)return json(res,503,{error:'Landmarks are unavailable.'});
        const action=pathname.slice('/api/landmarks/'.length);
        if(action==='list')return json(res,200,{ok:true,landmarks:await landmarks.list(identity.userId)});
        const data=await body(req);
        if(action==='add'){
          if(connections.get(identity.userId)?.identity.sessionId!==identity.sessionId)return json(res,409,{error:'Join the town before saving a landmark.'});
          const player=snapshot().players.find(item=>item.id===identity.userId);
          if(!player)return json(res,409,{error:'Join the town before saving a landmark.'});
          const result=await landmarks.add(identity.userId,{name:data?.name,position:player.position.slice(0,2),yaw:player.yaw});
          return json(res,result.ok?200:400,result.ok?result:{error:result.reason});
        }
        if(action==='remove')return json(res,200,{ok:true,removed:await landmarks.remove(identity.userId,data?.id)});
      }
      if (pathname.startsWith('/api/social/') && req.method==='POST') {
        const identity=await authorized(req,res);if(!identity)return;
        if(!matchesWorld(new URL(req.url,'http://localhost')))return json(res,404,{error:'World not found.'});
        const result=await socialAction({action:pathname.slice('/api/social/'.length),identity,social,readBody:()=>body(req),
          visiblePlayer:async(user,peerId)=>connections.get(user.userId)?.identity.sessionId===user.sessionId
            ? snapshot().players.find(player=>player.id===peerId) : null,
          inviteWorld:async user=>connections.get(user.userId)?.identity.sessionId===user.sessionId
            ? {id:worldId,title:worldTitle}:null,
          allowWrite:id=>socialWrites(id)});
        return json(res,result.status,result.value);
      }
      if (pathname.startsWith('/api/profile/') && req.method==='POST') {
        const identity=await authorized(req,res);if(!identity)return;
        if(!matchesWorld(new URL(req.url,'http://localhost')))return json(res,404,{error:'World not found.'});
        const result=await profileAction({action:pathname.slice('/api/profile/'.length),identity,profiles,social,readBody:()=>body(req),
          visiblePlayer:async(user,peerId)=>connections.get(user.userId)?.identity.sessionId===user.sessionId
            ? snapshot().players.find(player=>player.id===peerId) : null,
          allowWrite:id=>socialWrites(id)});
        return json(res,result.status,result.value);
      }
      if (pathname==='/api/moderation/ban' && req.method==='POST') {
        const identity=await authorized(req,res);if(!identity)return;
        if (!moderatorIds.has(identity.userId) || !moderation) return json(res,403,{error:'Moderator access required.'});
        const data=await body(req);
        if(typeof data.userId!=='string' || data.userId.length>100 || data.userId===identity.userId || typeof data.banned!=='boolean')return json(res,400,{error:'Invalid moderation action.'});
        await moderation.setBanned(data.userId,data.banned,identity.userId);
        if(data.banned){disconnectUser(data.userId,4003,'This account cannot join the town.');await onBan?.(data.userId);}
        return json(res,200,{ok:true});
      }
      if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) return json(res,404,{error:'Not found'});
      if (!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Method not allowed'});
      if (!staticRoot) return json(res,404,{error:'Run the frontend development server.'});
      const protectedAsset = protectedGameAsset(pathname);
      if (protectedAsset) {
        const identity = await auth.authenticate(req);
        if (!identity || isBanned(identity.userId) || !(await waitlist.isApproved(identity.userId))) {
          return json(res,403,{error:'waitlist_approval_required'});
        }
      }
      let path=resolve(staticRoot,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
      const root=await realpath(staticRoot);
      path=await realpath(path);
      if (!path.startsWith(root+sep)) return json(res,404,{error:'Not found'});
      const info=await stat(path);if(!info.isFile())return json(res,404,{error:'Not found'});
      res.setHeader('Content-Type',types[extname(path)]??'application/octet-stream');
      res.setHeader('Cache-Control',protectedAsset?'private, no-store':extname(path)==='.html'?'no-cache':'public, max-age=300');
      if(protectedAsset)res.setHeader('Vary','Cookie');
      res.setHeader('Content-Length',info.size);
      if(req.method==='HEAD')return res.end();
      createReadStream(path).on('error',()=>res.destroy()).pipe(res);
    } catch(error) {
      if(!res.headersSent)json(res,error.code==='ENOENT'?404:400,{error:'Request could not be completed.'});else res.destroy();
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  // Snapshots are repetitive JSON; the shared Redis server compresses them the same way.
  const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:{threshold:1024,serverNoContextTakeover:true,clientNoContextTakeover:true,concurrencyLimit:4,zlibDeflateOptions:{level:1}}});
  server.on('upgrade',async(req,socket,head)=>{
    const reject=status=>{socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);};
    socket.on('error',()=>{});
    try {
      const url=new URL(req.url,'http://localhost');
      if(stopped || url.pathname!=='/multiplayer' || req.headers.origin!==origin || !access(clientAddress(req)))return reject(403);
      if(!matchesWorld(url))return reject(403);
      const protocol=url.searchParams.get('protocol');
      if(protocol!==String(WORLD_PROTOCOL_VERSION) && !(protocol===null && worldId===DEFAULT_WORLD_ID))return reject(426);
      const identity=await auth.authenticate(req);
      if(!identity || isBanned(identity.userId) || !(await waitlist.isApproved(identity.userId)))return reject(401);
      const key=url.searchParams.get('ticket'),ticket=tickets.get(key);
      if(!ticket || ticket.until<=now() || ticket.identity.sessionId!==identity.sessionId || ticket.identity.userId!==identity.userId)return reject(401);
      tickets.delete(key);
      wss.handleUpgrade(req,socket,head,ws=>{
        if(stopped){ws.close(1012,'Town restarting');return;}
        if(!connections.has(identity.userId) && !departures.has(identity.userId)) {
          const result=world.join(identity);if(!result.ok){ws.close(1013,'The town is full. Try again shortly.');return;}
        }
        clearTimeout(departures.get(identity.userId));departures.delete(identity.userId);
        const old=connections.get(identity.userId);
        const connection={ws,identity,alive:true};connections.set(identity.userId,connection);
        old?.ws.close(4009,'This account joined in another tab.');
        ws.on('error',()=>{});ws.on('pong',()=>{connection.alive=true;});
        let messageQueue = Promise.resolve();
        ws.on('message',(raw,isBinary)=>{
          if(connections.get(identity.userId)!==connection)return;
          if(isBinary || !frames(identity.userId))return ws.close(4008,'Too many or invalid messages.');
          messageQueue = messageQueue.then(async()=>{
          if(connections.get(identity.userId)!==connection || ws.readyState!==WebSocket.OPEN)return;
          let approved = false;
          try { approved = await waitlist.isApproved(identity.userId); } catch { /* Storage fails closed. */ }
          if(connections.get(identity.userId)!==connection || ws.readyState!==WebSocket.OPEN)return;
          if(identity.expiresAt<=now() || isBanned(identity.userId) || !approved)return disconnectUser(identity.userId,4001,'Please sign in again.');
          try {
            const message=JSON.parse(raw.toString());
            if(!message || typeof message!=='object' || Array.isArray(message) || typeof message.type!=='string')throw new Error('Invalid');
            if(message.type==='report') {
              if(!moderation || !reports(identity.userId) || !['disruption','harassment','cheating'].includes(message.reason) || !connections.has(message.playerId) || message.playerId===identity.userId)return send(ws,{type:'result',requestId:message.requestId,ok:false,message:'Report could not be submitted.'});
              moderation.report(identity.userId,message.playerId,message.reason).then(()=>send(ws,{type:'result',requestId:message.requestId,ok:true,message:'Report sent to the town moderators.'}),()=>send(ws,{type:'result',requestId:message.requestId,ok:false,message:'Report unavailable. Try again.'}));return;
            }
            const {requestId,...command}=message;
            if(requestId!==undefined && (typeof requestId!=='string' || requestId.length>64))throw new Error('Invalid request id');
            const result=world.command(identity.userId,command);
            if(result.ok && command.type!=='pose' && command.type!=='inventory')send(ws,snapshot());
            if(requestId!==undefined || !result.ok)send(ws,{type:'result',requestId,...result});
          } catch {send(ws,{type:'result',ok:false,message:'Invalid game command.'});}
          }).catch(()=>ws.close(1013,'Town temporarily unavailable.'));
        });
        ws.on('close',()=>{
          if(connections.get(identity.userId)!==connection)return;
          connections.delete(identity.userId);
          const timer=setTimeout(()=>{departures.delete(identity.userId);world.leave(identity.userId);},10000);timer.unref();departures.set(identity.userId,timer);
        });
        send(ws,{...snapshot(),selfId:identity.userId});
      });
    }catch{return reject(401);}
  });
  let previous=now(),broadcastAt=0;
  const loop=setInterval(()=>{
    const time=now(),delta=Math.min(0.25,Math.max(0,(time-previous)/1000));previous=time;
    if(!connections.size)return;
    world.step(delta);
    if(time-broadcastAt<200)return;broadcastAt=time;
    const frame=JSON.stringify(snapshot());
    for(const {ws,identity} of connections.values()) {
      if(identity.expiresAt<=time)ws.close(4001,'Session expired. Reconnecting securely.');else send(ws,frame,{snapshot:true});
    }
  },50);loop.unref();
  // A busy renderer can delay browser pongs; allow a full 30 seconds before
  // treating a missing response as a dead connection.
  const heartbeat=setInterval(()=>{
    for(const connection of connections.values()) {
      if(!connection.alive){connection.ws.terminate();continue;}
      connection.alive=false;connection.ws.ping();
    }
    for(const [key,ticket]of tickets)if(ticket.until<=now())tickets.delete(key);
  },30000);heartbeat.unref();
  return {server,disconnectUser,get playerCount(){return connections.size;},replaceWorld(next,hash){
    if(next.worldId!==worldId)throw new Error('Cannot replace a different world');
    for(const timer of departures.values())clearTimeout(timer);
    departures.clear();tickets.clear();
    for(const {ws} of connections.values())ws.close(4000,'World region updated.');
    connections.clear();world=next;regionSha256=hash;
  },async close(){
    stopped=true;clearInterval(loop);clearInterval(heartbeat);
    for(const timer of departures.values())clearTimeout(timer);
    for(const ws of wss.clients)ws.terminate();
    auth.close?.();wss.close();
    await new Promise(resolve=>server.close(resolve));
  }};
}
