import { isIP } from 'node:net';

const paths = new Set(['/auth/login', '/auth/callback', '/auth/verify', '/auth/session', '/auth/logout', '/auth/desktop/exchange',
  '/api/multiplayer/ticket', '/api/moderation/ban', '/api/waitlist/status',
  '/api/waitlist/requests', '/api/waitlist/decision', '/multiplayer']);
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
