const DEVICE_URL = 'https://api.workos.com/user_management/authorize/device';
const TOKEN_URL = 'https://api.workos.com/user_management/authenticate';
const METHODS = new Set(['GitHubOAuth']);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Public-client device flow: credentials stay in the system browser. */
export async function deviceSignIn({ clientId, openBrowser, fetcher = fetch, sleep = pause, now = Date.now }) {
  const start = await fetcher(DEVICE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId }), signal: AbortSignal.timeout(15_000) });
  if (!start.ok) throw new Error('WorkOS device sign-in is unavailable.');
  const device = await start.json();
  if (typeof device.device_code !== 'string' || typeof device.user_code !== 'string'
    || typeof device.verification_uri_complete !== 'string' || !device.verification_uri_complete.startsWith('https://')
    || !Number.isFinite(device.expires_in) || !Number.isFinite(device.interval)) throw new Error('Invalid WorkOS device response.');
  if (!await openBrowser(device.verification_uri_complete, device.user_code)) return null;
  const deadline = now() + Math.min(device.expires_in, 600) * 1000;
  let interval = Math.max(5, device.interval);
  while (now() < deadline) {
    await sleep(interval * 1000);
    const response = await fetcher(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: device.device_code, client_id: clientId }),
      signal: AbortSignal.timeout(15_000) });
    const data = await response.json();
    if (response.ok) {
      if (!METHODS.has(data.authentication_method))
        throw new Error('This sign-in used another provider. Choose GitHub in a private browser window, then try again.');
      if (typeof data.refresh_token !== 'string') throw new Error('WorkOS did not return a desktop session.');
      return data.refresh_token;
    }
    if (data.error === 'slow_down') interval++;
    else if (data.error !== 'authorization_pending') throw new Error('WorkOS sign-in was not completed.');
  }
  throw new Error('WorkOS sign-in timed out.');
}

export async function exchangeDesktopSession({ origin, refreshToken, fetcher = fetch }) {
  const response = await fetcher(`${origin}/auth/desktop/exchange`, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
    signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('River Oaks could not finish sign-in.');
  const cookie = response.headers.get('set-cookie')?.match(/(?:^|,\s*)river_oaks_session=([^;]+)/)?.[1];
  if (!cookie) throw new Error('River Oaks did not return a session.');
  return cookie;
}
