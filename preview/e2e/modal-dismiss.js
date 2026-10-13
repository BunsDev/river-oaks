async page => {
  const checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  await page.route('http://127.0.0.1:5180/', route => route.fulfill({ contentType: 'text/html', body: `
    <style>dialog { width: 320px; padding: 40px; } dialog::backdrop { background: #0008; }</style>
    <button id="open">Open</button><dialog><input aria-label="Name"><button id="inside">Inside</button></dialog>` }));
  await page.goto('http://127.0.0.1:5180/');
  await page.evaluate(async () => {
    const { dismissOnOutsideClick } = await import('/src/modal-dismiss.js');
    const dialog = document.querySelector('dialog');
    dismissOnOutsideClick(dialog, () => { dialog.close(); document.querySelector('#open').focus(); });
    document.querySelector('#open').onclick = () => dialog.showModal();
  });
  const dialog = page.locator('dialog');
  const open = () => page.locator('#open').click();
  await open();
  await page.locator('#inside').click();
  check(await dialog.isVisible(), 'Clicks on modal controls stay inside');
  const box = await dialog.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  check(await dialog.isVisible(), 'Clicks on native dialog padding do not dismiss it');
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down();
  await page.mouse.move(5, 5); await page.mouse.up();
  check(await dialog.isVisible(), 'Dragging from the dialog to its backdrop does not dismiss it');
  await page.mouse.move(5, 5); await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.up();
  check(await dialog.isVisible(), 'Dragging from the backdrop into the dialog does not dismiss it');
  await page.mouse.click(5, 5, { button: 'right' });
  check(await dialog.isVisible(), 'Right-clicking the backdrop does not dismiss it');
  await page.keyboard.press('Escape'); // Dismiss the context menu if the browser opened one.
  if (!await dialog.isVisible()) await open();
  await page.mouse.click(5, 5);
  check(!await dialog.isVisible(), 'A primary backdrop click dismisses a native modal');
  check(await page.locator('#open').evaluate(node => node === document.activeElement), 'Backdrop dismissal runs the supplied focus recovery');
  await open();
  await page.mouse.click(5, 5);
  check(!await dialog.isVisible(), 'Reopened dialogs still dismiss on the next outside click');
  await open();
  await page.keyboard.press('Escape');
  check(!await dialog.isVisible(), 'Native Escape dismissal still works');
  return { passed: true, checks };
}
