import { createHash, randomUUID } from 'node:crypto';
import { accountName } from '../preview/src/resident-names.js';
import { isJevicaAdmin } from './admin.js';
import { RESPONSE_HOURS } from './moderation-notify.js';

// Saved player reports, for moderators (#292, App Review guideline 1.2). Each server
// already saves a report where its bans go: the standalone town in its moderation audit
// file, the hosted backend in the shared Redis audit list. This route only reads them;
// closing one is a POST handled by each server (`closeRequest` validates its body).
export const REPORT_LIST_LIMIT = 200;
export const REASONS = new Set(['disruption', 'harassment', 'cheating']);
// What a report carries: the text the reporter quoted (at most QUOTE_LENGTH characters)
// and the reported account's last CHAT_LINES chat lines, together at most CONTENT_BYTES
// serialized, so the hosted audit entry stays under its 2 KB limit.
export const QUOTE_LENGTH = 280, CHAT_LINES = 3, CONTENT_BYTES = 1200;
export const REPORT_UNAVAILABLE = 'Reports are unavailable right now.';
// Moderators, waitlist admins and Jevica's owner accounts can't be banned by a moderator:
// a banned moderator couldn't even lift their own ban. Lifting a ban on one still works.
export const STAFF_BAN_REFUSED = 'Moderators, waitlist admins and owners can’t be banned here.';
export const staffAccount = ({ moderators = [], admins = [], isAdmin = isJevicaAdmin } = {}) => {
  const ids = new Set([...moderators, ...admins]);
  return userId => ids.has(userId) || Boolean(isAdmin(userId));
};
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
const json = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
};

const REPORT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const time = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));
// One line of text as a report keeps it: trimmed, whitespace collapsed, controls out, cut to `max`.
const line = (value, max) => {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, ' ').replace(/\s+/gu, ' ').trim();
  return [...clean].slice(0, max).join('');
};

/**
 * The content a report carries, bounded: `{ quoted, chat }` or null when it has neither.
 * `quoted` is the text the reporter pointed at; `chat` the reported account's last lines,
 * oldest first, each `{ at, text }`. Over CONTENT_BYTES, the oldest chat line goes first,
 * then the quote is shortened.
 */
export function reportContent({ quoted, chat } = {}) {
  let quote = line(quoted, QUOTE_LENGTH);
  let lines = (Array.isArray(chat) ? chat : []).map(entry => ({ at: time(entry?.at) ? entry.at : (Number.isFinite(entry?.at) && entry.at > 0 ? new Date(entry.at).toISOString() : null), text: line(entry?.text, QUOTE_LENGTH) }))
    .filter(entry => entry.text).slice(-CHAT_LINES);
  const build = () => ({ ...(quote ? { quoted: quote } : {}), ...(lines.length ? { chat: lines } : {}) });
  while (Buffer.byteLength(JSON.stringify(build())) > CONTENT_BYTES) {
    if (lines.length) lines = lines.slice(1);
    else quote = [...quote].slice(0, Math.max(0, Math.floor([...quote].length / 2))).join('');
  }
  const content = build();
  return quote || lines.length ? content : null;
}

// The chat lines in a world snapshot by one account, as a report keeps them.
export const chatLinesBy = (chat, userId) => (Array.isArray(chat) ? chat : []).filter(entry => entry?.authorId === userId).map(({ at, text }) => ({ at, text }));

// A report's id: the one it was saved with, or for a report saved before ids a digest of
// what it says, so closing works on those too.
export const reportId = entry => REPORT_ID.test(entry.id ?? '') ? entry.id
  : createHash('sha256').update(`${entry.at}|${entry.reporterId}|${entry.reportedId}|${entry.reason}`).digest('base64url').slice(0, 32);

// The town writes {type, userId}; the hosted list writes {kind, targetId}. Anything else
// in either log, a ban or a damaged line, isn't a report.
export function normalizeReport(entry) {
  if (!entry || typeof entry !== 'object' || (entry.type ?? entry.kind) !== 'report') return null;
  const reportedId = entry.userId ?? entry.targetId;
  if (!id(entry.reporterId) || !id(reportedId) || !REASONS.has(entry.reason) || !time(entry.at)) return null;
  const report = { at: entry.at, reporterId: entry.reporterId, reportedId, reason: entry.reason };
  report.id = reportId({ ...report, id: entry.id });
  report.content = entry.content && typeof entry.content === 'object' ? reportContent(entry.content) : null;
  report.respondBy = time(entry.respondBy) ? entry.respondBy : null;
  return report;
}

export const REPORT_REFUSED = 'Report could not be submitted.', REPORT_SAVED = 'Report saved.', REPORT_FAILED = 'Report unavailable. Try again.';
/**
 * The report command's shared path (#292). The reported account can be connected
 * (`present`), a recent chat author in `chat`, or an account with a username, so someone
 * who has left can still be reported; an id nobody here has ever had can't. The report
 * carries the text the reporter quoted (`message.text`, optional) and the reported
 * account's last chat lines, and records when it should be answered by. `save(entry)`
 * stores it, answering false when refused (over the reporter's limit, say). The
 * moderators' inbox is told after the save, without the reporter waiting on it.
 */
export async function submitReport({ reporterId, message, present = () => false, chat = [], usernameOf = null, save, notifier = null, responseHours = RESPONSE_HOURS, now = Date.now }) {
  const refused = { ok: false, message: REPORT_REFUSED };
  const reportedId = message?.playerId;
  if (!id(reportedId) || reportedId === reporterId || !REASONS.has(message.reason)) return refused;
  const named = async userId => { try { return (await usernameOf?.(userId)) ?? null; } catch { return null; } };
  const lines = chatLinesBy(chat, reportedId);
  const reportedName = await named(reportedId);
  if (!present(reportedId) && !lines.length && reportedName === null) return refused;
  const time = now();
  const entry = { id: randomUUID(), at: new Date(time).toISOString(), reporterId, reportedId, reason: message.reason,
    content: reportContent({ quoted: message.text, chat: lines }), respondBy: new Date(time + responseHours * 3_600_000).toISOString() };
  let saved = false;
  try { saved = await save(entry); } catch { return { ok: false, message: REPORT_FAILED }; }
  if (!saved) return refused;
  if (notifier) {
    const { reporterId: _reporter, reportedId: _reported, ...rest } = entry;
    named(reporterId).then(reporterName => notifier.notify({ ...rest, reporter: { id: reporterId, name: accountName(reporterId, reporterName) }, reported: { id: reportedId, name: accountName(reportedId, reportedName) } })).catch(() => {});
  }
  return { ok: true, message: REPORT_SAVED };
}

// The body of POST /api/moderation/reports/close: the id of the report to close, or null.
export const closeRequest = data => data && typeof data === 'object' && typeof data.id === 'string' && REPORT_ID.test(data.id) ? data.id : null;
// A closed-report record as the stores keep it: {at, by}.
export const closedRecord = (value, moderatorId) => ({ at: value, by: moderatorId });

// GET /api/moderation/reports. A signed-in resident who isn't an approved moderator
// gets { moderator: false }, so opening Settings never logs a failed request; only a
// moderator's answers say `moderator: true`, failures included. `reports(except)` returns
// the newest saved reports first, leaving out those about `except` before the newest
// 200 are taken. A report about the reader is left out: it's for the other moderators,
// and it doesn't push a row off the reader's list either. The reporter is sent as a
// shown name only, which for an account without a username includes its id; the
// reported account's id is sent, with its ban and whether it's staff (`isStaff`), whom
// a moderator can't ban. Each report carries its `id`, `content`, the time it should be
// answered by (`respondBy`, recorded when it was saved, else `responseHours` after it),
// `overdue`, and `closed` ({at, by: name} or null); open reports come first, newest
// first, then closed ones. `allow(userId)` limits how often a moderator reads.
export function createModerationReportsRoute({ auth, moderators = [], isBanned = async () => false, isApproved = async () => true, allow = async () => true, reports, usernameOf = async () => null, isStaff = () => false, responseHours = RESPONSE_HOURS, now = Date.now }) {
  const moderatorIds = new Set(moderators);
  const unavailable = res => json(res, 503, { moderator: true, error: REPORT_UNAVAILABLE });
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
      const current = now();
      listed = await Promise.all(saved.map(async report => {
        const [reporter, name, banned, closedBy] = await Promise.all([nameOf(report.reporterId), nameOf(report.reportedId), bannedOf(report.reportedId), report.closed?.by ? nameOf(report.closed.by) : null]);
        const respondBy = report.respondBy ?? new Date(Date.parse(report.at) + responseHours * 3_600_000).toISOString();
        const closed = report.closed && time(report.closed.at) ? { at: report.closed.at, by: closedBy ?? accountName(String(report.closed.by ?? ''), null) } : null;
        return { id: report.id, at: report.at, reason: report.reason, reporter: { name: reporter },
          reported: { id: report.reportedId, name, banned, staff: Boolean(isStaff(report.reportedId)) },
          content: report.content ?? null, respondBy, overdue: !closed && current > Date.parse(respondBy), closed };
      }));
      // Open reports first, each group newest first.
      listed = [...listed.filter(report => !report.closed), ...listed.filter(report => report.closed)];
    } catch { unavailable(res); return true; }
    json(res, 200, { moderator: true, reports: listed });
    return true;
  };
}
