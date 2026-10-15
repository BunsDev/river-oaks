import { isIP } from 'node:net';

// The phone acceptance fixture is never a public server. Bind one explicit
// local or private IPv4 interface; the authoritative town stays on loopback.
export function phoneFixtureHost(value) {
  if (value == null) return null;
  if (isIP(value) !== 4) throw new Error('RIVER_OAKS_PHONE_FIXTURE_HOST must be a private IPv4 address.');
  const [a, b] = value.split('.').map(Number);
  const privateHost = a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  if (!privateHost) throw new Error('RIVER_OAKS_PHONE_FIXTURE_HOST must be a private IPv4 address.');
  return value;
}
