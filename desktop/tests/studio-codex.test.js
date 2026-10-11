import test from 'node:test';
import assert from 'node:assert/strict';
import { codexArgs, lastCodexMessage, CODEX_DISABLED } from '../studio-codex.js';

const encode = events => events.map(event => JSON.stringify(event)).join('\n');
const message = text => ({ type: 'item.completed', item: { type: 'agent_message', text } });

test('codex runs read-only, ephemeral, without user config and with every tool feature off', () => {
  const args = codexArgs({ prompt: 'p', workspace: '/w' });
  assert.deepEqual(args.slice(0, 8), ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules']);
  const disabled = args.flatMap((arg, i) => args[i - 1] === '--disable' ? [arg] : []);
  assert.deepEqual(disabled, CODEX_DISABLED);
  for (const feature of ['shell_tool', 'unified_exec', 'code_mode_host', 'multi_agent', 'apps', 'plugins', 'browser_use', 'computer_use']) assert.ok(disabled.includes(feature), feature);
  assert.ok(args.includes('web_search="disabled"'));
  assert.deepEqual(args.slice(-2), ['--', 'p']); assert.ok(!args.includes('-m'));
  assert.deepEqual(codexArgs({ model: 'gpt-x', prompt: 'p', workspace: '/w' }).slice(-4), ['-m', 'gpt-x', '--', 'p']);
});

test('the last agent message of a completed turn is the answer', () => {
  // Item-level errors are config warnings; only a failed turn or top-level error fails.
  assert.equal(lastCodexMessage(encode([{ type: 'thread.started' }, { type: 'item.completed', item: { type: 'error', message: 'config warning' } },
    message('Working on it.'), message('{"ok":true}'), { type: 'turn.completed' }])), '{"ok":true}');
  assert.throws(() => lastCodexMessage(encode([message('{}')])), /incomplete/);
  assert.throws(() => lastCodexMessage(encode([{ type: 'turn.completed' }])), /incomplete/);
  assert.throws(() => lastCodexMessage(encode([message('{}'), { type: 'turn.failed', error: { message: 'x' } }])), /error/);
});
