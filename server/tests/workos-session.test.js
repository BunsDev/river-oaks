import assert from 'node:assert/strict';
import test from 'node:test';
import { validWorkOSIssuer, logSessionRejection } from '../workos-session.js';

test('WorkOS issuer formats are exact and require a string', () => {
  for (const issuer of ['https://api.workos.com', 'https://api.workos.com/',
    'https://api.workos.com/user_management/client_environment',
    'https://api.workos.com/user_management/client_ENV123/']) assert.equal(validWorkOSIssuer(issuer), true);
  for (const issuer of [undefined, null, {}, ['https://api.workos.com/user_management/client_env'],
    'http://api.workos.com', 'https://api.workos.com.evil.test',
    'https://api.workos.com/user_management/client_env?x=1',
    'https://api.workos.com/user_management/client_env\n',
    'https://api.workos.com/user_management/client_env\r',
    'https://api.workos.com/user_management/client_env\r\n']) assert.equal(validWorkOSIssuer(issuer), false);
});

test('session diagnostics contain only booleans, never token claims or identity', t => {
  const log = t.mock.method(console, 'error', () => {});
  const accessToken = `header.${Buffer.from(JSON.stringify({ iss: 'private-issuer', sub: 'private-user',
    sid: 'private-session', client_id: 'private-client', exp: 100 })).toString('base64url')}.secret-signature`;
  logSessionRejection({ authenticated: true, user: { emailVerified: true }, accessToken },
    { userId: 'private-user', sessionId: 'private-session' }, 'private-client', 0);
  logSessionRejection({ authenticated: false }, {}, 'private-client', 0);
  assert.equal(log.mock.callCount(), 2);
  for (const { arguments: [message, details] } of log.mock.calls) {
    assert.equal(message, 'Authentication session rejected');
    assert.ok(Object.values(details).every(value => typeof value === 'boolean'));
    assert.doesNotMatch(JSON.stringify(details), /private|secret|header/);
  }
  assert.equal(log.mock.calls[0].arguments[1].issuerValid, false);
  assert.equal(log.mock.calls[0].arguments[1].clientMatches, true);
});
