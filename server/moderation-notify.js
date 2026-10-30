// Moderation routing (#292, App Review guideline 1.2): a saved report is sent to the
// moderators' inbox, an HTTPS endpoint the operator names in MODERATION_NOTIFY_URL (a chat
// tool's incoming webhook, an email relay, a ticket queue). The server has no outbound
// email of its own (sign-in codes are WorkOS's), so what stands behind the URL is
// Decision 2 in docs/app-review-292.md. Sends are bounded (NOTIFY_LIMIT per NOTIFY_WINDOW_MS,
// shared by every reporter), time out, never follow a redirect and never throw: the report
// is saved before anyone is told, and a send that fails is logged by report id only. The
// URL and the token are never logged.

export const NOTIFY_LIMIT = 20, NOTIFY_WINDOW_MS = 600_000, NOTIFY_TIMEOUT_MS = 5_000;
export const RESPONSE_HOURS = 24;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function createModerationNotifier({ url, token = null, fetch = globalThis.fetch, now = Date.now, limit = NOTIFY_LIMIT, windowMs = NOTIFY_WINDOW_MS, timeoutMs = NOTIFY_TIMEOUT_MS, log = message => console.warn(message) } = {}) {
  let target;
  try { target = new URL(url); } catch { throw new Error('MODERATION_NOTIFY_URL must be an https URL'); }
  if (!(target.protocol === 'https:' || (target.protocol === 'http:' && LOOPBACK.has(target.hostname)))) throw new Error('MODERATION_NOTIFY_URL must be an https URL');
  if (token !== null && (typeof token !== 'string' || !token || token.length > 512 || /[\u0000-\u001f\u007f]/.test(token))) throw new Error('MODERATION_NOTIFY_TOKEN is invalid');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000 || !Number.isInteger(windowMs) || windowMs < 1000) throw new Error('Invalid moderation notify limit');
  if (typeof fetch !== 'function') throw new Error('fetch is required');
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let windowStart = -Infinity, sent = 0;
  return {
    enabled: true,
    /** Sends one report notice. Answers { sent } or { sent: false, reason }; never throws. */
    async notify(notice) {
      const id = typeof notice?.id === 'string' ? notice.id : 'unknown';
      const time = now();
      if (time - windowStart >= windowMs) { windowStart = time; sent = 0; }
      if (sent >= limit) { log(`moderation notify: ${limit} sends in ${Math.round(windowMs / 60_000)} min already; report ${id} is saved but not sent`); return { sent: false, reason: 'limited' }; }
      sent++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(target.href, { method: 'POST', headers, body: JSON.stringify({ type: 'report', ...notice }), signal: controller.signal, redirect: 'error' });
        if (!response.ok) { log(`moderation notify: the inbox answered ${response.status} for report ${id}`); return { sent: false, reason: `status_${response.status}` }; }
        return { sent: true };
      } catch (error) {
        const reason = error?.name === 'AbortError' ? 'timeout' : 'error';
        log(`moderation notify: ${reason === 'timeout' ? 'timed out' : 'failed'} for report ${id}`);
        return { sent: false, reason };
      } finally { clearTimeout(timer); }
    },
  };
}

/** The notifier an environment configures, or null when MODERATION_NOTIFY_URL is unset. */
export function moderationNotifierFromEnv(env = {}, options = {}) {
  if (!env.MODERATION_NOTIFY_URL) return null;
  return createModerationNotifier({ url: env.MODERATION_NOTIFY_URL, token: env.MODERATION_NOTIFY_TOKEN || null, ...options });
}

/** Hours a moderator has to respond to a report: MODERATION_RESPONSE_HOURS, 24 by default, 1 to 720. */
export function responseHoursFromEnv(env = {}) {
  if (env.MODERATION_RESPONSE_HOURS === undefined || env.MODERATION_RESPONSE_HOURS === '') return RESPONSE_HOURS;
  const hours = Number(env.MODERATION_RESPONSE_HOURS);
  if (!Number.isFinite(hours) || hours < 1 || hours > 720) throw new Error('MODERATION_RESPONSE_HOURS must be a number of hours from 1 to 720');
  return hours;
}
