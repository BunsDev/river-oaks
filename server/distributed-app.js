import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { sendFrame } from './backpressure.js';
import { createRateLimiter } from './rate-limit.js';
import { createClientAddress } from './client-address.js';
import { DEFAULT_WORLD_ID, WORLD_PROTOCOL_VERSION, validateWorldId } from '../preview/src/world-contract.js';
import { isJevicaAdmin } from './admin.js';
import { MAX_REGION_REQUEST_BYTES } from './region-package.js';
import { socialAction } from './social-api.js';

const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

/** HTTP/WS edge for a durable room. No instance owns canonical game or auth state. */
export function createDistributedServer({ auth, room, security, landmarks, social = null, worldCatalog = null, isAdmin = isJevicaAdmin, onBan, origin, moderators = [],
  trustedProxyIPs = [], address = createClientAddress(trustedProxyIPs), now = Date.now,
  connectionLifetime = 270_000 } = {}) {
  const worldId = validateWorldId(room.worldId ?? DEFAULT_WORLD_ID);
  const matchesWorld = url => (url.searchParams.get('world') ?? (worldId === DEFAULT_WORLD_ID ? DEFAULT_WORLD_ID : null)) === worldId;
  const connections = new Map(), moderatorIds = new Set(moderators);
  const localAccess = createRateLimiter(120, 60_000), localFrames = createRateLimiter(40, 1000);
  let stopped = false, ticking = false;
  const send = (ws, value, options) => sendFrame(ws, value, options);
  const access = req => {
    const ip = address(req);
    return localAccess(ip) && security.allow('access', ip, 120, 60_000);
  };
  const authorized = async (req, res) => {
    const identity = await auth.authenticate(req);
    if (!identity) { json(res, 401, { error: 'Sign in to join the town.' }); return null; }
    if (await security.isBanned(identity.userId)) { json(res, 403, { error: 'This account cannot join the town.' }); return null; }
    if (req.headers.origin !== origin || !equal(req.headers['x-csrf-token'], identity.csrfToken)) {
      json(res, 403, { error: 'Invalid request origin or security token.' }); return null;
    }
    return identity;
  };
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
    return room.request({ type: 'kick', userId, ...(sessionId ? { sessionId } : {}) });
  }
  function publish(view) {
    if (!view) return;
    const present = new Map(view.connections.map(connection => [connection.userId, connection]));
    for (const connection of connections.values()) {
      if (!connection.joined) continue;
      const { ws, identity, connectionId } = connection, active = present.get(identity.userId);
      if (identity.expiresAt <= now()) { ws.close(4001, 'Session expired. Reconnecting securely.'); continue; }
      if (!active) { ws.close(4003, 'Session ended or account removed from the town.'); continue; }
      if (active.connectionId !== connectionId) { ws.close(4009, 'This account joined in another tab.'); continue; }
      send(ws, view.snapshot, { snapshot: true });
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname;
      if (!(await access(req))) return json(res, 429, { error: 'Too many requests. Try again shortly.' });
      if (await auth.handle(req, res)) return;
      if (path === '/api/world-data' && req.method === 'GET' && worldCatalog) {
        const ids=url.searchParams.getAll('world');
        if(ids.length!==1)return json(res,400,{error:'Choose one world.'});
        const meta=await worldCatalog.get(ids[0]);
        if(!meta && ids[0]!==room.worldId)return json(res,404,{error:'World not found.'});
        return json(res,200,meta?.template==='region-v1'
          ? {template:meta.template,world:await worldCatalog.getRegion(meta.id)}:{template:meta?.template??'river-oaks'});
      }
      if (path === '/api/worlds' && req.method === 'GET' && worldCatalog) {
        return json(res, 200, { worlds: await worldCatalog.list() });
      }
      if (path === '/api/worlds' && req.method === 'POST' && worldCatalog) {
        const identity = await authorized(req, res); if (!identity) return;
        if (!isAdmin(identity.userId)) return json(res, 403, { error: 'Only Jevica can publish a world.' });
        let data;
        try { data = await body(req,MAX_REGION_REQUEST_BYTES); } catch { return json(res, 400, { error: 'Invalid world.' }); }
        const result = await worldCatalog.publish(data, identity.userId);
        const status = result.ok ? 201 : ['invalid_world','invalid_region'].includes(result.reason) ? 400 : 409;
        return json(res, status, result.ok ? { world: result.world } : { error: result.reason });
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
        return json(res, 404, { error: 'Not found.' });
      }
      if (path === '/api/multiplayer/ticket' && req.method === 'POST') {
        const identity = await authorized(req, res); if (!identity) return;
        if (!matchesWorld(url)) return json(res, 404, { error: 'World not found.' });
        const ticket = await security.issueTicket(identity, worldId);
        return ticket ? json(res, 200, { ticket, worldId, protocolVersion: WORLD_PROTOCOL_VERSION, moderator: moderatorIds.has(identity.userId) })
          : json(res, 429, { error: 'Please wait before reconnecting.' });
      }
      if (path.startsWith('/api/landmarks/') && req.method === 'POST') {
        const identity = await authorized(req, res); if (!identity) return;
        if (!matchesWorld(url)) return json(res, 404, { error: 'World not found.' });
        if (!landmarks) return json(res, 503, { error: 'Landmarks are unavailable.' });
        const action = path.slice('/api/landmarks/'.length);
        if (action === 'list') return json(res, 200, { ok: true, landmarks: await landmarks.list(identity.userId) });
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
        if (action === 'remove') return json(res, 200, { ok: true, removed: await landmarks.remove(identity.userId, data?.id) });
      }
      if (path.startsWith('/api/social/') && req.method === 'POST') {
        const identity = await authorized(req, res); if (!identity) return;
        if (!matchesWorld(url)) return json(res, 404, { error: 'World not found.' });
        const result = await socialAction({ action: path.slice('/api/social/'.length), identity, social, readBody: () => body(req),
          visiblePlayer: async (user, peerId) => {
            const view = await room.read();
            return view?.connections.some(item => item.userId === user.userId && item.sessionId === user.sessionId)
              ? view.snapshot.players.find(player => player.id === peerId) : null;
          },
          allowWrite: id => security.allow('social', id, 12, 60_000) });
        return json(res, result.status, result.value);
      }
      if (path === '/api/moderation/ban' && req.method === 'POST') {
        const identity = await authorized(req, res); if (!identity) return;
        if (!moderatorIds.has(identity.userId)) return json(res, 403, { error: 'Moderator access required.' });
        let data;
        try { data = await body(req); } catch { return json(res, 400, { error: 'Invalid moderation action.' }); }
        if (!data || typeof data.userId !== 'string' || !data.userId.length || data.userId.length > 100
          || data.userId === identity.userId || typeof data.banned !== 'boolean') return json(res, 400, { error: 'Invalid moderation action.' });
        const ok = data.banned
          ? await security.ban({ userId: data.userId, actorId: identity.userId, reason: 'Moderator action' })
          : await security.unban({ userId: data.userId, actorId: identity.userId });
        if (!ok) return json(res, 503, { error: 'Moderation is temporarily unavailable.' });
        if (data.banned) {
          await disconnectUser(data.userId);
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
    noServer: true, maxPayload: 2048,
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
      if (protocol !== String(WORLD_PROTOCOL_VERSION) && !(protocol === null && worldId === DEFAULT_WORLD_ID)) return reject(426);
      const identity = await auth.authenticate(req);
      if (!identity || identity.expiresAt <= now() || await security.isBanned(identity.userId)
        || !(await security.consumeTicket(url.searchParams.get('ticket'), identity, worldId))) return reject(401);
      wss.handleUpgrade(req, socket, head, ws => {
        ws.on('error', () => {});
        if (stopped) { ws.close(1012, 'Town restarting'); return; }
        const connectionId = randomUUID();
        const connection = { ws, identity, connectionId, joined: false, alive: true, pending: 0 };
        connections.set(connectionId, connection);
        const lifetime = setTimeout(() => ws.close(1012, 'Reconnecting to the town.'), connectionLifetime);
        lifetime.unref();
        const ready = (async () => {
          const result = await room.request({ type: 'join', identity, connectionId });
          if (!result.ok) { ws.close(1013, 'The town cannot accept this connection.'); return false; }
          connection.joined = true;
          const view = await room.read();
          if (!view) throw new Error('No committed town');
          send(ws, { ...view.snapshot, selfId: identity.userId });
          return true;
        })().catch(() => { ws.close(1013, 'Town temporarily unavailable.'); return false; });
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
          // Ordinary movement updates need only their latest waiting position.
          // Requests expecting acknowledgments retain one slot per command.
          const coalescible = message.type === 'pose' && message.requestId === undefined;
          if (coalescible && waitingPose) { waitingPose.message = message; return; }
          if (!coalescible && connection.pending >= 8) { ws.close(4008, 'Too many pending commands.'); return; }
          const slot = { message };
          if (coalescible) waitingPose = slot;
          else { waitingPose = null; connection.pending++; }
          queue = queue.then(async () => {
            if (waitingPose === slot) waitingPose = null;
            const message = slot.message;
            if (!(await ready) || ws.readyState !== WebSocket.OPEN) return;
            if (!(await security.allow('frames', identity.userId, 40, 1000))) { ws.close(4008, 'Too many messages.'); return; }
            if (identity.expiresAt <= now()) { ws.close(4001, 'Please sign in again.'); return; }
            const { requestId, ...command } = message;
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
            const result = await room.request({ type: 'command', userId: identity.userId, connectionId, message: command });
            if (result.error === 'stale_connection') { ws.close(4009, 'This account joined in another tab.'); return; }
            if (result.ok && command.type !== 'pose' && command.type !== 'inventory') publish(await room.read());
            if (requestId !== undefined || !result.ok) send(ws, { type: 'result', requestId, ...result });
          }).catch(() => { ws.close(1013, 'Town temporarily unavailable.'); }).finally(() => { if (!coalescible) connection.pending--; });
        });
        ws.on('close', () => {
          clearTimeout(lifetime); connections.delete(connectionId);
          // A join can commit before its acknowledgment or first snapshot fails.
          // The room fences leave by connectionId, so cleanup is safe even then.
          ready.then(() => room.request({ type: 'leave', userId: identity.userId, connectionId })).catch(() => {});
        });
      });
    } catch { reject(503); }
  });
  const loop = setInterval(async () => {
    if (stopped || ticking || !connections.size) return;
    ticking = true;
    try { publish(await room.tick()); }
    catch { for (const { ws } of connections.values()) ws.close(1013, 'Town temporarily unavailable.'); }
    finally { ticking = false; }
  }, 200);
  loop.unref();
  let heartbeatBusy = false;
  const heartbeat = setInterval(async () => {
    if (stopped || heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      await Promise.all([...connections.values()].map(async connection => {
        if (!connection.joined) return;
        if (!connection.alive) { connection.ws.terminate(); return; }
        connection.alive = false; connection.ws.ping();
        await room.request({ type: 'heartbeat', userId: connection.identity.userId, connectionId: connection.connectionId });
      }));
    } catch { for (const { ws } of connections.values()) ws.close(1013, 'Town temporarily unavailable.'); }
    finally { heartbeatBusy = false; }
  }, 5000);
  heartbeat.unref();
  return { server, disconnectUser, async close() {
    stopped = true; clearInterval(loop); clearInterval(heartbeat);
    for (const { ws } of connections.values()) ws.terminate();
    wss.close(); auth.close?.();
    await new Promise(resolve => server.close(resolve));
  } };
}
