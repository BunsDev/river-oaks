async page => {
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const games = () => page.evaluate(() => window.__riverPlazaGames());
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
  check(await panel.locator('.table-game-header').evaluate(header=>[...header.querySelectorAll('button')].every(button=>{
    const box=button.getBoundingClientRect();return box.width>=44&&box.height>=44;
  })),'Header actions provide 44-pixel targets');
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
  check(await panel.evaluate(panel=>{
    const body=panel.querySelector('.table-game-body'),b=panel.querySelector('.table-game-board').getBoundingClientRect(),s=panel.querySelector('.table-game-side').getBoundingClientRect(),r=body.getBoundingClientRect();
    return b.bottom<=r.bottom-12&&body.scrollHeight<=body.clientHeight+1&&s.left-b.right<=32;
  }),'Expanded desktop shows the whole board beside its controls without scrolling');
  check(await board.locator('.table-coordinate').count()===16,'Chess exposes all eight file and rank labels');
  await page.screenshot({path:'output/playwright/plaza-games-expanded.png'});
  for(const game of ['checkers','connectFour','reversi','morris','chess']){
    await panel.locator(`.table-game-choice [data-game=${game}]`).click();await frame();
    check((await games()).game===game&&await panel.locator(`.table-game-choice [data-game=${game}]`).getAttribute('aria-pressed')==='true',`${game} has a distinct active selection`);
    const box=await measure(),ratio=game==='connectFour'?7/6:1;
    check(Math.abs(box.width/box.height-ratio)<.02,`${game} keeps its board proportions when expanded`);
    check(await board.evaluate(board=>{
      const rows=[...board.children],bottom=[...rows.at(-1).children];
      return rows.every((row,i)=>row.firstElementChild.querySelector('[data-axis=rank]')?.textContent===String(rows.length-i))
        &&bottom.every((cell,i)=>cell.querySelector('[data-axis=file]')?.textContent===String.fromCharCode(97+i));
    }),`${game} coordinates match the visible rows and columns`);
    await page.screenshot({path:`output/playwright/plaza-games-${game}-expanded.png`});
  }
  check(JSON.stringify((await games()).moves)===JSON.stringify(moves),'Switching games preserves the chess position');
  await panel.locator('.table-game-choice [data-game=checkers]').click();
  await panel.locator('[data-mode=lesson]').click();
  check((await games()).lesson==='1','Checkers lesson opens with its first instruction');
  check(!await panel.locator('.table-game-side-choice').isVisible(),'Lessons omit unavailable side controls');
  await click('c3');await click('d4');
  await page.waitForFunction(()=>window.__riverPlazaGames().lesson==='2');
  check((await games()).lesson==='2','Coordinate-guided lesson move advances the instruction');
  await page.screenshot({path:'output/playwright/plaza-games-checkers-lesson.png'});
  await panel.locator('.table-game-choice [data-game=chess]').click();
  await panel.locator('[data-mode=regular]').click();
  await panel.locator('[data-side-index="1"]').click();
  check(await board.evaluate(board=>board.firstElementChild.firstElementChild.dataset.square==='h1'
    &&board.firstElementChild.firstElementChild.querySelector('[data-axis=rank]').textContent==='1'
    &&board.lastElementChild.firstElementChild.querySelector('[data-axis=file]').textContent==='h'),'Second-player coordinates rotate with the board');
  await panel.locator('[data-mode=pass]').click();
  for(const [width,height] of [[1920,1080],[1280,720],[1440,600]]){
    await page.setViewportSize({width,height});await frame();
    check(await panel.evaluate(panel=>{
      const body=panel.querySelector('.table-game-body'),b=panel.querySelector('.table-game-board').getBoundingClientRect(),side=panel.querySelector('.table-game-side').getBoundingClientRect();
      return b.bottom<=innerHeight-24&&body.scrollHeight<=body.clientHeight+1&&side.left-b.right<=32;
    }),`Full board and adjacent controls fit expanded ${width} × ${height}`);
    if(height===600){
      await panel.locator('[data-action=new]').focus();
      check(await panel.locator('[data-action=new]').evaluate(button=>{
        const b=button.getBoundingClientRect(),s=button.closest('.table-game-side').getBoundingClientRect();return b.top>=s.top&&b.bottom<=s.bottom;
      }),'Keyboard focus scrolls short-window controls into view');
      await page.screenshot({path:'output/playwright/plaza-games-short.png'});
    }
  }
  await page.setViewportSize({width:1440,height:1000});await frame();
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
