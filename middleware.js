import { next } from '@vercel/functions';
import { protectedGameAsset } from './server/game-assets.js';
import { ASSET_GATE_COOKIE, SESSION_COOKIE, readCookie, verifyAssetGate } from './server/asset-gate.js';
export { protectedGameAsset } from './server/game-assets.js';

// The public entry bundle renders sign-in and the waitlist. The game bundle and
// district data are served only after the same server-side approval check used
// by multiplayer tickets. An approved browser carries a signed pass from
// /api/waitlist/status that is checked here without calling the server, so a
// page load does not cost one function call per file, and a flood of requests
// cannot exhaust a rate-limit bucket that real players share. Without a session
// cookie nothing reaches the server at all.
const denied = () => new Response('Waitlist approval required.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
const allowed = { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } };
export function createGameAssetMiddleware({ fetcher = fetch, forward = next, secret = process.env.WORKOS_COOKIE_PASSWORD, now = Date.now } = {}) {
  return async request => {
    if (!protectedGameAsset(new URL(request.url).pathname)) return forward();
    const cookie = request.headers.get('cookie');
    const session = readCookie(cookie, SESSION_COOKIE);
    if (!session) return denied();
    if (await verifyAssetGate({ secret, session, value: readCookie(cookie, ASSET_GATE_COOKIE), now: now() })) return forward(allowed);
    // No valid pass yet (first load of a tab, or it lapsed): ask the server once.
    try {
      const response = await fetcher(new URL('/api/waitlist/status', request.url), {
        headers: { cookie }, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10_000),
      });
      if (response.ok && (await response.json()).status === 'approved') return forward(allowed);
    } catch { /* A failed approval check denies the asset. */ }
    return denied();
  };
}

// Run on every static path, not just the plain /assets and /data spellings:
// the CDN serves /%64ata/district.json and /data%2Fdistrict.json as
// /data/district.json, and only a match here puts them through the gate. The
// API, auth and socket routes go to the server function, which checks access
// itself.
export const config = { matcher: ['/((?!api/|auth/|multiplayer).*)'] };
export default createGameAssetMiddleware();
