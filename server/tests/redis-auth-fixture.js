import { randomBytes } from 'node:crypto';

// WorkOS boundary fixture; HTTP state/cookies and all Redis transactions stay real.
export function createAuthAdapter(now = Date.now) {
  const sealed = new Map(), calls = { codes: 0, refresh: 0 };
  let verified = true, issuer = 'https://api.workos.com', tokenClientId = 'client_test', refreshGate = null;
  function mint(sessionId) {
    const user = { id: 'user_1', firstName: 'Val', lastName: 'Dev', email: 'private@example.com', emailVerified: verified };
    const accessToken = `header.${Buffer.from(JSON.stringify({ iss: issuer, client_id: tokenClientId, sub: user.id, sid: sessionId, exp: Math.floor(now() / 1000) + 300 })).toString('base64url')}.signature`;
    const sealedSession = randomBytes(32).toString('base64url');
    sealed.set(sealedSession, { authenticated: true, user, sessionId, accessToken });
    return { user, accessToken, refreshToken: 'private-refresh', sealedSession };
  }
  return {
    calls,
    setVerified(value) { verified = value; },
    setIssuer(value) { issuer = value; },
    setTokenClientId(value) { tokenClientId = value; },
    blockRefresh() {
      let release, entered;
      const started = new Promise(resolve => { entered = resolve; });
      refreshGate = { wait: new Promise(resolve => { release = resolve; }), entered };
      return { started, release };
    },
    userManagement: {
      async getAuthorizationUrlWithPKCE() {
        const state = randomBytes(32).toString('base64url');
        return { state, codeVerifier: 'private-pkce-verifier', url: `https://api.workos.com/user_management/authorize?state=${state}&code_challenge=challenge` };
      },
      async authenticateWithCode(options) {
        if (options.codeVerifier !== 'private-pkce-verifier') throw new Error('Invalid verifier');
        return mint(`session_${++calls.codes}`);
      },
      loadSealedSession({ sessionData }) {
        let data = sealed.get(sessionData);
        return {
          async authenticate() {
            if (!data) return { authenticated: false, reason: 'invalid_session_cookie' };
            const claims = JSON.parse(Buffer.from(data.accessToken.split('.')[1], 'base64url'));
            return claims.exp * 1000 <= now() ? { authenticated: false, reason: 'invalid_jwt' } : data;
          },
          async refresh() {
            calls.refresh++;
            if (refreshGate) { refreshGate.entered(); await refreshGate.wait; }
            if (!data) return { authenticated: false };
            const result = mint(data.sessionId);
            data = sealed.get(result.sealedSession);
            return { authenticated: true, sealedSession: result.sealedSession, session: result, user: result.user, sessionId: data.sessionId };
          },
        };
      },
      getLogoutUrl({ sessionId, returnTo }) {
        return `https://api.workos.com/user_management/sessions/logout?session_id=${sessionId}&return_to=${encodeURIComponent(returnTo)}`;
      },
    },
  };
}
