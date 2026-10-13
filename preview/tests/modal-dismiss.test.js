import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as game from '../src/modal-dismiss.js';
import * as access from '../src/access-modal-dismiss.js';

// The sign-in page keeps its own copy (access-modal-dismiss.js) so that it never
// shares a chunk with game code; every case runs against both copies.

function fixture({ overlay = false, dismissOnOutsideClick } = {}) {
  const surface = new EventTarget();
  const content = overlay ? {} : surface;
  content.getBoundingClientRect = () => ({ left: 100, right: 300, top: 100, bottom: 300 });
  let closed = 0;
  dismissOnOutsideClick(surface, () => { closed++; }, content);
  const send = (type, x = 5, options = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { clientX: x, clientY: x, button: 0, isPrimary: true, ...options });
    surface.dispatchEvent(event);
    return event;
  };
  return { send, count: () => closed };
}

for (const [name, { dismissOnOutsideClick }] of [['game', game], ['sign-in page', access]]) {
  for (const overlay of [false, true]) {
    test(`${name}: ${overlay ? 'custom overlay' : 'native dialog'} dismisses only for an outside gesture`, () => {
      const { send, count } = fixture({ overlay, dismissOnOutsideClick });
      send('pointerdown', 150); send('click', 150);
      assert.equal(count(), 0, 'inside padding is not a backdrop');
      send('pointerdown', 150); send('click');
      assert.equal(count(), 0, 'a drag out is not a backdrop click');
      send('pointerdown'); send('click', 150);
      assert.equal(count(), 0, 'a drag in is not a backdrop click');
      send('pointerdown');
      assert.equal(send('click').defaultPrevented, true);
      assert.equal(count(), 1);
      send('click');
      assert.equal(count(), 1, 'a stale gesture cannot close a reopened modal');
    });
  }

  test(`${name}: cancelled gestures and a closed dialog clear pending dismissal`, () => {
    const { send, count } = fixture({ dismissOnOutsideClick });
    for (const reset of ['pointercancel', 'close']) {
      send('pointerdown'); send(reset); send('click');
      assert.equal(count(), 0);
    }
  });

  test(`${name}: secondary buttons and non-primary pointers cannot dismiss a modal`, () => {
    const { send, count } = fixture({ dismissOnOutsideClick });
    for (const options of [{ button: 2 }, { isPrimary: false }]) {
      send('pointerdown', 5, options); send('click', 5, options);
      assert.equal(count(), 0);
    }
    send('pointerdown'); send('click', 5, { button: 2 });
    assert.equal(count(), 0);
  });
}

test('the sign-in copy is the shared helper, line for line', async () => {
  const body = async file => { const text = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'); return text.slice(text.indexOf('export function')); };
  assert.equal(await body('access-modal-dismiss.js'), await body('modal-dismiss.js'), 'change both copies together');
});
