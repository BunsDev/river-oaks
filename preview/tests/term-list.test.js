import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fillTermList } from '../src/term-list.js';

test('term lists write names as text, never as markup', () => {
  const ownerDocument = { createElement: tag => ({ tag, textContent: '', title: '' }) };
  const list = { ownerDocument, replaceChildren(...nodes) { this.children = nodes; } };
  const name = '<img src=x onerror=alert(1)>';
  fillTermList(list, [['Selected', name, name], ['Faces', 12]]);
  assert.deepEqual(list.children.map(node => [node.tag, node.textContent, node.title]), [
    ['dt', 'Selected', ''], ['dd', name, name], ['dt', 'Faces', ''], ['dd', '12', ''],
  ]);
});

test('the debug inspector does not build its selection panel from an HTML string', () => {
  const source = readFileSync(new URL('../src/debug-tools.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /innerHTML\s*=\s*`[^`]*\$\{info\./);
  assert.match(source, /fillTermList\(box, \[/);
});
