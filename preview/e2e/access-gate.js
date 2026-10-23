async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const origin = 'http://127.0.0.1:5180';
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  await page.context().clearCookies(); // This journey starts at the anonymous access gate.
  await page.goto(origin, { waitUntil: 'commit' });
  await page.getByRole('link', { name: 'Continue with GitHub' }).waitFor({ state: 'visible' });
  check(await page.locator('#access-email').isVisible(), 'Anonymous players can sign in with email');
  // Joining is a waitlist, said up front: signing in is step one, and an invitation code is explained.
  check(await page.locator('#access-journey').isVisible() && await page.locator('#access-journey li[aria-current="step"]').getAttribute('data-step') === 'sign-in',
    'Signed out, the steps show that signing in is how you join the waitlist');
  check((await page.locator('#access-invite-help').textContent()).includes('skips the waitlist') && await page.locator('#access-invite-redeem').isDisabled(),
    'The invitation code is explained and needs a sign-in first');
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
  // Coming back from a sign-in redirect is a login, not a first visit: the tab opens on the
  // splash in the visitor's theme, never the dark sign-in art before the district.
  const redirectContext = await page.context().browser().newContext({ colorScheme: 'light' });
  try {
    const redirected = await redirectContext.newPage();
    let sessions = 0, releaseReturn; const returnHeld = new Promise(resolve => { releaseReturn = resolve; });
    await redirected.route('**/auth/session', async route => { if (sessions++) await returnHeld; return route.fulfill({ json: { authenticated: false } }); });
    await redirected.route('**/auth/login?provider=github', route => route.fulfill({ status: 302, headers: { location: `${origin}/` } }));
    await redirected.goto(origin, { waitUntil: 'commit' });
    await redirected.getByRole('link', { name: 'Continue with GitHub' }).click();
    await redirected.waitForFunction(() => 'returning' in document.documentElement.dataset);
    const back = await redirected.evaluate(() => ({ background: getComputedStyle(document.documentElement).backgroundColor, mark: sessionStorage.getItem('river-oaks-signing-in') }));
    check(back.background === 'rgb(233, 236, 229)' && back.mark === null && !await redirected.locator('.access-scene').isVisible(),
      `Returning from a sign-in redirect opens on the themed splash and uses its one-load mark (${JSON.stringify(back)})`);
    releaseReturn();
    await redirected.getByRole('link', { name: 'Continue with GitHub' }).waitFor({ state: 'visible' });
    check(await redirected.evaluate(() => !('returning' in document.documentElement.dataset)), 'A sign-in that did not complete shows the gate again');
  } finally { await redirectContext.close(); }
  await page.route('**/auth/session', route => route.fulfill({ json: {
    authenticated: true, user: { id: 'pending', name: 'Pending' }, csrfToken: 'fixture-csrf',
  } }));
  await page.route('**/api/waitlist/status', route => route.fulfill({ json: {
    status: 'pending', admin: false, user: { id: 'pending', name: 'Pending' }, username: 'rosy-heron-42', usernameBy: 'default', github: null,
    requestedAt: '2026-10-15T12:00:00.000Z', invited: false,
  } }));
  let named = null;
  await page.route('**/api/waitlist/username', route => {
    named = { body: route.request().postDataJSON(), csrf: route.request().headers()['x-csrf-token'] };
    return named.body.username === 'taken-name' ? route.fulfill({ status: 409, json: { error: 'username_taken' } })
      : route.fulfill({ json: { userId: 'pending', username: named.body.username, usernameBy: 'self' } });
  });
  await page.reload({ waitUntil: 'commit' });
  await page.locator('#access-title').getByText('You’re on the waitlist').waitFor({ state: 'visible' });
  const waiting = await page.locator('#access-message').textContent();
  // The join date in the browser's own locale and time zone, as the gate writes it.
  const joined = await page.evaluate(() => new Date('2026-10-15T12:00:00.000Z').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }));
  check(waiting.includes('You’re signed in') && waiting.includes('your place on the waitlist is saved') && waiting.includes(joined),
    `Waiting players are told they are signed in and their place is saved since the day they joined (${waiting})`);
  const next = await page.locator('#access-waiting').textContent();
  check(await page.locator('#access-waiting').isVisible() && next.includes('Waiting for approval') && next.includes('You don’t need to sign in again') && next.includes('opens by itself'),
    'A waiting card says what happens next: no need to sign in again, and the page opens itself');
  check(await page.locator('#access-journey li[aria-current="step"]').getAttribute('data-step') === 'wait'
    && await page.locator('#access-journey li[data-step="sign-in"]').getAttribute('data-done') === ''
    && await page.locator('#access-journey li[data-step="enter"]').getAttribute('data-done') === null, 'The steps show signing in done and waiting for approval current');
  check((await page.locator('#access-invite-help').textContent()).includes('expire 30 days'), 'Waiting players read what an invitation code does and how long it lasts');
  // A waiting player sees the name they will be known by, and may change it.
  check(await page.locator('#access-username').inputValue() === 'rosy-heron-42' && await page.locator('#access-username-github').isHidden(), 'Waiting players see their username; email sign-ins get a generated one');
  check(await page.locator('#access-username-save').isDisabled() && (await page.locator('#access-username-save').textContent()) === 'Saved', 'The kept name reads as saved');
  await page.locator('#access-username').fill('taken-name');
  check(await page.locator('#access-username-save').isEnabled() && (await page.locator('#access-username-save').textContent()) === 'Save', 'A changed name asks to be saved');
  await page.locator('#access-username-save').click();
  await page.locator('#access-username-status').getByText('Someone already has that name. Try another.').waitFor();
  check(true, 'A name someone already holds is refused with a clear reason');
  await page.locator('#access-username').fill('night-owl'); await page.locator('#access-username-save').click();
  await page.locator('#access-username-status').getByText('Saved. You’ll be known as night-owl.').waitFor();
  check((await page.locator('#access-username-save').textContent()) === 'Saved', 'Saving returns the button to Saved');
  check(named?.body.username === 'night-owl' && named.body.userId === undefined && named.csrf === 'fixture-csrf', 'Waiting players save their own username with CSRF protection');
  await page.locator('#access-username-suggest').click();
  check(/^[a-z]+-[a-z]+-\d\d$/.test(await page.locator('#access-username').inputValue()), 'Suggest another offers a generated name');
  check(await page.locator('#access-invite-redeem').isEnabled(), 'Pending players can redeem an invitation');
  check(!await page.locator('.app-shell').isVisible() && !await page.locator('#canvas-host canvas').count(), 'Signed-in pending players cannot start either play mode');
  check(await page.locator('#access-gate-signout').isVisible(), 'Pending players can sign out');
  // A failed check after waiting, and a refused request, each show their own state.
  const otherContext = await page.context().browser().newContext();
  try {
    const other = await otherContext.newPage();
    await other.route('**/auth/session', route => route.fulfill({ json: { authenticated: true, user: { id: 'other', name: 'Other' }, csrfToken: 'other-csrf' } }));
    let state = 'pending';
    await other.route('**/api/waitlist/status', route => state === 'failing' ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
      : route.fulfill({ json: { status: state, admin: false, user: { id: 'other', name: 'Other' }, username: 'other-one', usernameBy: 'default', github: null, requestedAt: '2026-10-15T12:00:00.000Z', invited: false } }));
    await other.goto(origin, { waitUntil: 'commit' });
    await other.locator('#access-title').getByText('You’re on the waitlist').waitFor({ state: 'visible' });
    state = 'failing';
    await other.locator('#access-message').getByText('Access could not be checked. Try again shortly.').waitFor({ state: 'visible', timeout: 25_000 });
    check(await other.locator('#access-title').textContent() === 'Welcome to the district' && await other.locator('#access-username-form').isHidden()
      && await other.locator('#access-journey').isHidden() && await other.locator('#access-waiting').isHidden(), 'A failed re-check drops the waiting title, steps, card and username form');
    state = 'rejected';
    await other.reload({ waitUntil: 'commit' });
    await other.locator('#access-title').getByText('Your request wasn’t approved').waitFor({ state: 'visible' });
    check(await other.locator('#access-kicker').isHidden() && await other.locator('#access-journey').isHidden() && await other.locator('#access-invite-form').isHidden(),
      'A refused request shows its own title, without the steps, the kicker or the code field');
    check(await other.locator('#access-waiting').isHidden(), 'A refused request shows no waiting card');
  } finally { await otherContext.close(); }
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
    let releaseMain; const mainHeld = new Promise(resolve => { releaseMain = resolve; });
    await admin.route('**/src/main.js*', async route => { await mainHeld; return route.fulfill({ contentType: 'text/javascript', body: "import { setupThemeControls } from './theme.js'; import { setupSidebar, setupSidebarSections } from './sidebar.js'; import { createCommunityPanel } from './community-ui.js'; setupThemeControls(); createCommunityPanel({ host: document.querySelector('.panel-scroll') }); setupSidebarSections({ sidebar: setupSidebar() }); document.querySelector('#loading').hidden = true;" }); });
    await admin.goto(origin, { waitUntil: 'commit' });
    // While the game loads, a quiet splash in the visitor's theme covers the sign-in card.
    await admin.locator('#access-message', { hasText: 'Opening the district' }).waitFor();
    check(await admin.evaluate(() => 'returning' in document.documentElement.dataset) && !await admin.locator('#access-title').isVisible(),
      'Entering the district shows the themed splash, not the sign-in card, while the game loads');
    releaseMain();
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
