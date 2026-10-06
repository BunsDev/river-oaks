// Restrict executable content without constraining game media, WebSockets,
// local voice connections, inline layout styles, or player interactions.
export const CONTENT_SECURITY_POLICY = "script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

export function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
}
