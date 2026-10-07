// Run against the real shared-town fixture; voice failures are controlled by this journey.
async (page) => {
  await page.unrouteAll({behavior:'ignoreErrors'});
  const check = (value, message) => { if (!value) throw new Error(message); };
  const errors = [], screenshots = [];
  let voiceMode = 'fail';
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/v1/voice', async route => {
    if (voiceMode === 'slow') await page.waitForTimeout(900);
    await route.fulfill({ status: 503, json: { error: 'Fixture voice unavailable' } });
  });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.multiplayer==='joined' && document.querySelector('#community-local').options.length>0);
  const toggle = page.locator('#panel-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.locator('[data-section=community-section]').click();
  await page.locator('#community-more > summary').click();
  const meet = async id => {
    await page.locator('#community-local').selectOption(id);
    if(await page.locator('#community-dialogue').isVisible())await page.locator('#community-close').click();
    await page.waitForTimeout(1100);await page.locator('#community-meet').click();
    await page.locator('#community-dialogue').waitFor({state:'visible'});
    if (!await page.locator('#community-activities').evaluate(el => el.open)) await page.locator('#community-activities > summary').click();
  };
  const settled = () => page.waitForFunction(() => document.querySelector('.community-topics').getAttribute('aria-busy') === 'false');
  const resources = () => page.locator('.community-mission-resources dd').allTextContents();
  await meet('store-osm-node-8172494969-person-2');
  check(await page.locator('#community-dialogue').getAttribute('aria-modal') === 'false', 'World controls remain available during conversation');
  await page.locator('#community-ask').click(); await settled();
  await page.waitForFunction(()=>document.querySelector('#community-ask').hidden);
  check(await page.locator('#community-supply').isDisabled(),'Indoor residents without requests cannot spend supplies');
  check(await page.locator('#community-dispatch').isDisabled(),'Indoor residents without requests cannot spend visits');
  check(await page.locator('#community-support-status').textContent()==='No request','Comfortable residents do not imply a support need');
  await page.locator('#community-dialogue-run').click();
  await page.waitForFunction(()=>document.querySelector('#community-run').textContent.includes('Pause'));
  const runningTime=(await resources())[2];
  await page.waitForFunction(time=>document.querySelectorAll('.community-mission-resources dd')[2].textContent!==time,runningTime);
  await page.locator('#community-run').click();
  await page.waitForFunction(()=>document.querySelector('#community-dialogue-run').textContent.includes('Resume'));
  const pausedTime=(await resources())[2];await page.waitForTimeout(1100);
  check((await resources())[2]===pausedTime,'Shared pause freezes the visible clock');
  check(await page.locator('#community-reset').count()===0,'Solo reset control is absent');
  check(await page.locator('#community-life').count()===0,'Solo life toggle is absent');
  check((await page.locator('#community-scenario').textContent()).includes('Heatwave'),'Shared scenario title remains visible');
  const comfortable=await page.locator('#community-local').inputValue();
  await page.locator('#community-about').click();
  check(await page.locator('#community-about').getAttribute('aria-pressed')==='true','Selected topic is exposed');
  check((await page.locator('#community-attribution').textContent()).includes('shared town'),'Authored topic has shared-town attribution');
  check((await page.locator('#community-speech').textContent()).length>30,'Indoor resident retains authored dialogue');
  await page.locator('#community-story').click();
  await page.waitForTimeout(1100);await page.locator('#community-next').click();
  await page.waitForFunction(id=>document.querySelector('#community-local').value!==id,comfortable);
  check(await page.locator('#community-story').getAttribute('aria-pressed')==='false','Next encounter clears topic selection');

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

  await meet('store-osm-node-8172494969-person-2');
  await page.locator('#community-close').press('Escape');
  check(await page.locator('#community-dialogue').isHidden(), 'Escape closes conversation');
  check(await page.locator('#canvas-host').evaluate(el => el === document.activeElement), 'Escape restores walking focus');
  check(await page.locator('body').evaluate(el => el.classList.contains('walking')), 'Closing conversation does not exit walking');

  const layouts = [];
  for (const theme of ['dark', 'light']) {
    await page.locator('[data-section=settings-section]').click(); // Appearance lives in the Settings rail section.
    await page.locator(`button[data-theme-preference=${theme}]`).click();
    await page.locator('[data-section=community-section]').click();
    for (const [width, height] of [[1440, 1000], [1280, 720], [390, 844], [320, 568], [844, 390]]) {
      await page.setViewportSize({ width, height });
      // Measure an open conversation with whichever resident is reachable now:
      // one standing somewhere Jevica cannot reach is (rightly) declined.
      let opened=false;
      for (const id of [comfortable, ...await page.locator('#community-local option[value^=store-]').evaluateAll(options=>options.map(option=>option.value))]) {
        await meet(id);
        if (await page.locator('#community-dialogue').waitFor({ state: 'visible', timeout: 2500 }).then(()=>true,()=>false)) { opened=true; break; }
      }
      check(opened, `${theme} ${width}x${height}: a reachable resident opens a conversation`);
      const bounds = await page.locator('#community-dialogue').evaluate(el => {
        const body = el.querySelector('.community-dialogue-body');
        const rect = node => { const r = node.getBoundingClientRect(); return { top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height }; };
        return { dialog: rect(el), close: rect(el.querySelector('#community-close')), next: rect(el.querySelector('#community-next')), body: rect(body), scrollable:body.scrollHeight > body.clientHeight,
          overflow:document.documentElement.scrollWidth > innerWidth || body.scrollWidth > body.clientWidth,
          minimumTarget:Math.min(...[...el.querySelectorAll('button, summary')].filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height)) };
      });
      check(bounds.dialog.left >= 0 && bounds.dialog.right <= width + 1 && bounds.dialog.top >= 0 && bounds.dialog.bottom <= height + 1, `${theme} ${width}x${height}: dialog inside viewport`);
      check(!bounds.overflow && bounds.scrollable, `${theme} ${width}x${height}: independent scroll without horizontal overflow (overflow ${bounds.overflow}, scrollable ${bounds.scrollable}, dialog ${Math.round(bounds.dialog.height)}px, body ${Math.round(bounds.body.height)}px)`);
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
  return { support:'ask, no-request spending gates, shared start and pause', reactions:'selected, authored shared-town dialogue, next encounter', voice:'sync, failure, mute during generation', keyboard:'Escape, scroll, walking focus', layouts, screenshots, browserErrors:errors };
}
