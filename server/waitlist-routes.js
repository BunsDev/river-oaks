import { accountName } from '../preview/src/resident-names.js';
import { guardWaitlistRequest } from './name-guard.js';
import { timingSafeEqual } from 'node:crypto';

const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

export function createWaitlistRoutes({ auth, waitlist, admins = [], origin, onRevoke = async () => {} }) {
  const adminIds = new Set(admins);
  return async (req, res, path) => {
    if (!['/api/waitlist/status', '/api/waitlist/requests', '/api/waitlist/decision'].includes(path)) return false;
    const method = path === '/api/waitlist/decision' ? 'POST' : 'GET';
    if (req.method !== method) { res.setHeader('Allow', method); json(res, 405, { error: 'method_not_allowed' }); return true; }
    const identity = await auth.authenticate(req);
    if (!identity) { json(res, 401, { error: 'sign_in_required' }); return true; }
    if (path === '/api/waitlist/status') {
      const record = await waitlist.request(identity);
      json(res, 200, { status: record.status, admin: adminIds.has(identity.userId), user: { id: identity.userId, name: accountName(identity.userId, identity.name) } });
      return true;
    }
    if (!adminIds.has(identity.userId)) { json(res, 403, { error: 'approver_required' }); return true; }
    if (path === '/api/waitlist/requests') { json(res, 200, { requests: (await waitlist.list()).map(guardWaitlistRequest) }); return true; }
    if (req.headers.origin !== origin || !equal(req.headers['x-csrf-token'], identity.csrfToken)) {
      json(res, 403, { error: 'invalid_origin_or_csrf' }); return true;
    }
    let data, size = 0, chunks = [];
    try {
      for await (const chunk of req) { size += chunk.length; if (size > 1024) throw new Error('Invalid body'); chunks.push(chunk); }
      data = JSON.parse(Buffer.concat(chunks).toString());
    } catch { json(res, 400, { error: 'invalid_decision' }); return true; }
    if (!data || typeof data.userId !== 'string' || data.userId.length > 100 || typeof data.approved !== 'boolean'
      || data.userId === identity.userId || adminIds.has(data.userId)) { json(res, 400, { error: 'invalid_decision' }); return true; }
    const record = await waitlist.decide({ userId: data.userId, approved: data.approved, actorId: identity.userId });
    if (!record) { json(res, 404, { error: 'request_not_found' }); return true; }
    if (!data.approved) await onRevoke(data.userId);
    json(res, 200, { userId: record.userId, status: record.status });
    return true;
  };
}
