async page => {
  // Signing in must settle in one direction: no state the visitor can see (theme, the
  // splash/gate, the character studio button, the chosen character) may flip back and forth
  // while the district opens. Every frame from the first paint is recorded.
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
  try {
    await context.addCookies(await page.context().cookies());
    const tab = await context.newPage();
    await tab.addInitScript(() => {
      const states = window.__loginStates = [];
      const studio = () => document.querySelector('.character-studio-trigger');
      const read = () => ({
        theme: document.documentElement.dataset.theme ?? null,
        splash: 'returning' in document.documentElement.dataset,
        gate: document.querySelector('#access-gate') ? !document.querySelector('#access-gate').hidden : null,
        background: document.documentElement && getComputedStyle(document.documentElement).backgroundColor,
        studio: studio() ? (studio().disabled ? 'disabled' : 'enabled') : 'absent',
        studioShown: studio() ? studio().offsetParent !== null : false,
        character: document.querySelector('.character-picker input:checked')?.value ?? null,
        dock: document.querySelector('.visit-tools') ? `${document.querySelector('.visit-tools').open ? 'open' : 'closed'}:${document.querySelector('.play-rail-tab[aria-selected=true]')?.id ?? '-'}` : 'absent',
        hiddenBy: (() => { for (let node = studio(); node; node = node.parentElement) if (getComputedStyle(node).display === 'none') return `${node.tagName.toLowerCase()}#${node.id}.${[...node.classList].join('.')}`; return null; })(),
      });
      let last = '';
      const sample = () => {
        if (!document.documentElement) return requestAnimationFrame(sample);
        const state = read(), key = JSON.stringify(state);
        if (key !== last) { states.push({ t: Math.round(performance.now()), ...state }); last = key; }
        if (states.length < 400) requestAnimationFrame(sample);
      };
      sample();
    });
    await tab.goto(origin, { waitUntil: 'commit' });
    await tab.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true', null, { timeout: 180000 });
    await tab.waitForTimeout(6000);
    const states = await tab.evaluate(() => window.__loginStates);
    // A field flickers when it returns to a value it already left.
    const flips = field => {
      const seen = [], values = states.map(state => state[field]).filter((value, i, all) => i === 0 || value !== all[i - 1]);
      return values.filter(value => { const again = seen.includes(value); seen.push(value); return again; }).length;
    };
    console.log(JSON.stringify(states));
    for (const field of ['theme', 'gate', 'background', 'studio', 'studioShown', 'character'])
      check(flips(field) === 0, `Signing in never flips ${field} back to an earlier value (${JSON.stringify(states.map(state => [state.t, state[field]]))})`);
    // The splash is a phase: it may cover the game's load once, then ends for good.
    const splashes = states.filter((state, i) => state.splash && !states[i - 1]?.splash).length;
    check(splashes <= 1 && !states.at(-1).splash, `The splash covers sign-in at most once and ends (${JSON.stringify(states.map(state => [state.t, state.splash]))})`);
    return { checks, states };
  } finally { await context.close(); }
}
