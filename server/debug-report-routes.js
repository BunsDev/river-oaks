import { timingSafeEqual } from 'node:crypto';
import { accountName } from '../preview/src/resident-names.js';
import { MAX_DEBUG_REPORT_BYTES, validDebugReport } from './debug-reports.js';

const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
};
const validId = value => typeof value === 'string' && /^[\w-]{8,80}$/.test(value);

// "Report a problem": any signed-in account may send a report (waitlisted ones
// included, since sign-in problems are worth hearing about); admins list and
// download them. `allow(userId)` rate-limits sending.
export function createDebugReportRoutes({ auth, store, admins = [], origin, isBanned = async () => false, allow = () => true }) {
  const adminIds = new Set(admins);
  return async (req, res, path) => {
    if (path !== '/api/debug-reports' && path !== '/api/debug-reports/get') return false;
    const listing = path === '/api/debug-reports' && req.method === 'GET', fetching = path === '/api/debug-reports/get' && req.method === 'GET';
    if (!listing && !fetching && !(path === '/api/debug-reports' && req.method === 'POST')) { res.setHeader('Allow', path === '/api/debug-reports' ? 'GET, POST' : 'GET'); json(res, 405, { error: 'method_not_allowed' }); return true; }
    const identity = await auth.authenticate(req);
    if (!identity) { json(res, 401, { error: 'sign_in_required' }); return true; }
    if (await isBanned(identity.userId)) { json(res, 403, { error: 'access_denied' }); return true; }
    if (!store) { json(res, 503, { error: 'reports_unavailable' }); return true; }
    if (listing || fetching) {
      if (!adminIds.has(identity.userId)) { json(res, 403, { error: 'admin_required' }); return true; }
      if (listing) { json(res, 200, { reports: await store.list() }); return true; }
      const id = new URL(req.url, 'http://localhost').searchParams.get('id');
      const record = validId(id) ? await store.get(id) : null;
      if (!record) { json(res, 404, { error: 'not_found' }); return true; }
      json(res, 200, record, { 'Content-Disposition': `attachment; filename="river-oaks-report-${record.id}.json"` });
      return true;
    }
    if (req.headers.origin !== origin || !equal(req.headers['x-csrf-token'], identity.csrfToken)) { json(res, 403, { error: 'invalid_origin_or_csrf' }); return true; }
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') { json(res, 415, { error: 'json_required' }); return true; }
    if (!(await allow(identity.userId))) { json(res, 429, { error: 'Please wait a few minutes before sending another report.' }); return true; }
    let data;
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > MAX_DEBUG_REPORT_BYTES) throw new Error('too_large'); chunks.push(chunk); }
      data = JSON.parse(Buffer.concat(chunks).toString());
    } catch (error) { json(res, error.message === 'too_large' ? 413 : 400, { error: error.message === 'too_large' ? 'report_too_large' : 'invalid_report' }); return true; }
    const report = validDebugReport(data);
    if (!report) { json(res, 400, { error: 'invalid_report' }); return true; }
    const result = await store.add(report, { userId: identity.userId, name: accountName(identity.userId, identity.name) });
    json(res, 200, { ok: true, id: result.id });
    return true;
  };
}
