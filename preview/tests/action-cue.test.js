import test from 'node:test';
import assert from 'node:assert/strict';
import { actionCueLabel, createActionCue, writeLive } from '../src/action-cue.js';

// The walking HUD's contextual action (Step inside, Sit down, Take the lift up) appears silently.
// The cue names it for screen readers once it has held still, so walking past doors and people
// does not flood the polite region.
const clock = () => { let now = 0, timers = [];
  return { setTimer: (fn, ms) => { const t = { at: now + ms, fn };timers.push(t);return t; }, clearTimer: t => { timers = timers.filter(x => x !== t); },
    advance: ms => { now += ms;for (const t of timers.filter(x => x.at <= now)) { timers = timers.filter(x => x !== t);t.fn(); } } };
};
test('a held action is announced once with its key; a passing one is not', () => {
  const element = { textContent: '' }, c = clock(), cue = createActionCue({ element, delay: 600, ...c });
  cue.update('Talk to Mara', 'E');c.advance(300);cue.update('Step inside Cartier', 'F');c.advance(300);
  assert.equal(element.textContent, '', 'nothing yet: the first label did not hold still');
  c.advance(400);assert.equal(element.textContent, 'In reach: Step inside Cartier. Press F.');
  cue.update('Step inside Cartier', 'F');c.advance(1000);assert.equal(element.textContent, 'In reach: Step inside Cartier. Press F.', 'the same action is not re-announced');
  cue.update(null);c.advance(1000);assert.equal(element.textContent, '', 'leaving clears it silently');
  cue.update('Take the lift up to Floor 2', null);c.advance(600);assert.equal(element.textContent, 'In reach: Take the lift up to Floor 2.');
});
test('the cue reads a button label and its key without the key glyph run together', () => {
  const kbd = { nodeName: 'KBD', textContent: 'Z' };
  const button = { querySelector: () => kbd, getAttribute: () => null, childNodes: [{ nodeName: '#text', textContent: 'Sit on the bench ' }, kbd] };
  assert.deepEqual(actionCueLabel(button), ['Sit on the bench', 'Z']);
});
test('a live region is rewritten only when its words change', () => {
  let writes = 0;const node = { textContent: 'You’re near Alice + Olivia (10 m)' };
  const render = text => () => { writes++;node.textContent = text; };
  assert.equal(writeLive(node, 'You’re near Alice + Olivia (10 m)', render('x')), false);
  assert.equal(writeLive(node, 'You’re at Alice + Olivia', render('You’re at Alice + Olivia')), true);
  assert.equal(writes, 1);
});
test('the HUD repeats the same action every frame and the cue still speaks after the delay', () => {
  const element = { textContent: '' }, c = clock(), cue = createActionCue({ element, delay: 600, ...c });
  for (let i = 0; i < 8; i++) { cue.update('Sit on the bench', 'Z');c.advance(100); }
  assert.equal(element.textContent, 'In reach: Sit on the bench. Press Z.');
});
