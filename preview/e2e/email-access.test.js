import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { workosSdkFixture } from '../../server/tests/workos-sdk-fixture.js';
import { createAuth } from '../../server/auth.js';
import { createFileWaitlist } from '../../server/waitlist.js';
import { createGameServer } from '../../server/app.js';
import { createSharedWorld } from '../../server/world.js';

// Actual browser, built access UI, SDK session verification, HTTP gate, and
// persisted invitations. Only the remote identity provider is a local fixture;
// no email is sent and no production accounts or services are touched.
test('email access: browser verification, invitation, member controls and revocation', { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'river-access-e2e-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let app;
  const edge = createServer((req, res) => app.server.emit('request', req, res));
  edge.on('upgrade', (req, socket, head) => app.server.emit('upgrade', req, socket, head));
  edge.listen(0, '127.0.0.1'); await once(edge, 'listening');
  t.after(() => { edge.closeAllConnections(); edge.close(); });
  const origin = `http://127.0.0.1:${edge.address().port}`;
  const config = { origin, apiKey: 'sk_test', clientId: 'client_test', cookiePassword: 'a'.repeat(32) };
  const { sdk } = await workosSdkFixture(t, config, { issuer: 'https://api.workos.com', authenticationMethod: 'MagicAuth' });
  const waitlist = await createFileWaitlist(join(directory, 'waitlist.json'), { admins: ['admin'] });
  const invite = await waitlist.issueInvite({ actorId: 'admin', ownerId: 'admin' });
  const world = createSharedWorld(JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url))));
  app = createGameServer({ auth: createAuth({ ...config, workos: sdk }), world, waitlist,
    origin, staticRoot: fileURLToPath(new URL('../../dist/preview', import.meta.url)), waitlistAdmins: ['admin'] });
  t.after(() => app.close());
  const software = process.env.RIVER_OAKS_SECURITY_SOFTWARE === '1';
  if (software && process.platform !== 'linux') throw new Error('Software security acceptance requires Linux with Xvfb and Mesa.');
  const browser = await chromium.launch({ headless: !software,
    args: software ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] : process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  t.after(() => browser.close());
  const context = await browser.newContext();
  await context.addInitScript(() => {
    // Use the shipped laptop graphics preference; never replace game modules or
    // bypass interaction assertions to make CPU-only acceptance pass.
    localStorage.setItem('river-oaks-graphics', 'smooth');
    window.__policyViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__policyViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
    });
  });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', error => console.error('Access browser error:', error.message));
  try {
    for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${origin}/play`);
      await page.locator('#access-email').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#access-invite-redeem').isDisabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    const request = context.request;
    assert.equal(await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__inlineScriptExecuted = true';
      document.body.append(script);
      return window.__inlineScriptExecuted;
    }), undefined, 'the served policy must block inline script injection');
    await page.waitForFunction(() => window.__policyViolations.some(v => v.blocked === 'inline'));
    await page.evaluate(() => { window.__policyViolations = []; });
    assert.equal((await request.get(`${origin}/data/district.json`)).status(), 403);
    await page.locator('#access-email').fill('private@example.com');
    await page.getByRole('button', { name: 'Email me a sign-in code', exact: true }).click();
    await page.locator('#access-email-code').waitFor({ state: 'visible' });
    await page.locator('#access-email-code').fill('123456');
    await page.getByRole('button', { name: 'Verify email', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#access-message').textContent.includes('You’re on the waitlist'));
    assert.equal(await page.locator('.app-shell').isVisible(), false);
    const session = await (await request.get(`${origin}/auth/session`)).json();
    const post = (path, data, csrf = session.csrfToken) => request.post(origin + path, {
      headers: { origin, 'x-csrf-token': csrf }, data,
    });
    assert.equal((await post('/api/multiplayer/ticket', {})).status(), 403);
    assert.equal((await post('/api/waitlist/invite-redeem', { code: invite.code }, 'forged')).status(), 403);
    assert.equal((await post('/api/waitlist/invite-issue', { ownerId: 'user_sdk' })).status(), 403);
    await page.setViewportSize({ width: 800, height: 600 });
    await page.locator('#access-invite-code').fill(invite.code);
    await page.locator('#access-invite-redeem').click();
    await page.locator('#access-gate').waitFor({ state: 'hidden' });
    assert.equal((await post('/api/multiplayer/ticket', {})).status(), 200);
    assert.equal((await request.get(`${origin}/data/district.json`)).status(), 200);
    assert.equal((await post('/api/waitlist/invite-redeem', { code: invite.code })).status(), 400);
    const invitations = await (await request.get(`${origin}/api/waitlist/invites`)).json();
    assert.equal(invitations.invites.length, 2);
    // The access gate hides before main.js initializes the sidebar. Wait for
    // its real state, then open it while the scene can still be initializing.
    await page.locator('#panel-toggle[aria-keyshortcuts]').waitFor({ state: 'visible' });
    if (await page.locator('#panel-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#panel-toggle').click();
    await page.locator('#access-invites-open').click();
    await page.locator('#access-invites[open]').waitFor();
    await page.locator('#canvas-host canvas').waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => window.__policyViolations), [], 'normal game modules must satisfy the script policy');
    assert.equal(await page.locator('#access-invite-issue').isVisible(), false);
    await page.keyboard.press('Escape');
    await page.locator('#access-invites').waitFor({ state: 'hidden' });
    await waitlist.decide({ userId: 'user_sdk', actorId: 'admin', approved: false });
    assert.equal((await post('/api/multiplayer/ticket', {})).status(), 403);
    assert.equal((await request.get(`${origin}/data/district.json`)).status(), 403);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#access-message').textContent.includes('has not been approved'));
    assert.equal(await page.locator('#access-invite-form').isVisible(), false);
  } catch (error) {
    await mkdir('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/security-access-failure.png', timeout: 5000 }).catch(() => {});
    throw error;
  }
});
