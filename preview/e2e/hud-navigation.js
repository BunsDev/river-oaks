// Real launcher interactions shared by the existing page-function journeys.
export async function openHudSpace(page, section, category = 'Appearance') {
  if (await page.locator('#settings-dialog[open]').count()) await page.locator('#settings-dialog .settings-header button').click();
  const ids = { 'community-section': '#people-toggle', 'explore-section': '#panel-toggle', 'settings-section': '#settings-toggle' };
  const trigger = page.locator(ids[section]);
  if (section === 'settings-section') {
    await trigger.click();
    await page.getByRole('tab', { name: category, exact: true }).click();
  } else if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  // Legacy storefront journeys still exercise entry permissions and direct arrival.
  if (section === 'explore-section' && await page.locator('.storefront-access').count() && !await page.locator('.storefront-access').evaluate(el => el.open)) await page.locator('.storefront-access > summary').click();
}
