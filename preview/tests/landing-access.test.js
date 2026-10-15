import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_LABELS, playLabel } from '../../landing-page/access.js';

// The landing page's hero link: a signed-in resident who already has access is invited in, not
// onto the waitlist. Anything else, including a failed or signed-out check, keeps the waitlist.
test('an approved account sees Enter River Oaks; everyone else sees the waitlist', () => {
  assert.equal(PLAY_LABELS.approved, 'Enter River Oaks');
  assert.equal(PLAY_LABELS.waitlist, 'Join the waitlist');
  assert.equal(playLabel({ status: 'approved' }), 'Enter River Oaks');
  for (const status of [{ status: 'pending' }, { status: 'denied' }, { status: 'none' }, { error: 'sign_in_required' }, null, undefined, 'approved'])
    assert.equal(playLabel(status), 'Join the waitlist', JSON.stringify(status));
});

test('the landing page asks the same-origin status once and keeps the waitlist on any failure', async () => {
  const { accessLabel } = await import('../../landing-page/access.js');
  const calls = [], respond = body => async (url, options) => { calls.push([url, options]); return body; };
  assert.equal(await accessLabel(respond({ ok: true, json: async () => ({ status: 'approved' }) })), 'Enter River Oaks');
  assert.deepEqual(calls[0], ['/api/waitlist/status', { credentials: 'same-origin', cache: 'no-store' }]);
  for (const failing of [respond({ ok: false, status: 401, json: async () => ({ error: 'sign_in_required' }) }), async () => { throw new Error('offline'); }, respond({ ok: true, json: async () => { throw new Error('bad json'); } })])
    assert.equal(await accessLabel(failing), 'Join the waitlist');
});

test('every play link is relabelled, including the detail panels\' templates that are not open yet', async () => {
  const { applyPlayLabel } = await import('../../landing-page/access.js');
  const label = () => ({ textContent: 'Join the waitlist' });
  const hero = label(), panelA = label(), panelB = label();
  const fragment = items => ({ querySelectorAll: selector => (selector === '.play-label' ? items : []) });
  const doc = { querySelectorAll: selector => (selector === '.play-label' ? [hero] : selector === 'template' ? [{ content: fragment([panelA]) }, { content: fragment([panelB]) }] : []) };
  applyPlayLabel(doc, 'Enter River Oaks');
  assert.deepEqual([hero, panelA, panelB].map(item => item.textContent), ['Enter River Oaks', 'Enter River Oaks', 'Enter River Oaks']);
});
