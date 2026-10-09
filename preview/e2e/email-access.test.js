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
    for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${origin}/play`);
      await page.locator('#access-email').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#access-invite-redeem').isDisabled(), true);
      assert.equal(await page.evaluate(() => {
        const luminance = value => {
          const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
            v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
          });
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        return ['#access-email', '#access-invite-code'].every(selector => {
          const style = getComputedStyle(document.querySelector(selector));
          const border = luminance(style.borderTopColor), fill = luminance(style.backgroundColor);
          return (Math.max(border, fill) + .05) / (Math.min(border, fill) + .05) >= 3;
        });
      }), true, 'input boundaries remain distinguishable against dark fields');
      await page.locator('.access-github').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#access-email').evaluate(node => node === document.activeElement), true);
      assert.equal(await page.locator('#access-email').evaluate(node => {
        const style = getComputedStyle(node);
        return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
      }), true, 'keyboard focus is visible on the email field');

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => {
        const box=selector=>document.querySelector(selector).getBoundingClientRect();
        const brand=box('.access-brand'), story=box('.access-scene-text'), card=box('.access-card'), footer=box('.access-footer');
        return brand.bottom<=story.top && card.bottom<=footer.top;
      }), true, 'the brand never overlaps the headline, nor the sign-in form its footer, on short screens');
      if (width >= 860) assert.equal(await page.evaluate(() => {
        const panel=document.querySelector('.access-panel');
        return panel.scrollHeight<=panel.clientHeight && document.querySelector('#access-gate').scrollHeight<=innerHeight;
      }), true, 'beside the artwork, the whole sign-in column fits a laptop screen without scrolling');
      await mkdir('output/playwright', { recursive: true });
      await page.screenshot({ path: `output/playwright/login-${width}.png`, fullPage: true });
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
    await page.evaluate(() => {
      const gate = document.querySelector('#access-gate');
      new MutationObserver((_, observer) => {
        if (!gate.hidden) return;
        window.__styledWhenGateLifted = getComputedStyle(document.querySelector('.app-shell')).getPropertyValue('--panel-width').trim() !== '';
        observer.disconnect();
      }).observe(gate, { attributes: true, attributeFilter: ['hidden'] });
    });
    await page.locator('#access-invite-redeem').click();
    await page.locator('#access-gate').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__styledWhenGateLifted), true, 'the game is styled before the sign-in gate lifts, never shown as raw HTML');
    assert.equal((await post('/api/multiplayer/ticket', {})).status(), 200);
    assert.equal((await request.get(`${origin}/data/district.json`)).status(), 200);
    assert.equal((await post('/api/waitlist/invite-redeem', { code: invite.code })).status(), 400);
    const invitations = await (await request.get(`${origin}/api/waitlist/invites`)).json();
    assert.equal(invitations.invites.length, 2);
    // Admission and town connection are separate gates. Wait for the real
    // connected roster before interacting with the previously inert app.
    await page.locator('.multiplayer-roster[data-connected="true"]').waitFor({ state: 'attached' });
    await page.locator('.multiplayer-gate').waitFor({ state: 'hidden' });
    await page.locator('.app-shell:not([inert])').waitFor({ state: 'visible' });
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
    console.error('Access gate state:', await page.evaluate(() => ({
      connectionMessage: document.querySelector('#multiplayer-status')?.textContent,
      connectionHidden: document.querySelector('.multiplayer-gate')?.hidden,
      appInert: document.querySelector('.app-shell')?.inert,
      playerReady: document.querySelector('#canvas-host')?.dataset.playerReady,
    })).catch(() => ({ unavailable: true })));
    await mkdir('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/security-access-failure.png', timeout: 5000 }).catch(() => {});
    throw error;
  }
});
