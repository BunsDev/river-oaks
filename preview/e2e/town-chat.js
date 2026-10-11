async page => {
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  // Synthetic history, real DOM/layout and the production dock controller.
  await page.route('**/chat-fixture', route => route.fulfill({ contentType: 'text/html', body: '<main id="viewport"><div id="canvas-host" tabindex="0"></div></main><style>.multiplayer-chat-history{height:120px;overflow:auto}.multiplayer-chat-history p{height:35px;margin:0}details{width:360px}</style>' }));
  await page.goto('http://127.0.0.1:5173/chat-fixture');
  const result = await page.evaluate(async () => {
    const { createTownChatDock } = await import('/src/town-chat.js');
    const section = document.createElement('section'); section.innerHTML = '<h3>Town chat</h3><div class="multiplayer-chat-history"></div><input aria-label="Message the town">';
    const controller = createTownChatDock(section), dock = document.querySelector('.town-chat-dock'), history = section.querySelector('.multiplayer-chat-history');
    const append = text => { const row = document.createElement('p'); row.textContent = text; history.append(row); };
    for (let i = 0; i < 20; i++) append(`Message ${i}`);
    controller.updated({ added: 20, initial: true, follow: false });
    const initialBottom = history.scrollTop > 0;
    // Dispatch pending initial toggle before deliberately reading older messages.
    await new Promise(resolve => dock.addEventListener('toggle', resolve, { once: true }));
    history.scrollTop = 70;
    const toggleDock = async open => {
      const toggled = new Promise(resolve => dock.addEventListener('toggle', resolve, { once: true }));
      dock.open = open; await toggled;
    };
    await toggleDock(false); await toggleDock(true);
    const reopenedAtReadingPosition = history.scrollTop === 70;
    const before = history.scrollTop, follow = controller.beforeUpdate();
    append('A new message'); controller.updated({ added: 1, initial: false, follow });
    const anchored = history.scrollTop === before, unread = document.querySelector('.chat-unread').textContent;
    document.querySelector('.chat-jump').click();
    const jumped = history.scrollTop >= history.scrollHeight - history.clientHeight - 1 && !document.querySelector('.chat-unread').textContent;
    dock.open = false;
    append('While collapsed'); controller.updated({ added: 1, initial: false, follow: controller.beforeUpdate() });
    const collapsedUnread = document.querySelector('.chat-unread').textContent;
    dock.open = true; dock.style.visibility = 'hidden';
    const hiddenDoesNotRead = !controller.beforeUpdate();
    controller.dispose();
    return { reopenedAtReadingPosition, initialBottom, anchored, unread, jumped, collapsedUnread, hiddenDoesNotRead, disposed: !document.querySelector('.town-chat-dock') };
  });
  check(result.reopenedAtReadingPosition, 'Reopening chat preserves the older-history reading position without new messages');
  check(result.initialBottom, 'Restored history starts at its latest message');
  check(result.anchored && result.unread === '1 new', 'New messages preserve the reading position and show unread count');
  check(result.jumped, 'Jump to latest scrolls and clears unread count');
  check(result.collapsedUnread === '1 new', 'Collapsed chat retains unread messages');
  check(result.hiddenDoesNotRead, 'A hidden dock does not mark new messages read');
  check(result.disposed, 'Disposing the town client removes its chat dock');
  const composer = await page.evaluate(async () => {
    const { bindTownChatComposer } = await import('/src/town-chat.js');
    if (typeof bindTownChatComposer !== 'function') return { supported: false };
    const form = document.createElement('form'); form.innerHTML = '<input><button>Send</button><p></p>'; document.body.append(form);
    const input = form.querySelector('input'), send = form.querySelector('button'), status = form.querySelector('p');
    let finish, calls = 0;
    bindTownChatComposer({ form, input, send, status, connected: () => true, sendMessage: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
    input.value = 'First draft'; form.requestSubmit(); form.dispatchEvent(new Event('submit', { cancelable: true }));
    const duplicateBlocked = calls === 1;
    input.value = 'My next message'; finish({ ok: true }); await Promise.resolve();
    const nextDraftKept = input.value === 'My next message';
    form.requestSubmit(); finish({ ok: false, message: 'Please wait before sending again.' }); await Promise.resolve();
    const retryKept = input.value === 'My next message' && status.textContent.includes('Please wait');
    form.requestSubmit(); finish({ ok: true }); await Promise.resolve();
    return { supported: true, duplicateBlocked, nextDraftKept, retryKept, confirmedCleared: input.value === '' };
  });
  check(composer.supported && composer.duplicateBlocked, 'Pending sends reject duplicate submissions');
  check(composer.nextDraftKept, 'A late confirmation preserves the next draft');
  check(composer.retryKept, 'A rejected message retains its draft and explains the failure');
  check(composer.confirmedCleared, 'A confirmed unchanged draft clears');
  return { checks };
}
