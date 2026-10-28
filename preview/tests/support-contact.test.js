import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupportContact, supportLink } from '../src/support-contact.js';

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase();this.children = [];this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
}

test('only a real email address or https link is shown', () => {
  for (const value of [undefined, '', '   ', 'support', 'mailto:help@river-oaks.app', 'http://river-oaks.app/help', 'javascript:alert(1)',
    'https://user:pass@river-oaks.app/', 'help@example.com', 'help@support.example.org', 'https://example.com/help', 'https://help.test/', 'a@b', `${'a'.repeat(250)}@river-oaks.app`,
    // A mailto that adds a recipient, a direction override, a trailing-dot or bare-address host.
    'x?bcc=evil%40attacker.com&body=hi@river-oaks.app', 'help\u202e@river-oaks.app', 'https://localhost./', 'https://help.example.com./',
    'https://127.0.0.1/', 'https://[::1]/', 'https://river-oaks.app./support'])
    assert.equal(supportLink(value), null, `nothing for ${value}`);
  assert.deepEqual(supportLink('first.last+help@river-oaks.app'), { href: 'mailto:first.last+help@river-oaks.app', text: 'first.last+help@river-oaks.app' });
  assert.deepEqual(supportLink(' help@river-oaks.app '), { href: 'mailto:help@river-oaks.app', text: 'help@river-oaks.app' });
  assert.deepEqual(supportLink('https://river-oaks.app/support'), { href: 'https://river-oaks.app/support', text: 'river-oaks.app/support' });
  assert.deepEqual(supportLink('https://river-oaks.app/'), { href: 'https://river-oaks.app/', text: 'river-oaks.app' });
});

test('Settings shows the contact under Support, and nothing without one', t => {
  const prior = globalThis.document;t.after(() => { globalThis.document = prior; });
  globalThis.document = { createElement: tag => new Element(tag) };
  assert.equal(createSupportContact(''), null);
  const mail = createSupportContact('help@river-oaks.app'), [heading, line] = mail.children, anchor = line.children[0];
  assert.deepEqual([heading.textContent, line.textContent, anchor.href, anchor.textContent, anchor.target], ['Support', 'Questions, problems or safety concerns: ', 'mailto:help@river-oaks.app', 'help@river-oaks.app', undefined]);
  const web = createSupportContact('https://river-oaks.app/support').children[1].children[0];
  assert.deepEqual([web.target, web.rel], ['_blank', 'noopener noreferrer']);
});
