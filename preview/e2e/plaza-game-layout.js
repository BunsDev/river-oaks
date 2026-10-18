async page => {
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const games = () => page.evaluate(() => window.__riverPlazaGames());
  const cell = name => 'abcdefg'.indexOf(name[0]) + (Number(name[1]) - 1) * 7;
  const click = name => page.locator(`#table-game-panel .table-square[data-square=${name}]`).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaGames?.(), null, { timeout: 90000 });
  const chair = 'bench:plaza-salon-chess-west-0:0';
  check((await page.evaluate(id => window.__riverSeatAndWater().goNear(id), chair)).ok, 'Arrived beside a chess table');
  await page.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyZ');
  await page.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  await page.waitForFunction(() => /Play a table game/.test(document.querySelector('#walking-play')?.textContent ?? ''), null, { timeout: 5000 });
  await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyX');
  await page.locator('#table-game-panel[open]').waitFor();
  const panel=page.locator('#table-game-panel'),board=panel.locator('.table-game-board'),expand=panel.locator('.table-game-expand');
  const measure=()=>board.boundingBox();
  const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const fits=async()=>panel.evaluate(panel=>{
    const p=panel.getBoundingClientRect(),board=panel.querySelector('.table-game-board').getBoundingClientRect();
    const choice=panel.querySelector('.table-game-choice'),c=choice.getBoundingClientRect();
    return p.left>=0&&p.right<=innerWidth+1&&p.top>=0&&p.bottom<=innerHeight+1&&panel.scrollWidth<=panel.clientWidth+1
      &&board.left>=p.left&&board.right<=p.right+1&&[...choice.querySelectorAll('button')].every(button=>{const b=button.getBoundingClientRect();return b.left>=c.left&&b.right<=c.right+1&&b.height>=44;});
  });
  const initial=await measure();check(initial.width>=500,'Desktop board uses at least 500 pixels');
  await page.screenshot({path:'output/playwright/plaza-games-light.png'});
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  await panel.locator('[data-mode=pass]').click();await click('e2');await click('e4');
  const moves=(await games()).moves;
  await expand.focus();await page.keyboard.press('Enter');await frame();
  const large=await measure();check(large.width>initial.width+80,'Expand board materially enlarges the board');
  check(await expand.getAttribute('aria-pressed')==='true'&&await expand.evaluate(n=>n===document.activeElement),'Keyboard expansion retains focus and announces its pressed state');
  check(JSON.stringify((await games()).moves)===JSON.stringify(moves),'Expansion preserves the game position');
  check(await fits(),'Expanded board and selector fit the desktop viewport');
  await page.screenshot({path:'output/playwright/plaza-games-expanded.png'});
  for(const game of ['checkers','connectFour','reversi','morris','chess']){
    await panel.locator(`.table-game-choice [data-game=${game}]`).click();await frame();
    check((await games()).game===game&&await panel.locator(`.table-game-choice [data-game=${game}]`).getAttribute('aria-pressed')==='true',`${game} has a distinct active selection`);
    const box=await measure(),ratio=game==='connectFour'?7/6:1;
    check(Math.abs(box.width/box.height-ratio)<.02,`${game} keeps its board proportions when expanded`);
  }
  check(JSON.stringify((await games()).moves)===JSON.stringify(moves),'Switching games preserves the chess position');
  await expand.click();await frame();check(Math.abs((await measure()).width-initial.width)<2,'Restore size returns to the original board dimensions');
  await page.screenshot({path:'output/playwright/plaza-games-desktop.png'});
  for(const [width,height] of [[800,900],[390,844],[320,640],[800,450]]){
    await page.setViewportSize({width,height});await frame();check(await fits(),`Board and game choices fit ${width} × ${height}`);
    const compact=await measure();await expand.click();await frame();check(await fits(),`Expanded layout fits ${width} × ${height}`);
    if(width===800&&height===900)check((await measure()).width>compact.width+100,'Expansion moves controls below the board on medium screens');
    if(width===390){check((await measure()).width>=330,'Phone expansion uses the available board width');await page.screenshot({path:'output/playwright/plaza-games-phone.png'});}
    await expand.click();await frame();
  }
  await page.setViewportSize({width:1440,height:1000});await frame();
  await board.locator('[data-square=e4]').focus();await page.keyboard.press('ArrowRight');
  check(await page.evaluate(()=>document.activeElement?.dataset.square)==='f4','Board arrow-key navigation survives resizing');
  await page.keyboard.press('Escape');check(!await panel.evaluate(n=>n.open),'Escape closes the board');
  check(await page.locator('#canvas-host').evaluate(n=>n===document.activeElement),'Closing returns focus to the world');
  return {checks,scope:'Automated layout, keyboard and game-state preservation; no human accessibility acceptance'};
}
