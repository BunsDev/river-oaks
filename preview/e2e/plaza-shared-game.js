async page => {
  // Two residents at one plaza chess table play each other: one invites, the other
  // accepts, moves go through the town to both boards, the table's own pieces show the
  // game to everyone, and a resignation ends it. Practice games stay where they were.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const peerContext = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  await peerContext.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
  const peer = await peerContext.newPage();
  const ready = tab => tab.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true'
    && window.__riverSeatAndWater?.()?.seats.length > 0 && window.__riverPlazaGames?.(), null, { timeout: 90000 });
  const games = tab => tab.evaluate(() => window.__riverPlazaGames());
  const sitAt = async (tab, chair) => {
    check((await tab.evaluate(id => window.__riverSeatAndWater().goNear(id), chair)).ok, `Arrived beside ${chair}`);
    await tab.waitForFunction(() => window.__riverSeatAndWater().interaction === 'sit', null, { timeout: 15000 });
    await tab.locator('#canvas-host').focus(); await tab.keyboard.press('KeyZ');
    await tab.waitForFunction(id => window.__riverSeatAndWater().seated === id, chair, { timeout: 15000 });
  };
  const openSheet = async tab => { await tab.locator('#canvas-host').focus(); await tab.keyboard.press('KeyX'); await tab.locator('#table-game-panel[open]').waitFor(); };
  const square = (tab, name) => tab.locator(`#table-game-panel .table-square[data-square=${name}]`);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin + '/?motion-debug=1'); await ready(page);
    await peer.goto(origin + '/?motion-debug=1'); await ready(peer);
    const names = await page.evaluate(() => { const mp = window.__riverMultiplayer(); return Object.fromEntries(mp.snapshot.players.map(player => [player.id, player.name])); });
    await sitAt(page, 'bench:plaza-salon-chess-west-0:0');
    await sitAt(peer, 'bench:plaza-salon-chess-west-1:0');
    const bobName = await peer.evaluate(() => { const mp = window.__riverMultiplayer(); return mp.snapshot.players.find(player => player.id === mp.selfId).name; });
    const myName = await page.evaluate(() => { const mp = window.__riverMultiplayer(); return mp.snapshot.players.find(player => player.id === mp.selfId).name; });

    // A practice move first: it must survive the shared game.
    await openSheet(page);
    await page.locator('#table-game-panel [data-mode=pass]').click();
    await square(page, 'e2').click(); await square(page, 'e3').click();
    let mine = await games(page);
    check(mine.mode === 'pass' && mine.moves.join() === 'e2e3', 'A practice move is made in pass and play');
    const offer = page.locator('#table-game-panel [data-mode=shared]');
    await page.waitForFunction(name => document.querySelector('#table-game-panel [data-mode=shared]')?.textContent === `Play ${name}`, bobName, { timeout: 10000 });
    check(await offer.isVisible(), `With ${bobName} across the table, the sheet offers Play ${bobName}`);

    // Invite; Bob's X action and sheet show the invitation; he accepts.
    await offer.click();
    await page.waitForFunction(() => window.__riverPlazaGames().invite?.startsWith('Waiting for'), null, { timeout: 10000 });
    check(true, 'The inviter waits for an answer');
    await peer.waitForFunction(name => (document.querySelector('#walking-play')?.textContent ?? '').includes(`${name} invites you to Chess`), myName, { timeout: 15000 });
    check(true, `Bob's X action reads "${myName} invites you to Chess"`);
    await openSheet(peer);
    let theirs = await games(peer);
    check(theirs.invite === `${myName} invites you to play Chess as black.`, `Bob's sheet shows the invitation (${theirs.invite})`);
    await peer.locator('#table-game-panel [data-invite=accept]').click();
    await peer.waitForFunction(() => window.__riverPlazaGames().mode === 'shared', null, { timeout: 10000 });
    await page.waitForFunction(() => window.__riverPlazaGames().mode === 'shared', null, { timeout: 10000 });
    mine = await games(page); theirs = await games(peer);
    check(mine.player === 'w' && theirs.player === 'b' && mine.status === 'Your move, white.' && theirs.status === `${myName} to move.`, `Both boards show the shared game (${mine.status} / ${theirs.status})`);
    check(await page.locator('#table-game-panel [data-action=resign]').isVisible() && !await page.locator('#table-game-panel [data-action=new]').isVisible() && !await page.locator('#table-game-panel [data-action=undo]').isVisible(),
      'During a shared game you may resign; there is no take-back and no new game');
    check(await page.locator('#table-game-eyebrow').textContent() === `Plaza games · with ${bobName}`, 'The sheet says who you are playing');

    // Moves go through the town to both boards, and the table shows them to everyone.
    await square(page, 'e2').click(); await square(page, 'e4').click();
    await peer.waitForFunction(() => window.__riverPlazaGames().moves.join() === 'e2e4', null, { timeout: 10000 });
    check((await games(peer)).status === 'Your move, black.', 'White\'s move reaches Black, whose turn it is');
    await square(peer, 'e2').click();
    check((await games(peer)).moves.join() === 'e2e4', 'Black cannot move White\'s pieces');
    await square(peer, 'e7').click(); await square(peer, 'e5').click();
    await page.waitForFunction(() => window.__riverPlazaGames().moves.join() === 'e2e4,e7e5', null, { timeout: 10000 });
    const tables = await page.evaluate(() => window.__riverMultiplayer().snapshot.tables);
    check(tables.length === 1 && tables[0].moves.join() === 'e2e4,e7e5', 'The town holds the game');
    mine = await games(page); theirs = await games(peer);
    check(mine.mirror[28] === 'P' && mine.mirror[36] === 'p' && theirs.mirror.join() === mine.mirror.join(), 'Both see the table\'s pieces on e4 and e5');
    await page.screenshot({ path: 'output/playwright/plaza-shared-game.png' });
    await peer.screenshot({ path: 'output/playwright/plaza-shared-game-peer.png' });

    // Practice is still there, and the shared game carries on.
    await page.locator('#table-game-panel [data-mode=pass]').click();
    mine = await games(page);
    check(mine.mode === 'pass' && mine.moves.join() === 'e2e3', 'The practice game is just as it was left');
    check(mine.mirror[28] === 'P', 'The table keeps showing the shared game');
    await page.locator('#table-game-panel [data-mode=shared]').click();
    check((await games(page)).moves.join() === 'e2e4,e7e5', 'Play Bob returns to the shared game');

    // Resigning ends it for both.
    await peer.locator('#table-game-panel [data-action=resign]').click();
    await page.waitForFunction(name => window.__riverPlazaGames().status === `${name} resigned. You win!`, bobName, { timeout: 10000 })
      .catch(async () => { throw new Error(`After the resignation: ${JSON.stringify({ mine: (await games(page)).status, theirs: (await games(peer)).status, table: (await games(page)).shared })}`); });
    check((await games(peer)).status === `You resigned. ${myName} wins.`, 'A resignation ends the game for both');
    check(await page.locator('#table-game-panel [data-action=new]').textContent() === 'Rematch', 'A rematch is offered');
    return { checks, names };
  } finally { await peerContext.close(); }
}
