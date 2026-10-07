import test from 'node:test';
import assert from 'node:assert/strict';
import { VISITOR_FORMS, formFor, visitorGreeting } from '../src/visitor-persona.js';

test('Jevica is the sole playable character with a rig and a reaction', () => {
  assert.deepEqual(VISITOR_FORMS.map(form => form.id), ['jevica']);
  for (const form of VISITOR_FORMS) {
    assert.ok(Number.isInteger(form.avatar) && form.avatar >= 0 && form.avatar < 6, form.id);
    assert.equal(form.reaction, 'acknowledge', form.id);
    assert.match(visitorGreeting({ id: 'local-01', indoor: false }, form.id), /Welcome to the neighborhood\.$/);
  }
  for(const retired of ['alien','witch','dorothy']) assert.equal(formFor(retired), null);
  assert.equal(visitorGreeting({ id: 'local-01' }, 'visitor'), null);
});
