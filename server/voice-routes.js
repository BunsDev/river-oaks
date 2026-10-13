// HTTP seam for shared voice, mounted by both the standalone and the hosted
// edge behind their usual gates (session, approval, ban, exact Origin, CSRF,
// rate allowance). The only facts a client may supply are the action and the
// participant identity it received from join; the world, the connection and
// the voice space come from the transport's authority through `present`.
import { timingSafeEqual } from 'node:crypto';

// Constant-time comparison of an `Authorization: Bearer <secret>` header.
function bearerMatches(header, secret) {
  const given = Buffer.from(String(header ?? '')), expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
const STATUS = { not_connected: 409, no_space: 409, space_changed: 409, no_lease: 409, stale_connection: 409, space_full: 429, capacity: 429, budget_exhausted: 429, voice_unavailable: 503 };
const ACTIONS = new Set(['join', 'renew', 'leave']);
const MAX_BODY = 1024;
const participantText = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Too large');
    chunks.push(chunk);
  }
  if (!size) return {};
  const value = JSON.parse(Buffer.concat(chunks));
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** `present(identity)` answers `{connectionId, space}` for a live game connection in this world, else null. */
export function createVoiceRoutes({ voice, worldId, authorized, matchesWorld, present, allow, cronSecret = null }) {
  if (!voice || typeof authorized !== 'function' || typeof matchesWorld !== 'function' || typeof present !== 'function' || typeof allow !== 'function') throw new Error('Invalid voice routes');
  return async (req, res, path, url) => {
    // Vercel Cron: serverless instances keep no timers, so a scheduled call
    // sweeps orphaned participants. It exists only with a configured secret.
    if (path === '/api/voice-sweep') {
      if (!cronSecret) return false;
      if (req.method !== 'GET') { json(res, 405, { error: 'Use GET.' }); return true; }
      if (!bearerMatches(req.headers.authorization, cronSecret)) { json(res, 401, { error: 'Unauthorized.' }); return true; }
      json(res, 200, await voice.sweep({ budgetMs: 20_000 }));
      return true;
    }
    if (!path.startsWith('/api/voice/')) return false;
    const action = path.slice('/api/voice/'.length);
    if (!ACTIONS.has(action)) return false;
    if (req.method !== 'POST') { json(res, 405, { error: 'Use POST.' }); return true; }
    const identity = await authorized(req, res);
    if (!identity) return true;
    if (!matchesWorld(url)) { json(res, 404, { error: 'World not found.' }); return true; }
    let body;
    try { body = await readBody(req); } catch { json(res, 400, { error: 'Invalid voice request.' }); return true; }
    if (!await allow(identity.userId)) { json(res, 429, { error: 'Please wait before another voice request.' }); return true; }
    const live = await present(identity);
    if (!live && action !== 'leave') { json(res, 409, { ok: false, error: 'not_connected' }); return true; }
    const request = { userId: identity.userId, worldId, connectionId: live?.connectionId ?? null, space: live?.space ?? null, participantIdentity: participantText(body.participantIdentity) };
    const result = action === 'join' ? await voice.join(request) : action === 'renew' ? await voice.renew(request) : await voice.leave(request);
    if (result.ok) { json(res, 200, result); return true; }
    json(res, STATUS[result.reason] ?? 503, { ok: false, error: result.reason, ...(result.reason === 'space_changed' ? { space: result.space } : {}) });
    return true;
  };
}
