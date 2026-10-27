import { accountName } from '../preview/src/resident-names.js';
import { isJevicaAdmin } from './admin.js';

// Saved player reports, for moderators (#292, App Review guideline 1.2). Each server
// already saves a report where its bans go: the standalone town in its moderation audit
// file, the hosted backend in the shared Redis audit list. This route only reads them.
export const REPORT_LIST_LIMIT = 200;
// Moderators, waitlist admins and Jevica's owner accounts can't be banned by a moderator:
// a banned moderator couldn't even lift their own ban. Lifting a ban on one still works.
export const STAFF_BAN_REFUSED = 'Moderators, waitlist admins and owners can’t be banned here.';
export const staffAccount = ({ moderators = [], admins = [], isAdmin = isJevicaAdmin } = {}) => {
  const ids = new Set([...moderators, ...admins]);
  return userId => ids.has(userId) || Boolean(isAdmin(userId));
};
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
// moderator's answers say `moderator: true`, failures included. `reports(except)` returns
// the newest saved reports first, leaving out those about `except` before the newest
// 200 are taken. A report about the reader is left out: it's for the other moderators,
// and it doesn't push a row off the reader's list either. The reporter is sent as a
// shown name only, which for an account without a username includes its id; the
// reported account's id is sent, with its ban and whether it's staff (`isStaff`), whom
// a moderator can't ban. `allow(userId)` limits how often a moderator reads.
export function createModerationReportsRoute({ auth, moderators = [], isBanned = async () => false, isApproved = async () => true, allow = async () => true, reports, usernameOf = async () => null, isStaff = () => false }) {
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
      const saved = (await reports(identity.userId)).filter(report => report.reportedId !== identity.userId).slice(0, REPORT_LIST_LIMIT);
      // Each account is looked up once; a ban only for a reported account.
      const names = new Map(), bans = new Map();
      const once = (cache, userId, load) => { if (!cache.has(userId)) cache.set(userId, load()); return cache.get(userId); };
      const nameOf = userId => once(names, userId, async () => accountName(userId, await Promise.resolve().then(() => usernameOf(userId)).catch(() => null)));
      const bannedOf = userId => once(bans, userId, async () => Boolean(await isBanned(userId)));
      listed = await Promise.all(saved.map(async report => {
        const [reporter, name, banned] = await Promise.all([nameOf(report.reporterId), nameOf(report.reportedId), bannedOf(report.reportedId)]);
        return { at: report.at, reason: report.reason, reporter: { name: reporter },
          reported: { id: report.reportedId, name, banned, staff: Boolean(isStaff(report.reportedId)) } };
      }));
    } catch { unavailable(res); return true; }
    json(res, 200, { moderator: true, reports: listed });
    return true;
  };
}
