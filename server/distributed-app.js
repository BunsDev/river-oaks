import {observeCharacterEquip} from './character-metrics-equip.js';
import {characterSelectionGate} from './character-rollout.js';
import {isCharacterSelection} from './character-selection.js';
import { createCharacterRoutes } from './character-routes.js';
import { officeDeskAction, OFFICE_DESK_BODY_LIMIT } from './office-desk-api.js';
import {validAssembly} from '../preview/src/creator-object.js';
import { createServer } from 'node:http';
import { safeCheckpointReason } from './recovery-diagnostics.js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { sendFrame } from './backpressure.js';
import { createRateLimiter, SIGN_INS_PER_ADDRESS, SIGN_IN_WINDOW } from './rate-limit.js';
import { CLIENT_ADDRESS, createClientAddress, rateLimitKey } from './client-address.js';
import { ADMITTED } from './world-router.js';
import { createWaitlistRoutes } from './waitlist-routes.js';
import { createDebugReportRoutes } from './debug-report-routes.js';
import { DEFAULT_WORLD_ID, WORLD_PROTOCOL_VERSION, acceptsWorldProtocol, validateWorldId } from '../preview/src/world-contract.js';
import { isJevicaAdmin } from './admin.js';
import { MAX_REGION_REQUEST_BYTES } from './region-package.js';
import { socialAction } from './social-api.js';
import { groupAction } from './groups-api.js';
import { profileAction } from './profile-api.js';
import { createCyclingLeaderboard } from './cycling-api.js';
import { eventAction } from './events-api.js';
import { workplaceAction } from './workplace-api.js';
import { accountDesignCommand } from './design-commands.js';
import { securityHeaders } from './security-headers.js';
import { createVoiceRoutes } from './voice-routes.js';
import { ROTATE_NOTICE_MS, UPDATE_CLOSE, closeForUpdate, continuedConnection, retireAfter, rotateNotice } from './connection-close.js';

// Constant-time comparison of an `Authorization: Bearer <secret>` header.
function bearerMatches(header, secret) {
  const given = Buffer.from(String(header ?? '')), expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

/** HTTP/WS edge for a durable room. No instance owns canonical game or auth state. */
export function createDistributedServer({ auth, room, protocolVersion: worldProtocol = WORLD_PROTOCOL_VERSION, worldTitle, security, waitlist, waitlistAdmins = [], debugReports = null, landmarks, social = null, groups = null, profiles = null, characters = null, characterStudioEnabled = true, characterMetrics = null, events = null, workplace = null, officeDesk = null, workplaceCronSecret = null, presence = null, designLibrary = null, worldCatalog = null, worldDirectory = () => worldCatalog.list(), isAdmin = isJevicaAdmin, onApplyRegion, onBan, origin, moderators = [],
  trustedProxyIPs = [], address = createClientAddress(trustedProxyIPs), now = Date.now,
  connectionLifetime = 270_000, rotateNoticeMs = ROTATE_NOTICE_MS, assetGateSecret = null, heartbeatMs = 5000, onMove = null, voice = null, voiceCronSecret = null,
  // cyclingMiles: accepted for the leaderboard route (PR 2); the room owner flushes rides.
  cyclingMiles = null } = {}) {
  if (!waitlist) throw new Error('Waitlist is required');
  const worldId = validateWorldId(room.worldId ?? DEFAULT_WORLD_ID);
  const matchesWorld = url => (url.searchParams.get('world') ?? (worldId === DEFAULT_WORLD_ID ? DEFAULT_WORLD_ID : null)) === worldId;
  const connections = new Map(), moderatorIds = new Set(moderators);
  const localAccess = createRateLimiter(1000, 60_000), localFrames = createRateLimiter(40, 1000);
  let stopped = false, ticking = false;
  const send = (ws, value, options) => sendFrame(ws, value, options);
  const access = req => {
    if (req[ADMITTED]) return true;
    const ip = rateLimitKey(address(req));
    return localAccess(ip) && security.allow('access', ip, 1000, 60_000);
  };
  // Each sign-in start holds a pending slot until it completes or expires, so
  // one address may start only a few at a time.
  const signInStart = req => security.allow('login', rateLimitKey(address(req)), SIGN_INS_PER_ADDRESS, SIGN_IN_WINDOW);
  const leaderboard = createCyclingLeaderboard({ store: cyclingMiles });
  const approvedIdentity = async (req, res) => {
    const identity = await auth.authenticate(req);
    if (!identity) { json(res, 401, { error: 'Sign in to join the town.' }); return null; }
    if (await security.isBanned(identity.userId)) { json(res, 403, { error: 'This account cannot join the town.' }); return null; }
    if (!(await waitlist.isApproved(identity.userId))) { json(res, 403, { error: 'waitlist_approval_required' }); return null; }
    return identity;
  };
  const authorized = async (req, res) => {
    const identity = await approvedIdentity(req, res); if (!identity) return null;
    if (req.headers.origin !== origin || !equal(req.headers['x-csrf-token'], identity.csrfToken)) {
      json(res, 403, { error: 'Invalid request origin or security token.' }); return null;
    }
    return identity;
  };
  const handleCharacters=characters?createCharacterRoutes({metrics:characterMetrics,enabled:characterStudioEnabled,store:characters,approvedIdentity,authorized,
    allowRead:id=>security.allow('character-read',id,120,60000),allowWrite:id=>security.allow('character-write',id,30,60000)}):null;
  async function body(req,max=4096) {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) throw new Error('Invalid body');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks));
  }
  async function disconnectUser(userId, sessionId) {
    // Auth revocation / ban is persisted by the caller before this durable kick.
    const result = await room.request({ type: 'kick', userId, ...(sessionId ? { sessionId } : {}) });
    // Every kick (ban, approval ended, logout, another world) ends the account's voice too.
    if (voice) await voice.revokeUser(userId).catch(() => false);
    return result;
  }
  // Snapshots carry whether voice can be joined right now; the per-player space
  // and identity come from the world itself.
  const withVoice = snapshot => voice ? { ...snapshot, voice: { available: voice.status().available } } : snapshot;
  const handleVoice = voice ? createVoiceRoutes({ voice, worldId, authorized, matchesWorld, cronSecret: voiceCronSecret, allow: id => security.allow('voice', id, 30, 60_000),
    present: async identity => {
      const view = await room.read();
      const connection = view?.connections.find(item => item.userId === identity.userId && item.sessionId === identity.sessionId);
      const player = connection && view.snapshot.players.find(item => item.id === identity.userId);
      return player ? { connectionId: connection.connectionId, space: player.voice?.space ?? null } : null;
    } }) : null;
  const handleWaitlist = createWaitlistRoutes({ auth, waitlist, admins: waitlistAdmins, origin, assetGateSecret, allowInviteList: id => security.allow('invites', id, 20, 60_000), isBanned: id => security.isBanned(id),
    onRevoke: async userId => { await disconnectUser(userId); await workplace?.suspend(userId); await onBan?.(userId); } });
  const handleDebugReports = createDebugReportRoutes({ auth, store: debugReports, admins: waitlistAdmins, origin, isBanned: id => security.isBanned(id),
    allow: id => security.allow('debug-report', id, 3, 600_000) });
  // Sends the committed view. The snapshot is serialized once per broadcast, not
  // once per connection; `only` limits it to one connection (a command's sender).
  function publish(view, only = null) {
    if (!view) return;
    const present = new Map(view.connections.map(connection => [connection.userId, connection]));
    let frame = null;
    for (const connection of only ? [only] : connections.values()) {
      if (!connection.joined) continue;
      const { ws, identity, connectionId } = connection, active = present.get(identity.userId);
      if (identity.expiresAt <= now()) { ws.close(4001, 'Session expired. Reconnecting securely.'); continue; }
      if (connection.regionSha256 && view.snapshot.regionSha256 && connection.regionSha256 !== view.snapshot.regionSha256) {
        ws.close(4000, 'World region updated.'); continue;
      }
      if (!active) {
        // Removed from this world. If the account's presence is now in another
        // world it moved there (one world per account): close as "another tab",
        // which the client treats as final, instead of reading like a ban.
        if (connection.closing) continue;
        connection.closing = true;
        const close = moved => ws.close(moved ? 4009 : 4003, moved ? 'This account joined another world.' : 'Session ended or account removed from the town.');
        if (!presence) { close(false); continue; }
        void presence.getMany([identity.userId]).then(found => close(Boolean(found.get(identity.userId)) && found.get(identity.userId).worldId !== worldId), () => close(false));
        continue;
      }
      if (active.connectionId !== connectionId) { ws.close(4009, 'This account joined in another tab.'); continue; }
      send(ws, frame ??= JSON.stringify(withVoice(view.snapshot)), { snapshot: true });
    }
  }
  const server = createServer(async (req, res) => {
    securityHeaders(res);
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname;
      if (!(await access(req))) return json(res, 429, { error: 'Too many requests. Try again shortly.' });
      if (['/auth/login', '/auth/email/start', '/auth/email/verify', '/auth/desktop/exchange', '/api/waitlist/invite-redeem', '/api/waitlist/invite-issue', '/api/waitlist/invite-update'].includes(path) && !(await signInStart(req))) return json(res, 429, { error: 'Too many attempts. Try again later.' });
      req[CLIENT_ADDRESS] = rateLimitKey(address(req));
      if (await auth.handle(req, res)) return;
      if (await handleWaitlist(req, res, path)) return;
      if (await handleDebugReports(req, res, path)) return;
      if (handleCharacters && await handleCharacters(req,res,path)) return;
      if (handleVoice && await handleVoice(req, res, path, url)) return;
      // The default district answers with its served revision (#507) even without a catalog.
      if (path === '/api/world-data' && req.method === 'GET' && (worldCatalog || room.districtRevision)) {
        if (!await approvedIdentity(req, res)) return;
        const ids=url.searchParams.getAll('world');
        if(ids.length!==1)return json(res,400,{error:'Choose one world.'});
        const meta=worldCatalog?await worldCatalog.get(ids[0]):null;
        if(!meta && ids[0]!==room.worldId)return json(res,404,{error:'World not found.'});
        return json(res,200,meta?.template==='region-v1'
          ? {template:meta.template,regionSha256:meta.regionSha256,world:await worldCatalog.getRegion(meta.id)}
          : {template:meta?.template??'river-oaks',...(ids[0]===room.worldId&&room.districtRevision?{districtRevision:room.districtRevision}:{})});
      }
      if (path === '/api/worlds' && req.method === 'GET' && worldCatalog) {
        // The region editor offers furnished layouts only where this catalog can place them (#420).
        return json(res, 200, { worlds: await worldDirectory(), ...(worldCatalog.approvedSpacesEnabled ? { approvedSpaces: true } : {}) });
      }
      if (path === '/api/worlds' && req.method === 'POST' && worldCatalog) {
        const identity = await authorized(req, res); if (!identity) return;
        if (!isAdmin(identity.userId)) return json(res, 403, { error: 'Only Jevica can publish a world.' });
        let data;
        try { data = await body(req,MAX_REGION_REQUEST_BYTES); } catch { return json(res, 400, { error: 'Invalid world.' }); }
        const result = await worldCatalog.publish(data, identity.userId);
        const status = result.ok ? 201 : ['invalid_world','invalid_region'].includes(result.reason) ? 400 : 409;
        return json(res, status, result.ok ? { world: result.world } : { error: result.reason, ...(result.detail ? { detail: result.detail } : {}) });
      }
      if (path.startsWith('/api/world-draft/') && req.method === 'POST' && worldCatalog) {
        const identity = await authorized(req, res); if (!identity) return;
        if (!isAdmin(identity.userId)) return json(res, 403, { error: 'Only Jevica can edit a region draft.' });
        const action = path.slice('/api/world-draft/'.length);
        let data;
        try { data = await body(req, action === 'save' ? MAX_REGION_REQUEST_BYTES : 4096); }
        catch { return json(res, 400, { error: 'Invalid region draft request.' }); }
        if (action === 'load') {
          const editable = await worldCatalog.editable(data?.id);
          return editable ? json(res, 200, editable) : json(res, 404, { error: 'Editable region not found.' });
        }
        if (action === 'history' || action === 'version') {
          const result = action === 'history' ? await worldCatalog.history(data?.id)
            : await worldCatalog.version(data?.id, data?.revision, data?.baseRegionSha256);
          const status = result.ok ? 200 : result.reason === 'invalid_version' ? 400 : result.reason === 'stale' ? 409 : 404;
          return json(res, status, result.ok ? result : { error: result.reason });
        }
        if (action === 'save') {
          const result = await worldCatalog.saveDraft(data, identity.userId);
          const status = result.ok ? 200 : result.reason === 'invalid_draft' ? 400
            : ['missing', 'unsupported'].includes(result.reason) ? 404 : 409;
          return json(res, status, result.ok ? result : { error: result.reason });
        }
        if (action === 'discard') {
          const result = await worldCatalog.discardDraft(data?.id, data?.expectedDraftVersion);
          return json(res, result.ok ? 200 : result.reason === 'invalid_draft' ? 400 : 409,
            result.ok ? result : { error: result.reason });
        }
        if (action === 'apply' && onApplyRegion) {
          const result = await onApplyRegion(data?.id, data?.expectedDraftVersion, identity.userId);
          const status = result.ok ? 200 : result.error === 'invalid_draft' ? 400
            : result.error === 'missing' ? 404 : result.error === 'room_closed' || result.error === 'request_timeout' ? 503 : 409;
          return json(res, status, result);
        }
        return json(res, 404, { error: 'Not found.' });
      }
      if (path === '/api/multiplayer/ticket' && req.method === 'POST') {
        const identity = await authorized(req, res); if (!identity) return;
        if (!matchesWorld(url)) return json(res, 404, { error: 'World not found.' });
        const ticket = await security.issueTicket(identity, worldId);
        // The committed snapshot names the lowest protocol that can draw this world.
        // Before the room's first commit, or when its view cannot be read, the world data
        // it was created from decides; the socket rechecks before it joins. The issued
        // ticket is always returned, never left behind a failed read.
        const protocolVersion = ticket ? (await room.read().catch(() => null))?.snapshot?.protocolVersion ?? worldProtocol : worldProtocol;
        return ticket ? json(res, 200, { ticket, worldId, protocolVersion, moderator: moderatorIds.has(identity.userId) })
          : json(res, 429, { error: 'Please wait before reconnecting.' });
      }
      if (path.startsWith('/api/landmarks/') && req.method === 'POST') {
        const identity = await authorized(req, res); if (!identity) return;
        if (!matchesWorld(url)) return json(res, 404, { error: 'World not found.' });
        if (!landmarks) return json(res, 503, { error: 'Landmarks are unavailable.' });
        const action = path.slice('/api/landmarks/'.length);
        if (action === 'list') return json(res, 200, { ok: true, landmarks: await landmarks.list(identity.userId, url.searchParams.get('allWorlds') === '1') });
        let data;
        try { data = await body(req); } catch { return json(res, 400, { error: 'Invalid landmark request.' }); }
        if (action === 'add') {
          const view = await room.read();
          const joined = view?.connections.some(item => item.userId === identity.userId && item.sessionId === identity.sessionId);
          const player = joined && view.snapshot.players.find(item => item.id === identity.userId);
          if (!player) return json(res, 409, { error: 'Join the town before saving a landmark.' });
          const result = await landmarks.add(identity.userId, { name: data?.name, position: player.position.slice(0, 2), yaw: player.yaw });
          return json(res, result.ok ? 200 : 400, result.ok ? result : { error: result.reason });
        }
        if (action === 'remove') return json(res, 200, { ok: true, removed: await landmarks.remove(identity.userId, data?.id, data?.worldId) });
      }
      if (path.startsWith('/api/social/') && req.method === 'POST') {
        const identity = await authorized(req, res); if (!identity) return;
        if (!matchesWorld(url)) return json(res, 404, { error: 'World not found.' });
        const result = await socialAction({ action: path.slice('/api/social/'.length), identity, social, presence, readBody: () => body(req),
          visiblePlayer: async (user, peerId) => {
            const view = await room.read();
            return view?.connections.some(item => item.userId === user.userId && item.sessionId === user.sessionId)
              ? view.snapshot.players.find(player => player.id === peerId) : null;
          },
          inviteWorld: async user => {
            const view = await room.read();
            return view?.connections.some(item => item.userId === user.userId && item.sessionId === user.sessionId)
              ? {id:worldId,title:worldTitle} : null;
          },
          invitePlace: async (user,placeId) => {
            const view=await room.read();
            if(!view?.connections.some(item=>item.userId===user.userId && item.sessionId===user.sessionId))return null;
            const place=await room.resolvePlace(placeId);
            return place?{world:{id:worldId,title:worldTitle},place}:null;
          },
          allowWrite: id => security.allow('social', id, 12, 60_000) });
        return json(res, result.status, result.value);
      }
      if (path.startsWith('/api/groups/') && req.method === 'POST') {
        const identity=await authorized(req,res);if(!identity)return;
        if(!matchesWorld(url))return json(res,404,{error:'World not found.'});
        const result=await groupAction({action:path.slice('/api/groups/'.length),identity,groups,social,
          readBody:()=>body(req),allowWrite:id=>security.allow('groups',id,24,60_000)});
        return json(res,result.status,result.value);
      }
      if (path.startsWith('/api/events/') && req.method==='POST') {
        const identity=await authorized(req,res);if(!identity)return;
        if(!matchesWorld(url))return json(res,404,{error:'World not found.'});
        const result=await eventAction({action:path.slice('/api/events/'.length),identity,events,isAdmin,readBody:()=>body(req),
          resolveVenue:async placeId=>{
            const place=await room.resolvePlace(placeId);
            return place?{worldId,worldTitle,placeId:place.id,placeName:place.name}:null;
          },allowWrite:id=>security.allow('events',id,12,60_000)});
        return json(res,result.status,result.value);
      }
      // Vercel Cron: serverless instances keep no timers, so a scheduled call drains overdue tasks.
      // It exists only with the workplace on and a configured secret, and needs that secret.
      if (path === '/api/workplace-sweep' && req.method === 'GET' && workplace && workplaceCronSecret) {
        if (!bearerMatches(req.headers.authorization, workplaceCronSecret)) return json(res, 401, { error: 'Unauthorized.' });
        return json(res, 200, { ok: true, ...await workplace.sweep({ drain: true, budgetMs: 20_000 }) });
      }
      if (path.startsWith('/api/office-desk/') && req.method==='POST') {
        const identity=await authorized(req,res);if(!identity)return;
        if(!matchesWorld(url))return json(res,404,{error:'World not found.'});
        const action=path.slice('/api/office-desk/'.length);
        // Jevica's office, or a Gardens workstation seat (#510), in this same session.
        const visit=async user=>{const view=await room.read();if(!view?.connections.some(c=>c.userId===user.userId&&c.sessionId===user.sessionId))return null;
          const player=view.snapshot.players.find(p=>p.id===user.userId);return player?.office??(player?.campusWorkstation===true?{id:'garden-campus'}:null);};
        const common={identity,readBody:()=>body(req,OFFICE_DESK_BODY_LIMIT),allow:id=>security.allow('office_desk',id,90,60000)};
        const result=await officeDeskAction({...common,action,desk:officeDesk,hasVisit:async user=>['jevica-office','garden-campus'].includes((await visit(user))?.id)});
        return json(res,result.status,result.value);
      }
      if (path.startsWith('/api/workplace/') && req.method==='POST' && workplace) {
        const identity=await authorized(req,res);if(!identity)return;
        if(!matchesWorld(url))return json(res,404,{error:'World not found.'});
        const result=await workplaceAction({action:path.slice('/api/workplace/'.length),identity,workplace,worldId,readBody:()=>body(req),
          listPlaces:()=>room.listPlaces(),allowWrite:id=>security.allow('workplace',id,30,60_000),allowRead:id=>security.allow('workplace_read',id,120,60_000),now});
        return json(res,result.status,result.value);
      }
      if (path === '/api/cycling/leaderboard' && req.method === 'GET') {
        const identity = await approvedIdentity(req, res); if (!identity) return;
        if (!security.allow('cycling', identity.userId, 60, 60_000)) return json(res, 429, { error: 'Please wait before reading the leaderboard again.' });
        const result = await leaderboard.read(identity);
        return json(res, result.status, result.value);
      }
      if (path.startsWith('/api/profile/') && req.method === 'POST') {
        const identity = await authorized(req, res); if (!identity) return;
        if (!matchesWorld(url)) return json(res, 404, { error: 'World not found.' });
        const result = await profileAction({ action: path.slice('/api/profile/'.length), identity, worldId, profiles, social, readBody: () => body(req),
          visiblePlayer: async (user, peerId) => {
            const view = await room.read();
            return view?.connections.some(item => item.userId === user.userId && item.sessionId === user.sessionId)
              ? view.snapshot.players.find(player => player.id === peerId) : null;
          },
          allowWrite: id => security.allow('profile', id, 6, 60_000) });
        return json(res, result.status, result.value);
      }
      if (path === '/api/moderation/ban' && req.method === 'POST') {
        const identity = await authorized(req, res); if (!identity) return;
        if (!moderatorIds.has(identity.userId)) return json(res, 403, { error: 'Moderator access required.' });
        let data;
        try { data = await body(req); } catch { return json(res, 400, { error: 'Invalid moderation action.' }); }
        if (!data || typeof data.userId !== 'string' || !data.userId.length || data.userId.length > 100
          || data.userId === identity.userId || typeof data.banned !== 'boolean') return json(res, 400, { error: 'Invalid moderation action.' });
        if (data.banned) await waitlist.revokeInvites?.({ userId: data.userId, actorId: identity.userId });
        const ok = data.banned
          ? await security.ban({ userId: data.userId, actorId: identity.userId, reason: 'Moderator action' })
          : await security.unban({ userId: data.userId, actorId: identity.userId });
        if (!ok) return json(res, 503, { error: 'Moderation is temporarily unavailable.' });
        if (data.banned) {
          await disconnectUser(data.userId);
          await workplace?.suspend(data.userId);
          await onBan?.(data.userId);
        }
        return json(res, 200, { ok: true });
      }
      json(res, 404, { error: 'Not found' });
    } catch {
      if (!res.headersSent) json(res, 503, { error: 'The town is temporarily unavailable. Please reconnect shortly.' });
      else res.destroy();
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  const wss = new WebSocketServer({
    noServer: true, maxPayload: 8192,
    perMessageDeflate: {
      threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true,
      concurrencyLimit: 4, zlibDeflateOptions: { level: 1 },
    },
  });
  server.on('upgrade', async (req, socket, head) => {
    const reject = status => socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
    socket.on('error', () => {});
    try {
      const url = new URL(req.url, 'http://localhost');
      if (stopped || url.pathname !== '/multiplayer' || req.headers.origin !== origin || !(await access(req))) return reject(403);
      if (!matchesWorld(url)) return reject(403);
      const protocol = url.searchParams.get('protocol');
      if (!acceptsWorldProtocol(protocol, WORLD_PROTOCOL_VERSION)) return reject(426);
      const identity = await auth.authenticate(req);
      if (!identity || identity.expiresAt <= now() || !(await waitlist.isApproved(identity.userId)) || await security.isBanned(identity.userId)
        || !(await security.consumeTicket(url.searchParams.get('ticket'), identity, worldId))) return reject(401);
      const continues = continuedConnection(url.searchParams.get('continues'));
      wss.handleUpgrade(req, socket, head, ws => {
        ws.on('error', () => {});
        if (stopped) { ws.close(UPDATE_CLOSE.code, UPDATE_CLOSE.reason); return; }
        const connectionId = randomUUID();
        const connection = { ws, identity, connectionId, joined: false, alive: true, pending: 0 };
        connections.set(connectionId, connection);
        // The host ends each request after a few minutes, so the town retires the socket first,
        // after a notice that lets the page move to a fresh one without dropping anything.
        const retire = retireAfter(ws, connectionLifetime, { noticeMs: rotateNoticeMs,
          notify: () => { if (connection.joined && connections.get(connectionId) === connection) send(ws, rotateNotice(connectionLifetime, rotateNoticeMs, connectionId)); } });
        let admissionStage = 'join';
        const ready = (async () => {
          // A world with newer features (world-contract.js) refuses an older client before
          // it joins; the page offers Refresh instead of drawing a world it cannot render.
          // An unreadable view falls back to the world data; admission then fails as before.
          const required = (await room.read().catch(() => null))?.snapshot?.protocolVersion ?? worldProtocol;
          if (!acceptsWorldProtocol(protocol, required)) { ws.close(4000, 'World version changed'); return false; }
          const result = await room.request({ type: 'join', identity, connectionId });
          if (!result.ok) { ws.close(1013, 'The town cannot accept this connection.'); return false; }
          connection.joined = true;
          // A page moving from another socket brings its voice lease along (voice.js continueConnection).
          if (voice && continues) void voice.continueConnection({ userId: identity.userId, from: continues, to: connectionId });
          admissionStage = 'snapshot';
          const view = await room.read();
          if (!view) throw new Error('No committed town');
          connection.regionSha256 = view.snapshot.regionSha256 ?? null;
          admissionStage = 'presence';
          if (presence) {
            // One world per account: arriving here removes the account from the
            // world it was last in, so a few dozen accounts cannot fill every
            // world. The removal runs in the background and never blocks entry.
            const previous = (await presence.getMany([identity.userId])).get(identity.userId);
            await presence.join(identity.userId, { id: worldId, title: worldTitle }, connectionId);
            // The trusted owner accounts are exempt: they may edit one world while playing another.
            if (onMove && !isAdmin(identity.userId) && previous && previous.worldId !== worldId) Promise.resolve(onMove(identity.userId, previous.worldId)).catch(() => {});
          }
          if (ws.readyState !== WebSocket.OPEN) return false;
          send(ws, { ...withVoice(view.snapshot), selfId: identity.userId });
          return true;
        })().catch(error => {
          // Fixed classifications only: storage/provider errors can contain
          // credentials. Never log the error, request, identity or ticket.
          const reasons = new Map([
            ['Invalid durable town checkpoint', 'checkpoint_invalid'],
            ['Invalid durable town region', 'region_invalid'],
            ['Invalid durable town presence', 'presence_invalid'],
            ['Invalid durable town roster', 'roster_invalid'],
            ['No committed town', 'snapshot_missing'],
          ]);
          console.warn(JSON.stringify({ event: 'town_admission_failed', stage: admissionStage,
            reason: reasons.get(error?.message) ?? 'unavailable',
            ...(error?.message === 'Invalid durable town checkpoint' ? { checkpoint: safeCheckpointReason(error.checkpointReason) } : {}) }));
          ws.close(1013, 'Town temporarily unavailable.'); return false;
        });
        let queue = ready, waitingPose = null;
        ws.on('pong', () => { connection.alive = true; });
        ws.on('message', (raw, binary) => {
          if (binary || !localFrames(identity.userId)) { ws.close(4008, 'Too many or invalid messages.'); return; }
          let message;
          try {
            message = JSON.parse(raw);
            if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string'
              || (message.requestId !== undefined && (typeof message.requestId !== 'string' || message.requestId.length > 64))) throw new Error();
          } catch { send(ws, { type: 'result', ok: false, message: 'Invalid game command.' }); return; }
          if(raw.length>2048 && !(isAdmin(identity.userId)&&message.type==='build'&&validAssembly(message.assembly))){ws.close(1009,'Game command too large.');return;}
          // Ordinary movement updates need only their latest waiting position.
          // Requests expecting acknowledgments retain one slot per command.
          const coalescible = message.type === 'pose' && message.requestId === undefined;
          if (coalescible && waitingPose) { waitingPose.message = message; return; }
          if (!coalescible && connection.pending >= 8) { ws.close(4008, 'Too many pending commands.'); return; }
          const slot = { message };
          if (coalescible) waitingPose = slot;
          else { waitingPose = null; connection.pending++; }
          let equipObservation=null;
          queue = queue.then(async () => {
            if (waitingPose === slot) waitingPose = null;
            const message = slot.message;
            if (!(await ready) || ws.readyState !== WebSocket.OPEN) return;
            if (!(await security.allow('frames', identity.userId, 40, 1000))) { ws.close(4008, 'Too many messages.'); return; }
            if (identity.expiresAt <= now()) { ws.close(4001, 'Please sign in again.'); return; }
            const { requestId, selection, ...command } = message;
            if(command.type==='character'||selection!==undefined)equipObservation=observeCharacterEquip(characterMetrics);
            const studioGate=await characterSelectionGate({enabled:characterStudioEnabled,store:characters,userId:identity.userId,command,selection});
            if(studioGate){equipObservation?.result(studioGate);send(ws,{type:'result',requestId,...studioGate});return;}
            if(selection!==undefined&&!isCharacterSelection(command)){const result={ok:false,error:'invalid_character_operation'};equipObservation?.result(result);send(ws,{type:'result',requestId,...result});return;}
            if (command.type === 'report') {
              const view = await room.read();
              const self = view?.connections.find(item => item.userId === identity.userId);
              const target = view?.connections.some(item => item.userId === command.playerId);
              const ok = self?.connectionId === connectionId && target && command.playerId !== identity.userId
                && ['disruption', 'harassment', 'cheating'].includes(command.reason)
                && await security.report({ reporterId: identity.userId, targetId: command.playerId, reason: command.reason });
              send(ws, { type: 'result', requestId, ok: Boolean(ok), message: ok ? 'Report sent to the town moderators.' : 'Report could not be submitted.' });
              return;
            }
            const resolved = await accountDesignCommand({ command, userId: identity.userId, connectionId, worldId,
              room, library: designLibrary, security, isAdmin });
            const result = resolved.result ?? await room.request({ type: 'command', userId: identity.userId, connectionId, message: resolved.command, ...(selection!==undefined?{selection}:{}) });
            equipObservation?.result(result);
            if (result.error === 'stale_connection') { ws.close(4009, 'This account joined in another tab.'); return; }
            const earlyAck = result.ok && command.type === 'travel' && requestId !== undefined;
            if (earlyAck) send(ws, { type: 'result', requestId, ...result });
            // The sender sees its result at once; everyone else gets it on the next
            // 200 ms tick, instead of a full rebroadcast per command.
            if (result.ok && command.type !== 'pose' && command.type !== 'inventory') publish(await room.read(), connection);
            if (!earlyAck && (requestId !== undefined || !result.ok)) send(ws, { type: 'result', requestId, ...result });
          }).catch(() => { equipObservation?.unavailable();ws.close(1013, 'Town temporarily unavailable.'); }).finally(() => { if (!coalescible) connection.pending--; });
        });
        ws.on('close', () => {
          retire(); connections.delete(connectionId);
          if (presence) void presence.leave(identity.userId, connectionId).catch(() => {});
          // A join can commit before its acknowledgment or first snapshot fails.
          // The room fences leave by connectionId, so cleanup is safe even then.
          ready.then(() => room.request({ type: 'leave', userId: identity.userId, connectionId })).catch(() => {});
        });
      });
    } catch { reject(503); }
  });
  // One slow or failed Redis call is not an outage: everyone is told to
  // reconnect only after FAILURES_BEFORE_CLOSE ticks in a row fail, and a
  // heartbeat failure counts against its own connection only.
  const FAILURES_BEFORE_CLOSE = 3;
  let failedTicks = 0;
  const loop = setInterval(async () => {
    if (stopped || ticking || !connections.size) return;
    ticking = true;
    try { publish(await room.tick()); failedTicks = 0; }
    catch {
      if (++failedTicks >= FAILURES_BEFORE_CLOSE) {
        failedTicks = 0;
        for (const { ws } of connections.values()) ws.close(1013, 'Town temporarily unavailable.');
      }
    }
    finally { ticking = false; }
  }, 200);
  loop.unref();
  let heartbeatBusy = false;
  const heartbeat = setInterval(async () => {
    if (stopped || heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      await Promise.allSettled([...connections.values()].map(async connection => {
        if (!connection.joined) return;
        if (!connection.alive) { connection.ws.terminate(); return; }
        connection.alive = false; connection.ws.ping();
        try {
          await room.request({ type: 'heartbeat', userId: connection.identity.userId, connectionId: connection.connectionId });
          if (presence) await presence.touch(connection.identity.userId, connection.connectionId);
          connection.failedBeats = 0;
        } catch {
          if ((connection.failedBeats = (connection.failedBeats ?? 0) + 1) >= FAILURES_BEFORE_CLOSE) connection.ws.close(1013, 'Town temporarily unavailable.');
        }
      }));
    } finally { heartbeatBusy = false; }
  }, heartbeatMs);
  heartbeat.unref();
  return { server, disconnectUser, async close() {
    stopped = true; clearInterval(loop); clearInterval(heartbeat);
    if (presence) await Promise.allSettled([...connections.values()].map(connection => presence.leave(connection.identity.userId, connection.connectionId)));
    await closeForUpdate([...connections.values()].map(({ ws }) => ws));
    wss.close(); auth.close?.();
    await new Promise(resolve => server.close(resolve));
  } };
}
