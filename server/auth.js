import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { WorkOS } from '@workos-inc/node';
import { VERIFY_COOKIE, verificationPage, readVerificationCode } from './email-verification.js';
import { validWorkOSIssuer, logSessionRejection } from './workos-session.js';
import { isJevicaAdmin } from './admin.js';

const SESSION_COOKIE = 'river_oaks_session';
const STATE_COOKIE = 'river_oaks_auth_state';
const STATE_TTL = 20 * 60_000;
const SESSION_TTL = 7 * 24 * 60 * 60_000;
// Sign-in starts are also limited per address by the caller.
const MAX_STATES = 20_000;
const MAX_SESSIONS = 10_000, MAX_SESSIONS_PER_USER = 10;
const PROVIDERS = { github: 'GitHubOAuth' };
const token = () => randomBytes(32).toString('base64url');
const digest = (value) => createHash('sha256').update(value).digest('base64url');

function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string'
    && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (typeof header !== 'string' || header.length > 16_384) return null;
  const values = header.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  try { return decodeURIComponent(values[0].slice(name.length + 1)); } catch { return null; }
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

/** Single-process auth: restarting intentionally invalidates all local sessions. */
export function createAuth({ apiKey, clientId, cookiePassword, origin, workos, now = Date.now, onLogout = () => {}, maxStates = MAX_STATES } = {}) {
  let base;
  try {
    const parsed = new URL(origin);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if ((parsed.protocol === 'https:' || (parsed.protocol === 'http:' && local))
      && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash) base = parsed.origin;
  } catch { /* Invalid configuration fails closed below. */ }
  let enabled = Boolean(base && apiKey && clientId && typeof cookiePassword === 'string' && cookiePassword.length >= 32);
  const sdk = enabled ? workos ?? new WorkOS(apiKey, {
    clientId, timeout: 10_000, maxRetries: 1,
  }) : null;
  const secure = base?.startsWith('https:');
  const states = new Map();
  const verifications = new Map();
  const sessions = new Map();
  const cookies = new Map();

  function setCookie(res, name, value, age) {
    const valueString = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
    const previous = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : previous ? [previous] : []), valueString]);
  }
  function removeSession(record) {
    if (sessions.get(record.sessionId) === record) sessions.delete(record.sessionId);
    cookies.delete(record.cookieHash);
  }
  // One account keeps its newest sessions, so signing in over and over cannot
  // fill the session table. Sessions are kept in creation order.
  function makeRoomFor(userId) {
    const owned = [...sessions.values()].filter(record => record.userId === userId);
    for (const record of owned.slice(0, Math.max(0, owned.length - MAX_SESSIONS_PER_USER + 1))) removeSession(record);
  }
  function cleanup() {
    const time = now();
    for (const [state, value] of states) if (value.expiresAt <= time) states.delete(state);
    for (const [state, value] of verifications) if (value.expiresAt <= time) verifications.delete(state);
    for (const record of sessions.values()) if (record.expiresAt <= time) removeSession(record);
  }
  const timer = setInterval(cleanup, 60_000);
  timer.unref();

  async function finishSignIn(result, provider, res) {
    if (!result.sealedSession || result.user?.emailVerified !== true) { json(res, 403, { error: 'verified_email_required' }); return; }
    if (result.authenticationMethod !== provider) { json(res, 403, { error: 'unsupported_provider' }); return; }
    const session = sdk.userManagement.loadSealedSession({ sessionData: result.sealedSession, cookiePassword });
    const verified = await session.authenticate();
    if (!verified.authenticated || !verified.sessionId || verified.user?.emailVerified !== true
      || verified.authenticationMethod !== provider) {
      logSessionRejection(verified, {}, clientId, now());
      json(res, 403, { error: 'invalid_session' }); return;
    }
    const previous = sessions.get(verified.sessionId);
    if (previous) removeSession(previous);
    makeRoomFor(verified.user.id);
    if (!enabled || sessions.size >= MAX_SESSIONS) { json(res, 503, { error: 'auth_busy' }); return; }
    const record = { sessionId: verified.sessionId, userId: verified.user.id, authMethod: provider,
      csrfToken: token(), cookieHash: digest(result.sealedSession), expiresAt: now() + SESSION_TTL };
    sessions.set(record.sessionId, record);
    cookies.set(record.cookieHash, record.sessionId);
    if (!identity(verified, record)) {
      removeSession(record);
      logSessionRejection(verified, record, clientId, now());
      json(res, 403, { error: 'invalid_session' }); return;
    }
    setCookie(res, SESSION_COOKIE, result.sealedSession, SESSION_TTL / 1000);
    res.writeHead(302, { Location: '/' }); res.end();
  }

  // Decode expiry only after the SDK has verified the sealed session and JWT.
  function identity(result, record) {
    if (!result.authenticated || !Object.values(PROVIDERS).includes(result.authenticationMethod)
      || result.authenticationMethod !== record.authMethod || result.user?.emailVerified !== true || result.user.id !== record.userId
      || result.sessionId !== record.sessionId || sessions.get(record.sessionId) !== record) return null;
    const claims = JSON.parse(Buffer.from(result.accessToken.split('.')[1], 'base64url').toString());
    if (!Number.isFinite(claims.exp) || claims.sub !== result.user.id || claims.sid !== result.sessionId
      || !validWorkOSIssuer(claims.iss)
      || claims.client_id !== clientId) return null;
    const expiresAt = Math.min(claims.exp * 1000, record.expiresAt);
    if (expiresAt <= now()) return null;
    const name = [result.user.firstName, result.user.lastName].filter((part) => typeof part === 'string').join(' ').trim().slice(0, 60) || 'Resident';
    return { userId: result.user.id, name, email: result.user.email, sessionId: result.sessionId, expiresAt, csrfToken: record.csrfToken };
  }

  async function authenticateRequest(req, res) {
    if (!enabled) return null;
    cleanup();
    const sealed = readCookie(req, SESSION_COOKIE);
    if (!sealed) return null;
    const record = sessions.get(cookies.get(digest(sealed)));
    if (!record) return null;
    try {
      const session = sdk.userManagement.loadSealedSession({ sessionData: sealed, cookiePassword });
      const result = await session.authenticate();
      if (result.authenticated) return identity(result, record);
      // Only a previously issued, active cookie may refresh, and only over HTTP.
      if (!res || result.reason !== 'invalid_jwt') return null;
      if (!record.refreshing) {
        record.refreshing = (async () => {
          const refreshed = await session.refresh();
          if (!refreshed.authenticated || !refreshed.sealedSession || sessions.get(record.sessionId) !== record) return null;
          const verified = await session.authenticate();
          const user = identity(verified, record);
          if (!user) return null;
          cookies.delete(record.cookieHash);
          record.cookieHash = digest(refreshed.sealedSession);
          cookies.set(record.cookieHash, record.sessionId);
          return { user, sealed: refreshed.sealedSession };
        })().finally(() => { record.refreshing = null; });
      }
      const refreshed = await record.refreshing;
      if (!refreshed || sessions.get(record.sessionId) !== record) return null;
      setCookie(res, SESSION_COOKIE, refreshed.sealed, Math.max(0, Math.floor((record.expiresAt - now()) / 1000)));
      return refreshed.user;
    } catch { return null; }
  }

  async function handle(req, res) {
    const path = new URL(req.url, base || 'http://localhost').pathname;
    if (!['/auth/login', '/auth/callback', '/auth/verify', '/auth/session', '/auth/logout', '/auth/desktop/exchange'].includes(path)) return false;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!enabled) { json(res, 503, { error: 'auth_unavailable' }); return true; }
    const method = path === '/auth/verify' ? 'GET, POST' : ['/auth/logout', '/auth/desktop/exchange'].includes(path) ? 'POST' : 'GET';
    if (!method.split(', ').includes(req.method)) { res.setHeader('Allow', method); json(res, 405, { error: 'method_not_allowed' }); return true; }
    cleanup();
    let phase = path;
    try {
      if (path === '/auth/login') {
        const choice = new URL(req.url, base).searchParams.get('provider') ?? 'github';
        const provider = PROVIDERS[choice];
        if (!provider) { json(res, 400, { error: 'unsupported_provider' }); return true; }
        if (states.size >= maxStates) { json(res, 503, { error: 'auth_busy' }); return true; }
        const reservation = token();
        // Reserve before awaiting WorkOS so concurrent requests cannot exceed the cap.
        const pending = { expiresAt: now() + STATE_TTL };
        states.set(reservation, pending);
        let authorization;
        try {
          authorization = await sdk.userManagement.getAuthorizationUrlWithPKCE({ provider, clientId, redirectUri: `${base}/auth/callback` });
        } catch (error) { states.delete(reservation); throw error; }
        states.delete(reservation);
        // This SDK generates its own state; bind the browser to that exact value.
        const { state } = authorization;
        if (!enabled || typeof state !== 'string' || state.length < 32 || states.has(state) || states.size >= maxStates) {
          json(res, 503, { error: 'auth_unavailable' }); return true;
        }
        pending.codeVerifier = authorization.codeVerifier;
        pending.provider = provider;
        states.set(state, pending);
        setCookie(res, STATE_COOKIE, state, STATE_TTL / 1000);
        res.writeHead(302, { Location: authorization.url }); res.end();
      } else if (path === '/auth/callback') {
        const query = new URL(req.url, base).searchParams;
        const state = query.get('state');
        const pending = states.get(state);
        const browserState = readCookie(req, STATE_COOKIE);
        setCookie(res, STATE_COOKIE, '', 0);
        if (!pending || !pending.codeVerifier || pending.expiresAt <= now() || !equal(state, browserState)
          || !query.get('code') || query.get('error')) { json(res, 400, { error: 'invalid_auth_callback' }); return true; }
        states.delete(state); // Consume before the code exchange, including failed exchanges.
        if (sessions.size >= MAX_SESSIONS) { json(res, 503, { error: 'auth_busy' }); return true; }
        let result;
        phase = 'callback.exchange';
        try {
          result = await sdk.userManagement.authenticateWithCode({ clientId, code: query.get('code'), codeVerifier: pending.codeVerifier, session: { sealSession: true, cookiePassword } });
        } catch (error) {
          if (error?.code !== 'email_verification_required' || typeof error.pendingAuthenticationToken !== 'string') throw error;
          if (verifications.size >= maxStates) { json(res, 503, { error: 'auth_busy' }); return true; }
          const verifyState = token();
          verifications.set(verifyState, { pendingAuthenticationToken: error.pendingAuthenticationToken,
            provider: pending.provider, expiresAt: now() + STATE_TTL, attempts: 0 });
          setCookie(res, VERIFY_COOKIE, verifyState, STATE_TTL / 1000);
          res.writeHead(303, { Location: '/auth/verify' }); res.end(); return true;
        }
        phase = 'callback.session';
        await finishSignIn(result, pending.provider, res);
      } else if (path === '/auth/verify') {
        const verifyState = readCookie(req, VERIFY_COOKIE), pending = verifications.get(verifyState);
        if (!pending || pending.expiresAt <= now()) { json(res, 400, { error: 'verification_expired' }); return true; }
        if (req.method === 'GET') { verificationPage(res); return true; }
        if (req.headers.origin !== base) { json(res, 403, { error: 'invalid_origin' }); return true; }
        const code = await readVerificationCode(req);
        if (!code) { verificationPage(res, 'Enter the six-digit code from your verification email.'); return true; }
        if (++pending.attempts > 5) {
          verifications.delete(verifyState); setCookie(res, VERIFY_COOKIE, '', 0);
          json(res, 429, { error: 'verification_attempts_exceeded' }); return true;
        }
        let result;
        phase = 'verify.exchange';
        try {
          result = await sdk.userManagement.authenticateWithEmailVerification({ clientId, code,
            pendingAuthenticationToken: pending.pendingAuthenticationToken,
            session: { sealSession: true, cookiePassword } });
        } catch (error) {
          if (error?.status >= 400 && error.status < 500) {
            verificationPage(res, 'That code could not be confirmed. Check the email and try again.'); return true;
          }
          throw error;
        }
        verifications.delete(verifyState); setCookie(res, VERIFY_COOKIE, '', 0);
        phase = 'verify.session';
        await finishSignIn(result, pending.provider, res);
      } else if (path === '/auth/desktop/exchange') {
        if (req.headers.origin !== base || req.headers['content-type'] !== 'application/json') {
          json(res, 403, { error: 'invalid_origin' }); return true;
        }
        let size = 0, chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 4096) { json(res, 413, { error: 'invalid_token' }); return true; } chunks.push(chunk); }
        let refreshToken;
        try { refreshToken = JSON.parse(Buffer.concat(chunks).toString()).refreshToken; } catch {}
        if (typeof refreshToken !== 'string' || refreshToken.length < 20 || refreshToken.length > 2048) {
          json(res, 400, { error: 'invalid_token' }); return true;
        }
        phase = 'desktop.exchange';
        const result = await sdk.userManagement.authenticateWithRefreshToken({ clientId, refreshToken,
          session: { sealSession: true, cookiePassword } });
        if (!Object.values(PROVIDERS).includes(result.authenticationMethod) || result.user?.emailVerified !== true
          || typeof result.sealedSession !== 'string') { json(res, 403, { error: 'unsupported_provider' }); return true; }
        const verified = await sdk.userManagement.loadSealedSession({ sessionData: result.sealedSession, cookiePassword }).authenticate();
        if (!verified.authenticated || !verified.sessionId || verified.user?.emailVerified !== true
          || verified.authenticationMethod !== result.authenticationMethod) {
          logSessionRejection(verified, {}, clientId, now());
          json(res, 403, { error: 'invalid_session' }); return true;
        }
        const previous = sessions.get(verified.sessionId);
        if (previous) removeSession(previous);
        makeRoomFor(verified.user.id);
        if (sessions.size >= MAX_SESSIONS) { json(res, 503, { error: 'auth_busy' }); return true; }
        const record = { sessionId: verified.sessionId, userId: verified.user.id, authMethod: result.authenticationMethod,
          csrfToken: token(), cookieHash: digest(result.sealedSession), expiresAt: now() + SESSION_TTL };
        sessions.set(record.sessionId, record); cookies.set(record.cookieHash, record.sessionId);
        if (!identity(verified, record)) {
          removeSession(record);
          logSessionRejection(verified, record, clientId, now());
          json(res, 403, { error: 'invalid_session' }); return true;
        }
        setCookie(res, SESSION_COOKIE, result.sealedSession, SESSION_TTL / 1000);
        json(res, 200, { authenticated: true });
      } else if (path === '/auth/session') {
        const user = await authenticateRequest(req, res);
        json(res, 200, user ? { authenticated: true, user: { id: user.userId, name: user.name }, csrfToken: user.csrfToken, canGrantWishes: isJevicaAdmin(user.userId) } : { authenticated: false });
      } else {
        if (req.headers.origin !== base) { json(res, 403, { error: 'invalid_origin' }); return true; }
        const user = await authenticateRequest(req, res);
        if (!user) { json(res, 401, { error: 'unauthenticated' }); return true; }
        if (!equal(req.headers['x-csrf-token'], user.csrfToken)) { json(res, 403, { error: 'invalid_csrf' }); return true; }
        removeSession(sessions.get(user.sessionId));
        setCookie(res, SESSION_COOKIE, '', 0);
        await onLogout(user.userId, user.sessionId);
        const url = sdk.userManagement.getLogoutUrl({ sessionId: user.sessionId, returnTo: `${base}/` });
        json(res, 200, { url });
      }
    } catch (error) {
      console.error('Authentication unavailable', {
        phase, name: error?.name, status: error?.status ?? error?.statusCode ?? error?.response?.status,
      });
      json(res, 503, { error: 'auth_unavailable' });
    }
    return true;
  }

  return {
    handle,
    authenticate: (req, { refresh = false } = {}) => authenticateRequest(req, refresh ? req.res : undefined),
    close() { enabled = false; clearInterval(timer); states.clear(); verifications.clear(); sessions.clear(); cookies.clear(); },
  };
}
