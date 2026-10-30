// Everything loads from this origin by default. The exceptions: Cloudflare
// Turnstile (script and frame, email sign-in only), Google Fonts (the landing
// page), inline layout styles, data:/blob: URLs for decoded textures,
// screenshots and synthesized voice, and LiveKit Cloud's signalling hosts for
// shared voice (clients are redirected to regional *.livekit.cloud hosts, so
// one pinned host is not enough; WebRTC media and TURN are outside the CSP).
// Same-origin fetches, the /v1 voice bridge and the multiplayer WebSocket are
// all 'self'. vercel.json carries the same strings
// (server/tests/hardening2-security-headers.test.js keeps them equal).
export const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob: https://*.livekit.cloud wss://*.livekit.cloud; worker-src 'self' blob:; frame-src https://challenges.cloudflare.com https://computer.typesafe.place; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
// The microphone is for this origin's own voice chat; nothing else powerful is delegated.
export const PERMISSIONS_POLICY = 'microphone=(self), camera=(), geolocation=(), display-capture=()';

export function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
}
