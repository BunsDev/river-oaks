// Call only after WorkOS SDK authentication: issuer syntax is not a trust boundary.
// SDK 10.14 selects /sso/jwks/<configured clientId>, never a URL from token claims;
// callers must also require the signed client_id to match the application.
// WorkOS documents both base-URL forms; dedicated apps can use an environment ID.
// https://workos.com/docs/reference/authkit/session-tokens
// https://workos.com/docs/authkit/sessions
export function validWorkOSIssuer(issuer) {
  return typeof issuer === 'string' && (issuer === 'https://api.workos.com' || issuer === 'https://api.workos.com/'
    || /^https:\/\/api\.workos\.com\/user_management\/client_[A-Za-z0-9]+\/?$/.exec(issuer)?.[0] === issuer);
}

export function logSessionRejection(result, record, clientId, now) {
  let claims;
  try { claims = JSON.parse(Buffer.from(result.accessToken.split('.')[1], 'base64url').toString()); } catch {}
  // Fixed boolean fields keep tokens, user data, and untrusted strings out of logs.
  console.error('Authentication session rejected', {
    authenticated: result.authenticated === true, emailVerified: result.user?.emailVerified === true,
    subjectMatches: typeof claims?.sub === 'string' && claims.sub === record.userId,
    sessionMatches: typeof claims?.sid === 'string' && claims.sid === record.sessionId,
    issuerValid: validWorkOSIssuer(claims?.iss), clientMatches: claims?.client_id === clientId,
    expiryValid: Number.isFinite(claims?.exp) && claims.exp * 1000 > now,
  });
}
