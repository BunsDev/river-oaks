// Everything loads from this origin by default. The exceptions: Cloudflare
// Turnstile (script and frame, email sign-in only), Google Fonts (the landing
// page), inline layout styles, and data:/blob: URLs for decoded textures,
// screenshots and synthesized voice. Same-origin fetches, the /v1 voice bridge
// and the multiplayer WebSocket are all 'self'. vercel.json carries the same
// string (server/tests/hardening2-security-headers.test.js keeps them equal).
export const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
}
