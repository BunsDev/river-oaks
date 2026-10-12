// A short-lived, signed pass that the static-asset middleware can check
// locally, so serving each gated game file does not cost a server function
// call. /api/waitlist/status issues it to an approved browser. It is bound to
// the browser's session cookie, so it cannot be lent to another session, and
// it lapses after ASSET_GATE_TTL_MS, which bounds how long a revoked approval
// keeps the static bundle. Live services (tickets, sockets, APIs) check access
// themselves and never rely on it. Web Crypto only, so the same code runs in
// Vercel middleware and in Node.
const encoder = new TextEncoder();
export const ASSET_GATE_COOKIE = 'river_oaks_gate';
export const SESSION_COOKIE = 'river_oaks_session';
export const ASSET_GATE_TTL_MS = 30 * 60_000;

const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const unbase64url = text => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - text.length % 4) % 4)), char => char.charCodeAt(0));
const hmacKey = (raw, usages) => crypto.subtle.importKey('raw', raw, {name: 'HMAC', hash: 'SHA-256'}, false, usages);

// The signing key is derived from the deployment's cookie secret with a fixed
// label, so the pass never signs with the secret that seals sessions.
const keys = new Map();
function signingKey(secret) {
  if (!keys.has(secret)) keys.set(secret, (async () => {
    const root = await hmacKey(encoder.encode(secret), ['sign']);
    return hmacKey(await crypto.subtle.sign('HMAC', root, encoder.encode('river-oaks:asset-gate:v1')), ['sign', 'verify']);
  })());
  return keys.get(secret);
}
const binding = async session => base64url(await crypto.subtle.digest('SHA-256', encoder.encode(session)));
const message = async (expires, session) => encoder.encode(`v1.${expires}.${await binding(session)}`);

export async function signAssetGate({secret, session, now = Date.now(), ttlMs = ASSET_GATE_TTL_MS}) {
  const expires = Math.floor(now + ttlMs);
  return `v1.${expires}.${base64url(await crypto.subtle.sign('HMAC', await signingKey(secret), await message(expires, session)))}`;
}

export async function verifyAssetGate({secret, session, value, now = Date.now()}) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof session !== 'string' || !session || typeof value !== 'string') return false;
  const match = /^v1\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return false;
  const expires = Number(match[1]);
  // Expired, or claiming a longer life than any pass is issued with.
  if (!(expires > now) || expires > now + ASSET_GATE_TTL_MS) return false;
  try { return await crypto.subtle.verify('HMAC', await signingKey(secret), unbase64url(match[2]), await message(expires, session)); }
  catch { return false; }
}

export function readCookie(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim() || null;
  }
  return null;
}

export const assetGateCookie = (value, secure) => `${ASSET_GATE_COOKIE}=${value}; Path=/; Max-Age=${ASSET_GATE_TTL_MS / 1000}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
