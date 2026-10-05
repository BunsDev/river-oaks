import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { generateKeyPairSync, sign } from 'node:crypto';
import { WorkOS } from '@workos-inc/node';

const trusted = generateKeyPairSync('rsa', { modulusLength: 2048 });
const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

export const boundaryCases = [
  { name: 'trusted environment issuer', issuer: 'https://api.workos.com/user_management/client_environment', status: 302 },
  { name: 'documented base issuer', issuer: 'https://api.workos.com', status: 302 },
  { name: 'documented base issuer with slash', issuer: 'https://api.workos.com/', status: 302 },
  { name: 'foreign signature with correct client claim and valid foreign issuer',
    issuer: 'https://api.workos.com/user_management/client_foreign', foreignKey: true, status: 403 },
  { name: 'trusted signature with wrong application', issuer: 'https://api.workos.com', clientId: 'client_other', status: 403 },
  { name: 'trusted signature with wrong issuer host', issuer: 'https://attacker.example', status: 403 },
];

// Only the remote WorkOS service is simulated. SDK HTTP exchange, JWKS URL
// selection/fetch, PKCE, sealing, unsealing and JWT verification are unchanged.
export async function workosSdkFixture(t, config, scenario) {
  const requests = [];
  const payload = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'same-kid' })}.${encode({
    iss: scenario.issuer, client_id: scenario.clientId ?? config.clientId,
    sub: 'user_sdk', sid: 'session_sdk', exp: Math.floor(Date.now() / 1000) + 300,
  })}`;
  const accessToken = `${payload}.${sign('RSA-SHA256', Buffer.from(payload),
    (scenario.foreignKey ? foreign : trusted).privateKey).toString('base64url')}`;
  const server = createServer(async (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url === `/sso/jwks/${config.clientId}`) {
      res.end(JSON.stringify({ keys: [{ ...trusted.publicKey.export({ format: 'jwk' }), kid: 'same-kid', alg: 'RS256', use: 'sig' }] }));
    } else if (req.method === 'POST' && req.url === '/user_management/authenticate') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      assert.equal(body.client_id, config.clientId);
      assert.equal(body.grant_type, 'authorization_code');
      assert.ok(body.code_verifier.length >= 43);
      res.end(JSON.stringify({ user: { object: 'user', id: 'user_sdk', email: 'private@example.com',
        email_verified: true, first_name: 'Val', last_name: null, profile_picture_url: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      access_token: accessToken, refresh_token: 'private-refresh', authentication_method: 'GitHubOAuth' }));
    } else if (req.method === 'GET' && req.url === '/user_management/users/user_sdk/identities') {
      res.end(JSON.stringify([{ idp_id: '3003', type: 'OAuth', provider: 'GitHubOAuth' }]));
    } else { res.writeHead(404); res.end('{}'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const sdk = new WorkOS(config.apiKey, { clientId: config.clientId, apiHostname: '127.0.0.1',
    https: false, port: server.address().port, maxRetries: 0, timeout: 1000 });
  return { sdk, requests };
}
