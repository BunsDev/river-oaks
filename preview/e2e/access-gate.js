async page => {
  const origin = 'http://127.0.0.1:5180';
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  await page.goto(origin, { waitUntil: 'commit' });
  await page.getByRole('link', { name: 'Continue with Google' }).waitFor({ state: 'visible' });
  check(await page.getByRole('link', { name: 'Continue with GitHub' }).isVisible(), 'Anonymous players see only Google and GitHub sign-in');
  check(!await page.locator('.app-shell').isVisible() && !await page.locator('#canvas-host canvas').count(), 'Anonymous players cannot start either play mode');
  await page.route('**/auth/session', route => route.fulfill({ json: {
    authenticated: true, user: { id: 'pending', name: 'Pending' }, csrfToken: 'fixture-csrf',
  } }));
  await page.route('**/api/waitlist/status', route => route.fulfill({ json: {
    status: 'pending', admin: false, user: { id: 'pending', name: 'Pending' },
  } }));
  await page.reload({ waitUntil: 'commit' });
  await page.getByText('Your waitlist request is in.').waitFor({ state: 'visible' });
  check(!await page.locator('.app-shell').isVisible() && !await page.locator('#canvas-host canvas').count(), 'Signed-in pending players cannot start either play mode');
  check(await page.locator('#access-gate-signout').isVisible(), 'Pending players can sign out');
  const adminContext = await page.context().browser().newContext();
  try {
    const admin = await adminContext.newPage();
    let decision = null;
    await admin.route('**/auth/session', route => route.fulfill({ json: {
      authenticated: true, user: { id: 'admin', name: 'Approver' }, csrfToken: 'admin-csrf',
    } }));
    await admin.route('**/api/waitlist/status', route => route.fulfill({ json: {
      status: 'approved', admin: true, user: { id: 'admin', name: 'Approver' },
    } }));
    await admin.route('**/api/waitlist/requests', route => route.fulfill({ json: { requests: [
      { userId: 'new-user', name: 'New Resident', status: 'pending' },
      { userId: 'existing-user', name: 'Approved Resident', status: 'approved' },
      { userId: 'declined-user', name: 'Declined Resident', status: 'rejected' },
    ] } }));
    await admin.route('**/api/waitlist/decision', route => {
      decision = { body: route.request().postDataJSON(), csrf: route.request().headers()['x-csrf-token'] };
      return route.fulfill({ json: { userId: decision.body.userId, status: 'rejected' } });
    });
    await admin.route('**/src/main.js*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await admin.goto(origin, { waitUntil: 'commit' });
    await admin.getByRole('button', { name: 'Waitlist requests' }).click();
    check(await admin.locator('#access-review-title').evaluate(node => node === document.activeElement), 'Waitlist review opens with keyboard focus in its dialog');
    await admin.locator('.access-request').first().waitFor({ state: 'visible' });
    check(await admin.locator('.access-request').count() === 3, 'Approvers can review pending and decided accounts');
    const saved = admin.waitForResponse('**/api/waitlist/decision');
    await admin.locator('.access-request').filter({ hasText: 'Approved Resident' }).getByRole('button', { name: 'Revoke' }).click();
    await saved;
    check(decision?.body.userId === 'existing-user' && decision.body.approved === false && decision.csrf === 'admin-csrf', 'Approvers can revoke a prior approval with CSRF protection');
    const reconsider = admin.locator('.access-request').filter({ hasText: 'Declined Resident' }).getByRole('button', { name: 'Approve' });
    await reconsider.waitFor({ state: 'visible' });
    check(await reconsider.count() === 1, 'Approvers can reconsider a declined request');
    await admin.keyboard.press('Escape');
    check(await admin.locator('#access-admin').evaluate(node => node === document.activeElement && !node.closest('.app-shell').inert), 'Escape returns focus to the game controls');
  } finally { await adminContext.close(); }
  return { passed: true, checks };
}
