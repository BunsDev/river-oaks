// Test fixture only. A TLS front server must configure its actual public origin;
// forwarding an HTTPS Origin into the HTTP-default town is intentionally denied.
export function browserFixtureOrigin({ host, port, publicOrigin }) {
  if (publicOrigin === undefined) return `http://${host}:${port}`;
  const match = typeof publicOrigin === 'string' && /^https:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/?$/.exec(publicOrigin);
  if (host !== '127.0.0.1' || !match || Number(match[1]) > 65535) throw new Error('Fixture public origin must be an explicit HTTPS loopback origin');
  return new URL(publicOrigin).origin;
}
