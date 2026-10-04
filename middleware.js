import { next } from '@vercel/functions';
import { protectedGameAsset } from './server/game-assets.js';
export { protectedGameAsset } from './server/game-assets.js';

// The public entry bundle renders sign-in and the waitlist. The game bundle and
// district data are served only after the same server-side approval check used
// by multiplayer tickets.
export function createGameAssetMiddleware({ fetcher = fetch, forward = next } = {}) {
  return async request => {
    if (!protectedGameAsset(new URL(request.url).pathname)) return forward();
    const cookie = request.headers.get('cookie');
    if (!cookie) return new Response('Waitlist approval required.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    try {
      const response = await fetcher(new URL('/api/waitlist/status', request.url), {
        headers: { cookie }, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10_000),
      });
      if (response.ok && (await response.json()).status === 'approved') {
        return forward({ headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
      }
    } catch { /* A failed approval check denies the asset. */ }
    return new Response('Waitlist approval required.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  };
}

export const config = { matcher: ['/assets/:path*', '/data/:path*'] };
export default createGameAssetMiddleware();
