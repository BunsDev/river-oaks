async page => {
  // #218 graybox review on the labeled fixture site: fixed cameras, truthful
  // companion states, frame time and repeated entry, under the classic office and
  // the opt-in Pink Jet-Age finish (#221 under #738/#744). The finish is render-only,
  // so both draw the same work. Captures go to output/playwright.
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  await page.setViewportSize({ width: 1280, height: 800 });
  const shots = [['CAM-01', 'arriving'], ['CAM-01', 'walking'], ['CAM-02', 'seated-working'], ['CAM-03', 'seated-waiting'], ['CAM-02', 'seated-stopped'], ['CAM-04', 'offstage']];
  const finishes = {};
  for (const finish of ['classic', 'pink-jet-age']) {
    await page.goto(`http://127.0.0.1:5181/e2e/fixtures/workplace.html?finish=${finish}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    check(await page.evaluate(() => window.workplaceFixture.finish) === finish, `The fixture renders the ${finish} finish`);
    const captures = [], prefix = finish === 'classic' ? 'workplace' : `workplace-${finish}`;
    for (const [camera, state] of shots) {
      const result = await page.evaluate(([camera, state]) => window.workplaceFixture.show(state, camera, { progress: 0.5 }), [camera, state]);
      check(result.presentation.working === (state === 'seated-working'), `${finish} ${state} must not ${result.presentation.working ? 'claim' : 'hide'} work`);
      if (state === 'offstage') check(!result.companionVisible, 'An offstage companion is not drawn in the room');
      await page.screenshot({ path: `output/playwright/${prefix}-${camera}-${state}.png` });
      captures.push({ camera, state, label: result.presentation.label });
    }
    const route = await page.evaluate(() => window.workplaceFixture.path.length);
    check(route > 10, 'The street-to-desk route exists in the rendered plan');
    await page.evaluate(() => window.workplaceFixture.show('seated-working', 'CAM-01'));
    const frames = await page.evaluate(() => window.workplaceFixture.frames(180));
    const reentry = await page.evaluate(() => window.workplaceFixture.reenter(20));
    check(reentry.after <= reentry.before, `Re-entering the ${finish} room leaks geometry (${reentry.before} -> ${reentry.after})`);
    finishes[finish] = { captures, frames, reentry, route };
  }
  const { classic, 'pink-jet-age': pink } = finishes;
  check(pink.frames.calls === classic.frames.calls && pink.frames.triangles === classic.frames.triangles, `A finish is render-only: ${pink.frames.calls} calls / ${pink.frames.triangles} triangles vs classic ${classic.frames.calls} / ${classic.frames.triangles}`);
  return { ...classic, finishes };
}
