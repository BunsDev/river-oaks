import { isIP } from 'node:net';

function normalize(value) {
  if (typeof value !== 'string' || value.includes('%')) return null;
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;
  const address = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  // Node may report IPv4 sockets as mapped IPv6. Both spellings share a bucket.
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(address);
  if (!mapped) return address;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function createClientAddress(trustedProxyIPs = []) {
  const trusted = new Set(trustedProxyIPs.map(ip => {
    const address = normalize(ip);
    if (!address) throw new Error(`Invalid trusted proxy IP: ${ip}`);
    return address;
  }));
  return req => {
    const peer = normalize(req.socket?.remoteAddress) ?? 'unknown';
    if (!trusted.has(peer)) return peer;
    const header = req.headers?.['x-forwarded-for'];
    if (typeof header !== 'string' || header.length > 1024) return peer;
    const parts = header.split(',');
    if (parts.length > 16) return peer;
    const chain = parts.map(value => normalize(value.trim()));
    if (chain.some(address => address === null)) return peer;
    // Walk toward the client only while the current hop is explicitly trusted.
    let address = peer;
    for (let i = chain.length - 1; i >= 0 && trusted.has(address); i--) address = chain[i];
    return address;
  };
}

// The key an address is rate limited under. One IPv6 subscriber usually holds a
// whole /64, so its addresses share one bucket instead of 2^64 of them.
export function rateLimitKey(address) {
  if (typeof address !== 'string' || isIP(address) !== 6) return address;
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [], right = tail ? tail.split(':') : [];
  const groups = address.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map(group => parseInt(group, 16).toString(16)).join(':')}::/64`;
}
