// Cloudflare Turnstile check for email sign-in, against scripted sign-ups that
// spend the daily email budget. Enabled only when TURNSTILE_SECRET_KEY is set
// (the sign-in page renders the widget when VITE_TURNSTILE_SITE_KEY is set).
// It fails closed: a missing, reused, mismatched or unverifiable token is a
// refusal, and GitHub sign-in stays available.
export const TURNSTILE_ACTION = 'email_sign_in';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function createTurnstileVerifier({ secret, hostname = null, fetcher = fetch, timeoutMs = 5000 }) {
  if (typeof secret !== 'string' || !secret) throw new Error('Turnstile needs a secret key');
  return async token => {
    if (typeof token !== 'string' || !token || token.length > 2048) return false;
    try {
      const response = await fetcher(VERIFY_URL, {
        method: 'POST', body: new URLSearchParams({ secret, response: token }), signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return false;
      const result = await response.json();
      // A token minted on another hostname the site key allows (localhost, a
      // preview) is not accepted here.
      return result?.success === true && result.action === TURNSTILE_ACTION && (!hostname || result.hostname === hostname);
    } catch { return false; }
  };
}
