async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const origin = 'http://127.0.0.1:5180';
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  await page.context().clearCookies(); // This journey starts at the anonymous access gate.
  await page.goto(origin, { waitUntil: 'commit' });
  await page.getByRole('link', { name: 'Continue with GitHub' }).waitFor({ state: 'visible' });
  check(await page.locator('#access-email').isVisible(), 'Anonymous players can sign in with email');
  check(!await page.getByRole('link', { name: 'Continue with Google' }).count(), 'Anonymous players see only supported sign-in methods');
  check(!await page.locator('.app-shell').isVisible() && !await page.locator('#canvas-host canvas').count(), 'Anonymous players cannot start either play mode');
  check(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor) === 'rgb(21, 21, 23)', 'The first paint is the sign-in gate colour, not a white page');
  // A browser that entered last time opens on a quiet splash in its own theme instead of
  // flashing the dark sign-in art; if the gate is needed after all, it appears and the visit is forgotten.
  const returningContext = await page.context().browser().newContext({ colorScheme: 'light' });
  try {
    const returning = await returningContext.newPage();
    await returning.addInitScript(() => localStorage.setItem('river-oaks-entered', '1'));
    let releaseSession; const sessionHeld = new Promise(resolve => { releaseSession = resolve; });
    await returning.route('**/auth/session', async route => { await sessionHeld; return route.fulfill({ json: { authenticated: false } }); });
    await returning.goto(origin, { waitUntil: 'commit' });
    await returning.locator('#access-message').waitFor({ state: 'visible' });
    const splash = await returning.evaluate(() => ({ returning: 'returning' in document.documentElement.dataset, theme: document.documentElement.dataset.theme, background: getComputedStyle(document.documentElement).backgroundColor }));
    check(splash.returning && splash.theme === 'light' && splash.background === 'rgb(233, 236, 229)', `A returning visitor opens on a splash in their own theme (${JSON.stringify(splash)})`);
    check(!await returning.locator('.access-scene').isVisible() && !await returning.locator('#access-title').isVisible(), 'The splash hides the sign-in art and card but keeps the access status readable');
    releaseSession();
    await returning.getByRole('link', { name: 'Continue with GitHub' }).waitFor({ state: 'visible' });
    check(await returning.evaluate(() => !('returning' in document.documentElement.dataset) && localStorage.getItem('river-oaks-entered') === null), 'When sign-in is needed the gate appears and the visit is forgotten');
  } finally { await returningContext.close(); }
  await page.route('**/auth/session', route => route.fulfill({ json: {
    authenticated: true, user: { id: 'pending', name: 'Pending' }, csrfToken: 'fixture-csrf',
  } }));
  await page.route('**/api/waitlist/status', route => route.fulfill({ json: {
    status: 'pending', admin: false, user: { id: 'pending', name: 'Pending' }, username: 'rosy-heron-42', usernameBy: 'default', github: null,
  } }));
  let named = null;
  await page.route('**/api/waitlist/username', route => {
    named = { body: route.request().postDataJSON(), csrf: route.request().headers()['x-csrf-token'] };
    return named.body.username === 'taken-name' ? route.fulfill({ status: 409, json: { error: 'username_taken' } })
      : route.fulfill({ json: { userId: 'pending', username: named.body.username, usernameBy: 'self' } });
  });
  await page.reload({ waitUntil: 'commit' });
  await page.getByText('You’re on the waitlist. An admin can approve you, or you can redeem an invite below.').waitFor({ state: 'visible' });
  // A waiting player sees the name they will be known by, and may change it.
  check(await page.locator('#access-username').inputValue() === 'rosy-heron-42' && await page.locator('#access-username-github').isHidden(), 'Waiting players see their username; email sign-ins get a generated one');
  await page.locator('#access-username').fill('taken-name'); await page.locator('#access-username-save').click();
  await page.locator('#access-username-status').getByText('Someone already has that name. Try another.').waitFor();
  check(true, 'A name someone already holds is refused with a clear reason');
  await page.locator('#access-username').fill('night-owl'); await page.locator('#access-username-save').click();
  await page.locator('#access-username-status').getByText('Saved. You’ll be known as night-owl.').waitFor();
  check(named?.body.username === 'night-owl' && named.body.userId === undefined && named.csrf === 'fixture-csrf', 'Waiting players save their own username with CSRF protection');
  await page.locator('#access-username-suggest').click();
  check(/^[a-z]+-[a-z]+-\d\d$/.test(await page.locator('#access-username').inputValue()), 'Suggest another offers a generated name');
  check(await page.locator('#access-invite-redeem').isEnabled(), 'Pending players can redeem an invitation');
  check(!await page.locator('.app-shell').isVisible() && !await page.locator('#canvas-host canvas').count(), 'Signed-in pending players cannot start either play mode');
  check(await page.locator('#access-gate-signout').isVisible(), 'Pending players can sign out');
  const adminContext = await page.context().browser().newContext();
  try {
    const admin = await adminContext.newPage();
    let decision = null;
    let holdRefresh = false, releaseRefresh;
    let refreshHeld;
    const refreshHeldPromise = new Promise(resolve => { refreshHeld = resolve; });
    await admin.route('**/auth/session', route => route.fulfill({ json: {
      authenticated: true, user: { id: 'admin', name: 'Approver' }, csrfToken: 'admin-csrf',
    } }));
    await admin.route('**/api/waitlist/status', route => route.fulfill({ json: {
      status: 'approved', admin: true, user: { id: 'admin', name: 'Approver' },
    } }));
    await admin.route('**/api/waitlist/requests', async route => {
      if (holdRefresh) { refreshHeld(); await new Promise(resolve => { releaseRefresh = resolve; }); }
      return route.fulfill({ json: { requests: [
      { userId: 'new-user', name: 'New Resident', status: 'pending', username: 'new-resident-11' },
      { userId: 'existing-user', name: 'Approved Resident', status: 'approved', username: 'approved-one' },
      { userId: 'declined-user', name: 'Declined Resident', status: 'rejected', username: 'declined-one' },
    ] } });
    });
    let renamed = null;
    await admin.route('**/api/waitlist/username', route => {
      renamed = { body: route.request().postDataJSON(), csrf: route.request().headers()['x-csrf-token'] };
      return route.fulfill({ json: { userId: renamed.body.userId, username: renamed.body.username, usernameBy: 'admin' } });
    });
    await admin.route('**/api/waitlist/decision', route => {
      decision = { body: route.request().postDataJSON(), csrf: route.request().headers()['x-csrf-token'] };
      return route.fulfill({ json: { userId: decision.body.userId, status: 'rejected' } });
    });
    await admin.route('**/src/main.js*', route => route.fulfill({ contentType: 'text/javascript', body: "import { setupThemeControls } from './theme.js'; import { setupSidebar, setupSidebarSections } from './sidebar.js'; import { createCommunityPanel } from './community-ui.js'; setupThemeControls(); createCommunityPanel({ host: document.querySelector('.panel-scroll') }); setupSidebarSections({ sidebar: setupSidebar() }); document.querySelector('#loading').hidden = true;" }));
    await admin.goto(origin, { waitUntil: 'commit' });
    // Match the real HUD layout while omitting the world renderer.
    for (const sheet of ['style', 'playground-theme', 'district-theme', 'immersive', 'sidebar', 'visual-finish', 'retro-finish', 'rail-navigation', 'hud-glass', 'game-hud']) {
      await admin.addStyleTag({ url: `${origin}/src/${sheet}.css` });
    }
    await openHudSpace(admin, 'settings-section', 'Account');
    check(await admin.evaluate(() => localStorage.getItem('river-oaks-entered') === '1' && !('returning' in document.documentElement.dataset)), 'Entering the district remembers the visit for a quiet next load');
    await admin.getByRole('button', { name: 'Waitlist requests' }).click();
    check(!await admin.locator('#settings-dialog').evaluate(node => node.open), 'Waitlist review closes Settings before taking focus');
    check(await admin.locator('#access-review-title').evaluate(node => node === document.activeElement), 'Waitlist review opens with keyboard focus in its dialog');
    await admin.locator('.access-request').first().waitFor({ state: 'visible' });
    check(await admin.locator('.access-request').count() === 3, 'Approvers can review pending and decided accounts');
    await admin.locator('#access-review-title').click();
    check(await admin.locator('#access-review').isVisible(), 'Clicking inside approvals keeps it open');
    const heading = await admin.locator('#access-review-title').boundingBox();
    await admin.mouse.move(heading.x + 10, heading.y + 10);
    await admin.mouse.down(); await admin.mouse.move(5, 5); await admin.mouse.up();
    check(await admin.locator('#access-review').isVisible(), 'Dragging from approvals onto the backdrop keeps it open');
    await admin.mouse.click(5, 5);
    check(!await admin.locator('#access-review').isVisible(), 'Clicking outside approvals closes it');
    check(await admin.locator('#settings-dialog').evaluate(node => node.open), 'Outside dismissal restores Account settings');
    check(await admin.locator('#access-admin').evaluate(node => node === document.activeElement && !node.closest('.app-shell').inert), 'Outside dismissal restores focus and releases the game');
    await admin.getByRole('button', { name: 'Waitlist requests' }).click();
    await admin.locator('.access-request').first().waitFor({ state: 'visible' });
    check(!await admin.locator('#access-review-list').getByText('new-user').count(), 'User IDs are hidden from the waitlist by default');
    const firstRequest = admin.locator('.access-request').first();
    await firstRequest.getByRole('button', { name: 'Reveal user ID for New Resident' }).click();
    check(await firstRequest.getByText('new-user').isVisible(), 'Approvers can reveal a user ID');
    await firstRequest.getByRole('button', { name: 'Hide user ID for New Resident' }).click();
    check(!await firstRequest.getByText('new-user').count(), 'Approvers can hide the user ID again');
    await adminContext.grantPermissions(['clipboard-read', 'clipboard-write']);
    await firstRequest.getByRole('button', { name: 'Copy user ID for New Resident' }).click();
    check(await admin.evaluate(() => navigator.clipboard.readText()) === 'new-user', 'Approvers can copy a hidden user ID');
    check(!await firstRequest.getByText('new-user').count(), 'Copying does not reveal the user ID');
    const saved = admin.waitForResponse('**/api/waitlist/decision');
    const revokeRefresh = admin.waitForResponse('**/api/waitlist/requests');
    await admin.locator('.access-request').filter({ hasText: 'Approved Resident' }).getByRole('button', { name: 'Revoke' }).click();
    await saved;
    await revokeRefresh;
    check(decision?.body.userId === 'existing-user' && decision.body.approved === false && decision.csrf === 'admin-csrf', 'Approvers can revoke a prior approval with CSRF protection');
    // The approver sees each username, may change it before approving, and an approved name is fixed.
    const pendingRow = admin.locator('.access-request').filter({ hasText: 'New Resident' });
    check(await pendingRow.getByRole('textbox', { name: 'Username for New Resident' }).inputValue() === 'new-resident-11'
      && await admin.locator('.access-request').filter({ hasText: 'Approved Resident' }).locator('.access-request-username').evaluate(input => input.readOnly), 'Approvers see each username; an approved one is fixed');
    await pendingRow.getByRole('textbox', { name: 'Username for New Resident' }).fill('fresh-name');
    await pendingRow.getByRole('button', { name: 'Save username for New Resident' }).click();
    await admin.locator('#access-review-status').getByText('New Resident will be known as fresh-name.').waitFor();
    check(renamed?.body.userId === 'new-user' && renamed.body.username === 'fresh-name' && renamed.csrf === 'admin-csrf', 'Approvers rename a waiting resident with CSRF protection');
    check(decision?.body.username === undefined, 'Revoking an approval sends no username');
    await admin.locator('.access-request').filter({ hasText: 'Declined Resident' }).getByRole('textbox').fill('second-try');
    const reconsider = admin.locator('.access-request').filter({ hasText: 'Declined Resident' }).getByRole('button', { name: 'Approve' });
    const reapproved = admin.waitForResponse('**/api/waitlist/decision');
    const finalRefresh = admin.waitForResponse('**/api/waitlist/requests');
    holdRefresh = true;
    await reconsider.click();
    await reapproved;
    check(decision?.body.userId === 'declined-user' && decision.body.approved === true && decision.body.username === 'second-try' && decision.csrf === 'admin-csrf', 'Approvers can reconsider a declined request with an edited username');
    await refreshHeldPromise;
    await admin.mouse.click(5, 5);
    releaseRefresh();
    await finalRefresh;
    await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check(await admin.locator('#settings-dialog').evaluate(node => node.open), 'Closing waitlist review restores Account settings');
    check(await admin.locator('#access-admin').evaluate(node => node === document.activeElement && !node.closest('.app-shell').inert && document.querySelector('#access-review').hidden), 'Outside dismissal stays closed after a late response and returns focus to the game controls');
    holdRefresh = false;
    await admin.getByRole('button', { name: 'Waitlist requests' }).click();
    await admin.locator('.access-request').first().waitFor({ state: 'visible' });
    await admin.keyboard.press('Escape');
    check(!await admin.locator('#access-review').isVisible(), 'Escape still dismisses approvals');
    await admin.locator('#settings-title').click();
    check(await admin.locator('#settings-dialog').evaluate(node => node.open), 'Clicking inside Settings keeps it open');
    await admin.mouse.click(5, 5);
    check(!await admin.locator('#settings-dialog').evaluate(node => node.open), 'Clicking outside Settings closes its native dialog');
    check(await admin.locator('#settings-toggle').evaluate(node => node === document.activeElement), 'Closing Settings from its backdrop restores launcher focus');
  } finally { await adminContext.close(); }
  return { passed: true, checks };
}
