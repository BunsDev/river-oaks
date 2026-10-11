import { isIP } from 'node:net';

const paths = new Set(['/auth/login', '/auth/callback', '/auth/verify', '/auth/desktop/exchange', '/auth/session', '/auth/logout', '/auth/email/start', '/auth/email/verify',
  '/api/waitlist/invites', '/api/waitlist/invite-issue', '/api/waitlist/invite-update', '/api/waitlist/invite-redeem',
  '/api/chauffeur', '/api/multiplayer/ticket', '/api/waitlist/status', '/api/waitlist/requests', '/api/waitlist/decision', '/api/worlds', '/api/world-draft/load', '/api/world-draft/save', '/api/world-draft/discard', '/api/world-draft/apply', '/api/world-data', '/api/moderation/ban',
  '/api/landmarks/list', '/api/landmarks/add', '/api/landmarks/remove',
  '/api/social/list', '/api/social/request', '/api/social/accept', '/api/social/remove', '/api/social/messages', '/api/social/send', '/api/social/invite-world', '/api/social/invite-place',
  '/api/groups/list', '/api/groups/read', '/api/groups/create', '/api/groups/invite', '/api/groups/accept', '/api/groups/decline', '/api/groups/leave', '/api/groups/remove', '/api/groups/send',
  '/api/events/list', '/api/events/create', '/api/events/rsvp', '/api/events/cancel',
  '/api/profile/view', '/api/profile/save', '/api/debug-reports', '/api/debug-reports/get', '/multiplayer']);
export function normalizeVercelRoute(raw) {
  try {
    const url = new URL(raw, 'http://localhost');
    const hints = url.searchParams.getAll('_river_path');
    let path = url.pathname;
    if (path === '/api/server') path = hints.length === 1 ? hints[0] : null;
    if (!paths.has(path)) return '/not-found';
    url.searchParams.delete('_river_path');
    const query = url.searchParams.toString();
    return path + (query ? '?' + query : '');
  } catch { return '/not-found'; }
}

// Only called from the Vercel entry point. Vercel overwrites this edge header;
// standalone listeners use createClientAddress and explicit trusted proxy IPs.
export function vercelClientAddress(req) {
  const raw = req.headers['x-vercel-forwarded-for'];
  if (typeof raw !== 'string' || raw.length > 64 || raw.includes('%')) return 'unknown';
  const version = isIP(raw);
  if (version === 4) return raw;
  if (version === 6) return new URL(`http://[${raw}]/`).hostname.slice(1, -1);
  return 'unknown';
}
