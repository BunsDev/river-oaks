import { accountName } from '../preview/src/resident-names.js';

// Saved player reports, for moderators (#292, App Review guideline 1.2). Each server
// already saves a report where its bans go: the standalone town in its moderation audit
// file, the hosted backend in the shared Redis audit list. This route only reads them.
export const REPORT_LIST_LIMIT = 200;
const REASONS = new Set(['disruption', 'harassment', 'cheating']);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
const json = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
};

// The town writes {type, userId}; the hosted list writes {kind, targetId}. Anything else
// in either log, a ban or a damaged line, isn't a report.
export function normalizeReport(entry) {
  if (!entry || typeof entry !== 'object' || (entry.type ?? entry.kind) !== 'report') return null;
  const reportedId = entry.userId ?? entry.targetId;
  if (!id(entry.reporterId) || !id(reportedId) || !REASONS.has(entry.reason) || typeof entry.at !== 'string' || Number.isNaN(Date.parse(entry.at))) return null;
  return { at: entry.at, reporterId: entry.reporterId, reportedId, reason: entry.reason };
}

// GET /api/moderation/reports. A signed-in resident who isn't an approved moderator
// gets { moderator: false }, so opening Settings never logs a failed request; only a
// moderator's answers say `moderator: true`, failures included. `reports()` returns the
// newest saved reports first; `usernameOf` and `isBanned` describe each account, and
// `allow(userId)` limits how often a moderator reads.
export function createModerationReportsRoute({ auth, moderators = [], isBanned = async () => false, isApproved = async () => true, allow = async () => true, reports, usernameOf = async () => null }) {
  const moderatorIds = new Set(moderators);
  const unavailable = res => json(res, 503, { moderator: true, error: 'Reports are unavailable right now.' });
  return async (req, res) => {
    if (req.method !== 'GET') { json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' }); return true; }
    const identity = await auth.authenticate(req);
    if (!identity) { json(res, 401, { error: 'sign_in_required' }); return true; }
    if (await isBanned(identity.userId)) { json(res, 403, { error: 'access_denied' }); return true; }
    // As for a ban, a moderator needs waitlist approval too.
    if (!moderatorIds.has(identity.userId) || !reports || !(await isApproved(identity.userId))) { json(res, 200, { moderator: false }); return true; }
    if (!(await allow(identity.userId))) { json(res, 429, { moderator: true, error: 'Please wait a moment before refreshing reports.' }); return true; }
    let listed;
    try {
      const saved = (await reports()).slice(0, REPORT_LIST_LIMIT);
      const people = new Map();
      const describe = userId => {
        if (!people.has(userId)) people.set(userId, (async () => ({ id: userId,
          name: accountName(userId, await Promise.resolve().then(() => usernameOf(userId)).catch(() => null)), banned: Boolean(await isBanned(userId)) }))());
        return people.get(userId);
      };
      listed = await Promise.all(saved.map(async report => {
        const [reporter, reported] = await Promise.all([describe(report.reporterId), describe(report.reportedId)]);
        return { at: report.at, reason: report.reason, reporter: { id: reporter.id, name: reporter.name }, reported };
      }));
    } catch { unavailable(res); return true; }
    json(res, 200, { moderator: true, reports: listed });
    return true;
  };
}
