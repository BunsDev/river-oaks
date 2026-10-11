async page => {
  // #220 draft-only journey in the real app (RIVER_OAKS_WORKPLACE=1, VITE_WORKPLACE=true):
  // name a companion, defer then accept the offer, grant, brief by keyboard,
  // pause/resume, disconnect mid-task, review the private draft, and prove a
  // second account sees and fetches nothing. Nothing is published.
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const origin = 'http://127.0.0.1:5173';
  const published = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/events')) published.push(request.url()); });
  const openPeople = async tab => {
    await tab.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
    // The People launcher opens the roster, where Groups and the companion live.
    if (await tab.locator('#people-toggle').getAttribute('aria-expanded') !== 'true') await tab.locator('#people-toggle').click();
    const section = tab.locator('section.workplace');
    await section.waitFor();await section.scrollIntoViewIfNeeded();
    if (!await section.isVisible()) throw new Error(`The companion panel is not visible: ${await tab.evaluate(() => { const node = document.querySelector('section.workplace');return [...Array(6)].map((_, i) => { let n = node;for (let k = 0; k < i; k++) n = n?.parentElement;return n ? `${n.tagName}.${n.className}#${n.id}:${getComputedStyle(n).display}/${n.hidden}` : ''; }).join(' < '); })}`);
    return section;
  };
  await page.context().addCookies([{ name: 'fixture_session', value: 'alice', url: origin }]);
  await page.goto(origin);
  let panel = await openPeople(page);
  const status = panel.locator('.workplace-status');
  await panel.getByRole('textbox', { name: 'Name your companion' }).fill('Pip');
  await panel.getByRole('button', { name: 'Bring a companion' }).click();
  await panel.getByText('Pip', { exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Not tonight' }).click();
  await panel.getByText('Not tonight. The offer stays open').waitFor();
  check(await panel.getByRole('button', { name: 'Allow drafting for 7 days' }).isVisible(), 'Deferring the offer takes nothing away');
  await panel.getByRole('button', { name: 'Help with a plan' }).click();
  await panel.getByText('Cannot: publish, invite, message anyone or spend money.').waitFor();
  check(!await panel.getByRole('textbox', { name: 'Purpose' }).isVisible(), 'No brief without permission');
  await panel.getByRole('button', { name: 'Allow drafting for 7 days' }).click();
  // Keyboard only from here: type the brief and submit with Enter.
  const purpose = panel.getByRole('textbox', { name: 'Purpose' });
  await purpose.waitFor({ timeout: 15000 }).catch(async () => { throw new Error(`No brief after granting: ${await status.textContent()} | ${await panel.textContent()}`); });
  await purpose.focus();
  await page.keyboard.type('A small welcome for Mina');
  await page.keyboard.press('Tab');await page.keyboard.type('Mina');
  await page.keyboard.press('Enter');
  await status.filter({ hasText: 'started a draft' }).waitFor();
  check(await panel.getByRole('button', { name: 'Pause' }).isVisible(), 'A running draft can be paused');
  await panel.getByRole('button', { name: 'Pause' }).click();
  await panel.getByText('Paused. Nothing is happening until you resume.').waitFor();
  await page.waitForTimeout(3500);
  check(await panel.getByText('Paused. Nothing is happening until you resume.').isVisible(), 'A paused draft stays paused');
  await panel.getByRole('button', { name: 'Resume' }).click();
  // Leave mid-task: the work runs on the service, not in this tab.
  await page.reload();
  panel = await openPeople(page);
  await panel.getByText('Finished. The draft is saved below.').waitFor({ timeout: 45000 });
  const open = panel.getByRole('button', { name: /^Open Gathering plan/ });
  await open.focus();await page.keyboard.press('Enter');
  const plan = panel.locator('.workplace-plan');
  await plan.getByText('Draft only. Nothing has been published').waitFor();
  check(await plan.evaluate(node => node === document.activeElement), 'Opening a draft moves focus to it');
  check((await plan.textContent()).includes('This plan does not invite anyone.'), 'The plan names what still needs a human decision');
  check(await plan.locator('script, iframe, a[href]').count() === 0, 'The draft renders as inert text');
  const artifactId = await page.evaluate(async () => {
    const session = await (await fetch('/auth/session')).json();
    const state = await (await fetch('/api/workplace/state', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: '{}' })).json();
    return state.state.artifacts[0].id;
  });
  // A second account: no companion, no draft text, no access by id.
  const otherContext = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    await otherContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
    const other = await otherContext.newPage();
    await other.goto(origin);
    const otherPanel = await openPeople(other);
    await otherPanel.getByRole('button', { name: 'Bring a companion' }).waitFor();
    check(!(await other.locator('body').textContent()).includes('A small welcome for Mina'), "Another account never sees the owner's brief");
    const denied = await other.evaluate(async id => {
      const session = await (await fetch('/auth/session')).json();
      return (await fetch('/api/workplace/artifact', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ artifactId: id }) })).status;
    }, artifactId);
    check(denied === 404, 'Another account cannot fetch the draft by id');
  } finally { await otherContext.close(); }
  await panel.getByRole('button', { name: 'Revoke permission' }).click();
  await status.filter({ hasText: 'Permission revoked' }).waitFor();
  check(!await panel.getByRole('textbox', { name: 'Purpose' }).isVisible(), 'Revoking permission removes the brief');
  await panel.getByRole('button', { name: /^Delete Gathering plan/ }).click();
  await status.filter({ hasText: 'Draft deleted.' }).waitFor();
  check(!(await panel.textContent()).includes('Plan ready for your review'), 'A deleted draft is not presented as waiting for review');
  check(published.length === 0, 'Nothing calls the events service');
  await page.screenshot({ path: 'output/playwright/workplace-panel.png' });
  return { checks };
}
