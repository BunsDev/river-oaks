// Run through the browser harness with a live Vite preview. All model/voice calls are mocked.
async (page) => {
  await page.unrouteAll({behavior:'ignoreErrors'});
  const check = (value, message) => { if (!value) throw new Error(message); };
  const errors = [], packets = [], screenshots = [];
  let reactionMode = 'ok', voiceMode = 'fail';
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/v1/decisions', async route => {
    const packet = route.request().postDataJSON(); packets.push(packet);
    const mode = reactionMode;
    if (mode === 'slow') await page.waitForTimeout(900);
    if (mode === 'fail') return route.fulfill({ status: 503, json: { error: 'Fixture unavailable' } });
    await route.fulfill({ json: { schema_version: 1, tick: packet.tick, latency_ms: 0,
      decisions: packet.agents.map(agent => ({ id: agent.id, action: 'greet', source: 'local_rules' })) } });
  });
  await page.route('**/v1/voice', async route => {
    if (voiceMode === 'slow') await page.waitForTimeout(900);
    await route.fulfill({ status: 503, json: { error: 'Fixture voice unavailable' } });
  });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
  const toggle = page.locator('#panel-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator('[data-section=community-section]').click();
  await page.locator('#community-more > summary').click();
  const meet = async id => {
    await page.locator('#community-local').selectOption(id);
    await page.locator('#community-meet').click();
    if (!await page.locator('#community-activities').evaluate(el => el.open)) await page.locator('#community-activities > summary').click();
  };
  const settled = () => page.waitForFunction(() => document.querySelector('.community-topics').getAttribute('aria-busy') === 'false');
  const resources = () => page.locator('.community-mission-resources dd').allTextContents();
  await meet('local-00');
  check(await page.locator('#community-dialogue').getAttribute('aria-modal') === 'false', 'World controls remain available during conversation');
  check(await page.locator('#community-supply').isDisabled(), 'Support starts gated');
  check((await page.locator('#community-supply-reason').textContent()).includes('Start'), 'Explain paused prerequisites');
  check((await resources())[0] === '12', 'Initial supply budget');
  await page.locator('#community-ask').click(); await settled();
  check(await page.locator('#community-ask').isHidden(), 'Known needs do not require repeated asking');
  check(await page.locator('#community-dialogue-run').evaluate(el => el === document.activeElement), 'Hiding Ask moves focus to the next action');
  check((await resources())[0] === '12', 'Asking is free');
  await page.locator('#community-dialogue-run').press('Enter');
  await page.locator('#community-supply').click();
  check((await resources())[0] === '10', 'One supply delivery costs exactly two kits');
  check(await page.locator('#community-supply').isDisabled(), 'Cooldown blocks repeat delivery');
  check(await page.locator('.community-support-card').evaluate(el => el === document.activeElement), 'Support action keeps focus within the dialog');
  check((await page.locator('#community-supply-reason').textContent()).includes('Next delivery'), 'Cooldown is explained');
  await page.waitForFunction(() => !document.querySelector('#community-supply').disabled);
  await page.locator('#community-supply').click();
  check((await resources())[0] === '8', 'Second delivery spends only two more kits');
  check(await page.locator('#community-support-status').textContent() === 'Resolved', 'Supply path resolves needs');
  check(await page.locator('#community-dispatch').isDisabled(), 'Resolved needs cannot spend visits');
  check((await page.locator('.community-mission-progress').textContent()).startsWith('1 / 6'), 'Mission progress reflects resolution');

  await page.locator('#community-run').click();
  const pausedTime = (await resources())[2];
  await page.waitForTimeout(1100);
  check((await resources())[2] === pausedTime, 'Paused simulation freezes the visible clock');
  check(await page.locator('#community-dialogue-run').textContent() === 'Resume scenario', 'Dialog offers resume');
  await page.locator('#community-dialogue-run').click();
  await meet('local-03'); await page.locator('#community-ask').click(); await settled();
  await page.locator('#community-dispatch').click();
  check((await resources())[1] === '3', 'Dispatch reserves one visit');
  check(await page.locator('#community-dispatch').isDisabled() && await page.locator('#community-supply').isDisabled(), 'Assigned visit prevents duplicate spending');
  check(await page.locator('#community-support-status').textContent() === 'Visit assigned', 'Assignment has an explicit status');
  await page.locator('#community-run').click();
  await page.locator('#community-reset').click();
  check((await resources()).join('|') === '12|4|60:00', 'Reset restores resources and clock');
  check(await page.locator('#community-ask').isVisible(), 'Reset clears known needs');

  await meet('local-07'); await page.locator('#community-ask').click(); await settled();
  check(await page.locator('#community-support-status').textContent() === 'No request', 'Comfortable residents do not imply a support need');
  reactionMode = 'slow';
  await page.locator('#community-about').click();
  check(await page.locator('#community-about').getAttribute('aria-pressed') === 'true', 'Selected topic is exposed');
  check(await page.locator('#community-district').getAttribute('aria-disabled') === 'true', 'Pending reaction blocks duplicate requests');
  check(await page.locator('#community-about').evaluate(el => el === document.activeElement), 'Pending topic retains keyboard focus');
  const requestsBeforeRepeat = packets.length;
  await page.locator('#community-about').press('Enter');
  check(packets.length === requestsBeforeRepeat, 'Busy topic cannot submit again');
  await settled();
  reactionMode = 'fail';
  await page.locator('#community-district').click(); await settled();
  check((await page.locator('#community-attribution').textContent()).includes('fallback'), 'Failed response is explicitly a fallback');
  check((await page.locator('#community-speech').textContent()).length > 30, 'Authored dialogue survives provider failure');
  reactionMode = 'slow';
  await page.locator('#community-story').click();
  await page.locator('#community-next').click();
  const freshLine = await page.locator('#community-speech').textContent();
  await page.waitForTimeout(1100);
  check(await page.locator('#community-speech').textContent() === freshLine, 'Previous resident response cannot overwrite the next encounter');
  check(await page.locator('#community-story').getAttribute('aria-pressed') === 'false', 'Next encounter clears topic selection');
  reactionMode = 'ok';

  await page.locator('.community-audio summary').click();
  check(await page.locator('#community-replay').isDisabled(), 'Muted playback is disabled');
  await page.locator('#community-dialogue-voice').selectOption('kokoro');
  await page.waitForFunction(() => document.querySelector('#community-dialogue-voice-status').textContent.includes('unavailable'));
  check(await page.locator('#community-voice').inputValue() === 'kokoro', 'Inline voice choice synchronizes sidebar');
  check(await page.locator('#community-dialogue-voice-status').textContent() === await page.locator('#community-voice-status').textContent(), 'Voice failure stays synchronized');
  voiceMode = 'slow'; await page.locator('#community-replay').click();
  await page.locator('#community-dialogue-voice').selectOption('off');
  await page.waitForTimeout(1100);
  check(await page.locator('#community-voice').inputValue() === 'off' && await page.locator('#community-replay').isDisabled(), 'Muting cancels a pending voice and updates both controls');
  check(!(await page.locator('#community-dialogue-voice-status').textContent()).includes('unavailable'), 'Late failure cannot overwrite mute status');
  await page.locator('.community-audio summary').click();

  await meet('local-20');
  check((await page.locator('.community-kicker').textContent()).includes('Fictional portrayal'), 'Named personas retain fictional disclosure');
  check(await page.locator('.community-biography').isVisible(), 'Named personas retain public source');
  await page.locator('#community-close').press('Escape');
  check(await page.locator('#community-dialogue').isHidden(), 'Escape closes conversation');
  check(await page.locator('#canvas-host').evaluate(el => el === document.activeElement), 'Escape restores walking focus');
  check(await page.locator('body').evaluate(el => el.classList.contains('walking')), 'Closing conversation does not exit walking');

  const layouts = [];
  for (const theme of ['dark', 'light']) {
    await page.locator(`button[data-theme-preference=${theme}]`).click();
    for (const [width, height] of [[1440, 1000], [1280, 720], [390, 844], [320, 568], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await meet('local-07');
      const bounds = await page.locator('#community-dialogue').evaluate(el => {
        const body = el.querySelector('.community-dialogue-body');
        const rect = node => { const r = node.getBoundingClientRect(); return { top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height }; };
        return { dialog: rect(el), close: rect(el.querySelector('#community-close')), next: rect(el.querySelector('#community-next')), body: rect(body), scrollable:body.scrollHeight > body.clientHeight,
          overflow:document.documentElement.scrollWidth > innerWidth || body.scrollWidth > body.clientWidth,
          minimumTarget:Math.min(...[...el.querySelectorAll('button, summary')].filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height)) };
      });
      check(bounds.dialog.left >= 0 && bounds.dialog.right <= width + 1 && bounds.dialog.top >= 0 && bounds.dialog.bottom <= height + 1, `${theme} ${width}x${height}: dialog inside viewport`);
      check(!bounds.overflow && bounds.scrollable, `${theme} ${width}x${height}: independent scroll without horizontal overflow`);
      check(bounds.close.height >= 44 && bounds.next.height >= 44 && bounds.minimumTarget >= 44, 'Touch targets remain at least 44px');
      await page.locator('.community-dialogue-body').focus();
      await page.keyboard.press('End');
      await page.locator('.community-provenance summary').scrollIntoViewIfNeeded();
      await page.locator('.community-provenance summary').click();
      check(await page.locator('.community-dialogue-note').isVisible(), 'Provenance remains reachable through scrolling');
      await page.locator('.community-provenance summary').click();
      await page.locator('.community-dialogue-body').evaluate(el => { el.scrollTop = 0; });
      const path = `output/playwright/dialogue-${theme}-${width}x${height}.png`;
      await page.locator('#community-dialogue').screenshot({ path }); screenshots.push(path);
      layouts.push({ theme, width, height, ...bounds });
      await page.locator('#community-close').click();
    }
    await page.setViewportSize({ width:1440, height:1000 });
  }
  check(!errors.length, `Browser errors: ${errors.join('; ')}`);
  return { support:'ask, start, supply, cooldown, resolve, pause, resume, dispatch, reset', reactions:'selected, busy, fallback, stale response', voice:'sync, failure, mute during generation', keyboard:'next-action focus, Escape, scroll, walking focus', layouts, screenshots, requests:packets.length, browserErrors:errors };
}
