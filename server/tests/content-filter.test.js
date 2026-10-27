import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIELDS, contentFilterFromEnv, createContentFilter, defaultContentFilter, findFiltered, maskFiltered, screenText } from '../content-filter.js';

// A short list stands in for the operator's policy: the matching rules are what's tested.
const policy = { refuse: ['blort', 'kill yourself', "i'll end you"], mask: [] };

test('matches whole words after folding case, accents, look-alikes, spacing and run-together letters', () => {
  const filter = createContentFilter(policy);
  for (const text of ['blort', 'You blort!', 'BLORT', 'Blört', 'bl0rt', 'b l o r t', 'blorts', 'B.L.O.R.T', 'Кill yourself', 'killyourself', 'k i l l y o u r s e l f', 'please KILL  YOURSELF now', 'I’ll end you', 'ill end you'])
    assert.equal(filter.screen('chat', text).ok, false, text);
  for (const text of ['blorting', 'unblort', 'blortish', 'kill the lights yourself', 'yourself kill', 'bl0rt3d', '2026', 'hello there', 'I will end this', ''])
    assert.equal(filter.screen('chat', text).ok, true, text);
});

test('a refusal names the field and the first term; masking keeps everything else in place', () => {
  const filter = createContentFilter({ ...policy, mask: ['chat', 'profile'] });
  const chat = filter.screen('chat', 'Hey blort, kill yourself twice');
  assert.deepEqual(chat, { ok: true, text: 'Hey ∗∗∗∗∗, ∗∗∗∗ ∗∗∗∗∗∗∗∗ twice', masked: true });
  assert.equal([...chat.text].length, [...'Hey blort, kill yourself twice'].length);
  const message = filter.screen('message', 'kill yourself');
  assert.deepEqual(message, { ok: false, reason: 'filtered', message: 'That message can’t be sent here.', term: 'kill yourself' });
  assert.equal(filter.screen('username', 'blort').message, 'That name can’t be used here.');
  assert.deepEqual(filter.screen('chat', 'nothing here'), { ok: true, text: 'nothing here' });
  // Accented text masks by the original string's characters, not a decomposed copy.
  assert.equal(filter.screen('profile', 'Café blört café').text, 'Café ∗∗∗∗∗ café');
});

test('fields outside the policy, non-strings and an absent filter pass through', () => {
  const filter = createContentFilter(policy);
  assert.deepEqual(filter.screen('title', 'blort'), { ok: true, text: 'blort' });
  assert.deepEqual(filter.screen('chat', 42), { ok: true, text: 42 });
  assert.deepEqual(screenText(null, 'chat', 'blort'), { ok: true, text: 'blort' });
  assert.equal(screenText(filter, 'chat', 'blort').ok, false);
  assert.deepEqual(FIELDS, ['chat', 'message', 'group', 'event', 'profile', 'username']);
});

test('the default list refuses on every field, and a username can never be masked', () => {
  const filter = defaultContentFilter();
  assert.ok(filter.terms.length >= 10);
  for (const field of FIELDS) assert.equal(filter.screen(field, 'kill yourself').ok, false, field);
  assert.equal(filter.screen('chat', 'Hope you enjoy the garden tonight').ok, true);
  assert.throws(() => createContentFilter({ refuse: ['x'], mask: ['username'] }), /mask fields/);
  assert.throws(() => createContentFilter({ refuse: [''] }), /term/);
  assert.throws(() => createContentFilter({ refuse: 'x' }), /terms/);
});

test('findFiltered and maskFiltered report original ranges, longest phrase first', () => {
  const terms = createContentFilter({ refuse: ['end you', "i'll end you"] });
  const found = terms.check("I'll end you");
  assert.deepEqual(found, [{ term: "i'll end you", start: 0, end: 12, ranges: [[0, 4], [5, 8], [9, 12]] }]);
  assert.equal(maskFiltered("I'll end you", found), '∗∗∗∗ ∗∗∗ ∗∗∗');
  assert.deepEqual(findFiltered('', []), []);
  assert.deepEqual(findFiltered('x'.repeat(5000), []), []);
});

test('the environment turns the filter off or replaces the list from a file', async () => {
  assert.equal(contentFilterFromEnv({ RIVER_OAKS_CONTENT_FILTER: 'off' }), null);
  assert.equal(contentFilterFromEnv({}), defaultContentFilter());
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-filter-'));
  try {
    await writeFile(join(temporary, 'terms.json'), JSON.stringify({ refuse: ['zonk'], mask: ['event'] }));
    const filter = contentFilterFromEnv({ RIVER_OAKS_CONTENT_FILTER_FILE: 'terms.json' }, { cwd: temporary });
    assert.deepEqual(filter.terms, ['zonk']);
    assert.equal(filter.screen('chat', 'kill yourself').ok, true, 'the file replaces the default list');
    assert.deepEqual(filter.screen('event', 'a zonk party'), { ok: true, text: 'a ∗∗∗∗ party', masked: true });
    await writeFile(join(temporary, 'bad.json'), '{"refuse":[1]}');
    assert.throws(() => contentFilterFromEnv({ RIVER_OAKS_CONTENT_FILTER_FILE: 'bad.json' }, { cwd: temporary }));
    assert.throws(() => contentFilterFromEnv({ RIVER_OAKS_CONTENT_FILTER_FILE: 'missing.json' }, { cwd: temporary }));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
