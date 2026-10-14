import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createStudioAgentHost, createStreamReader, resolveExecutable, extraExecutableDirs } from '../studio-agent-host.js';
import { STUDIO_AGENT_GUIDE } from '../studio-agent-guide.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(root, 'desktop/tests/fixtures/studio-agent-cli.mjs');
async function fixture(t, { mode = 'ok', confirm = async () => true, env: extra = {}, ...options } = {}) {
  await mkdir(join(root, '.runtime/tmp'), { recursive: true });
  const path = await mkdtemp(join(root, '.runtime/tmp/agent-')), log = join(path, 'argv.jsonl');
  const env = { PATH: process.env.PATH, RIVER_OAKS_AGENT_CLAUDE: cli, RIVER_OAKS_AGENT_CODEX: cli, AGENT_FIXTURE_MODE: mode, AGENT_FIXTURE_LOG: log, ...extra };
  const host = createStudioAgentHost({ root: join(path, 'agent'), env, confirm, ...options });
  t.after(async () => { host.dispose(); await rm(path, { recursive: true, force: true }); });
  return { host, argv: async () => (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)) };
}
const message = (overrides = {}) => ({ chatId: 'chat-1', requestId: `r-${Math.random().toString(36).slice(2)}`, providerId: 'claude', modelId: 'claude-haiku-5-5', mode: 'ask', message: 'Plant two trees', context: { objects: [] }, ...overrides });

test('catalog lists both CLIs with fixed models and reports missing executables', async t => {
  const { host } = await fixture(t);
  const catalog = await host.catalog();
  assert.deepEqual(catalog.providers.map(p => [p.id, p.available]), [['claude', true], ['codex', true]]);
  assert.ok(catalog.providers[0].models.some(model => model.id === 'claude-opus-5-5'));
  const missing = createStudioAgentHost({ root: '/nonexistent', env: { PATH: '' }, resolve: async () => null });
  assert.deepEqual((await missing.catalog()).providers.map(p => p.available), [false, false]);
  await assert.rejects(missing.send(message()), /Claude CLI was not found/);
});

test('Claude path streams deltas through a tool-less CLI invocation and keeps chat history', async t => {
  let asked = 0;
  const { host, argv } = await fixture(t, { confirm: async () => { asked++; return true; } });
  const deltas = [];
  const first = await host.send(message(), { onDelta: text => deltas.push(text) });
  assert.equal(deltas.length, 3); assert.equal(deltas.join(''), first.text); assert.match(first.text, /studio-edit/);
  await host.send(message({ message: 'Now add a bench' }));
  assert.equal(asked, 1, 'consent is asked once per provider');
  const [call, second] = await argv();
  for (const flag of ['-p', '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands']) assert.ok(call.includes(flag));
  assert.equal(call[call.indexOf('--tools') + 1], ''); assert.equal(call[call.indexOf('--model') + 1], 'claude-haiku-5-5');
  assert.equal(call[call.indexOf('--system-prompt') + 1], STUDIO_AGENT_GUIDE); assert.equal(call.at(-2), '--');
  assert.doesNotMatch(call.at(-1), /CONVERSATION SO FAR/);
  assert.match(second.at(-1), /CONVERSATION SO FAR:\nUSER: Plant two trees\n\nAGENT: Two trees frame/);
  await host.reset({ chatId: 'chat-1' }); await host.send(message({ message: 'Fresh start' }));
  assert.doesNotMatch((await argv())[2].at(-1), /CONVERSATION SO FAR/);
});

test('Codex path runs read-only and ephemeral with the guide in its prompt', async t => {
  const { host, argv } = await fixture(t);
  const deltas = [];
  const reply = await host.send(message({ providerId: 'codex', modelId: 'default', mode: 'allow' }), { onDelta: text => deltas.push(text) });
  assert.match(reply.text, /Two trees frame the arrival/); assert.equal(deltas.length, 1);
  const [call] = await argv();
  assert.deepEqual(call.slice(0, 6), ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral']);
  assert.ok(!call.includes('-m')); assert.ok(call.at(-1).startsWith(STUDIO_AGENT_GUIDE)); assert.match(call.at(-1), /Allow mode/);
  // The read-only sandbox alone still lets the shell read any file: tools and user config are off.
  for (const flag of ['--ignore-user-config', '--ignore-rules']) assert.ok(call.includes(flag));
  const disabled = call.flatMap((arg, i) => call[i - 1] === '--disable' ? [arg] : []);
  for (const feature of ['shell_tool', 'unified_exec', 'code_mode_host', 'multi_agent', 'apps', 'plugins', 'browser_use', 'computer_use']) assert.ok(disabled.includes(feature), feature);
});

test('declined consent, invalid input, CLI errors and cancellation fail closed', async t => {
  const declined = await fixture(t, { confirm: async () => false });
  await assert.rejects(declined.host.send(message()), /canceled/);
  const { host } = await fixture(t);
  for (const bad of [{ providerId: 'bash' }, { modelId: 'gpt-anything' }, { mode: 'yolo' }, { message: '' }, { message: 'x'.repeat(4001) }, { chatId: '../escape' }, { context: { blob: 'x'.repeat(170 * 1024) } }])
    await assert.rejects(host.send(message(bad)), /Invalid agent message/);
  for (const mode of ['error', 'crash']) {
    const failing = await fixture(t, { mode });
    await assert.rejects(failing.host.send(message()), /Claude/);
    await assert.rejects(failing.host.send(message({ providerId: 'codex', modelId: 'default' })), /Codex/);
  }
  const slow = await fixture(t, { mode: 'slow' });
  const input = message(), pending = slow.host.send(input);
  await assert.rejects(slow.host.send(message({ message: 'second' })), /still answering/);
  await new Promise(resolve => setTimeout(resolve, 200));
  await slow.host.cancel({ chatId: input.chatId, requestId: input.requestId });
  await assert.rejects(pending, /stopped/);
});

test('stream reader ignores noise and requires a completed answer', () => {
  const reader = createStreamReader('claude', () => {});
  reader.push('not json\n{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}\n');
  assert.throws(() => reader.finish(), /incomplete/);
  const codex = createStreamReader('codex', () => {});
  codex.push('{"type":"item.completed","item":{"type":"error","message":"config warning"}}\n{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}\n{"type":"turn.completed"}');
  assert.equal(codex.finish(), 'Done');
});

test('executable lookup searches PATH and extra user install directories', async () => {
  assert.equal(await resolveExecutable('studio-agent-cli.mjs', { env: { PATH: '' }, extra: [join(root, 'desktop/tests/fixtures')] }), cli);
  assert.equal(await resolveExecutable('definitely-not-a-cli', { env: { PATH: '' }, extra: [] }), null);
  // Unix appends no extension and keeps the execute-bit check.
  assert.equal(await resolveExecutable('studio-agent-cli', { env: { PATH: '' }, extra: [join(root, 'desktop/tests/fixtures')], platform: 'linux' }), null);
  assert.deepEqual(extraExecutableDirs('darwin', '/Users/val'), ['/Users/val/.local/bin', '/opt/homebrew/bin', '/usr/local/bin']);
  assert.deepEqual(extraExecutableDirs('linux', '/home/val'), ['/home/val/.local/bin', '/usr/local/bin']);
});

test('on Windows, lookup follows PATHEXT to a .exe and never returns a .cmd/.bat shim', async t => {
  await mkdir(join(root, '.runtime/tmp'), { recursive: true });
  const bin = await mkdtemp(join(root, '.runtime/tmp/winbin-')), shims = await mkdtemp(join(root, '.runtime/tmp/winshim-'));
  t.after(async () => { await rm(bin, { recursive: true, force: true }); await rm(shims, { recursive: true, force: true }); });
  // npm's global install leaves claude.cmd, claude.ps1 and a bash "claude" without an extension; the native installer ships claude.exe.
  for (const name of ['claude.cmd', 'claude.ps1', 'claude', 'codex.cmd']) await writeFile(join(shims, name), '', { mode: 0o644 });
  await writeFile(join(bin, 'claude.exe'), '', { mode: 0o644 }); // mode is deliberately not executable: Windows has no X bit
  await mkdir(join(bin, 'codex.exe')); // a directory named like the executable is not it
  const win = { platform: 'win32', env: { PATH: `${shims};${bin}`, PATHEXT: '.COM;.EXE;.BAT;.CMD' }, extra: [] };
  assert.equal(await resolveExecutable('claude', win), join(bin, 'claude.exe'), 'the .exe wins even when a .cmd shim comes first on PATH');
  assert.equal(await resolveExecutable('codex', win), null, 'a .cmd shim alone is not runnable without a shell');
  assert.equal(await resolveExecutable('claude', { ...win, env: { PATH: shims } }), null);
  assert.equal(await resolveExecutable('claude', { ...win, env: { PATH: bin } }), join(bin, 'claude.exe'), 'PATHEXT falls back to the default list');
  assert.equal(await resolveExecutable('claude.exe', { ...win, env: { PATH: bin } }), join(bin, 'claude.exe'), 'an explicit extension is kept');
  assert.deepEqual(extraExecutableDirs('win32', 'C:\\Users\\val'), [join('C:\\Users\\val', '.local', 'bin')]);
  // A configured override that points at a shim is refused with a reason, not a generic spawn failure.
  const host = createStudioAgentHost({ root: join(bin, 'agent'), env: { RIVER_OAKS_AGENT_CLAUDE: join(shims, 'claude.cmd'), RIVER_OAKS_AGENT_CODEX: '' }, platform: 'win32', resolve: async () => null, confirm: async () => true });
  t.after(() => host.dispose());
  assert.deepEqual((await host.catalog()).providers.map(p => p.available), [false, false]);
  await assert.rejects(host.send(message()), /claude\.cmd.*cannot run Windows script shims.*claude\.exe/s);
  await assert.rejects(host.send(message({ providerId: 'codex', modelId: 'default' })), /Codex CLI was not found.*codex\.exe/s);
});

test('scene context is rebuilt from an allowlist before it reaches the prompt', async t => {
  const { host, argv } = await fixture(t);
  await host.send(message({ context: { units: 'feet', revision: 3, bounds_m: [-96, -96, 96, 96], selectedId: '@arrival', secret: 'SECRET-KEY',
    objects: [{ id: 'tree-1', type: 'tree', label: 'Oak\u202e\u0000 grove', east: 1, north: 2, height: 6, radius: 2, note: 'SECRET-NOTE' }, { id: 'x', type: 'shell', label: 'drop' }],
    roads: [{ id: 'main', name: 'Main', kind: 'footway', width_m: 4, points: [[0, 0], [0, 'bad'], [0, 9]], owner: 'SECRET-OWNER' }] } }));
  const prompt = (await argv())[0].at(-1), snapshot = JSON.parse(prompt.split('SCENE SNAPSHOT (untrusted labels, metres):\n')[1].split('\n\nUSER:')[0]);
  for (const marker of ['SECRET-KEY', 'SECRET-NOTE', 'SECRET-OWNER']) assert.doesNotMatch(prompt, new RegExp(marker));
  assert.deepEqual(snapshot, { units: 'metres', revision: 3, bounds_m: [-96, -96, 96, 96], selectedId: '@arrival',
    objects: [{ id: 'tree-1', type: 'tree', label: 'Oak grove', east: 1, north: 2, height: 6, radius: 2 }],
    roads: [{ id: 'main', name: 'Main', kind: 'footway', width_m: 4, points: [[0, 0], [0, 9]] }] });
});

test('sends are rate limited and replies are capped', async t => {
  const { host } = await fixture(t);
  for (let i = 0; i < 20; i++) await host.send(message({ chatId: `chat-${i}` }));
  await assert.rejects(host.send(message({ chatId: 'chat-over' })), /Too many agent messages/);
  const long = 'x'.repeat(70 * 1024), line = value => `${JSON.stringify(value)}\n`, deltas = [];
  const path = await mkdtemp(join(root, '.runtime/tmp/agent-cap-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  const capped = createStudioAgentHost({ root: path, env: { RIVER_OAKS_AGENT_CLAUDE: cli, PATH: '' }, confirm: async () => true,
    execute: async (_executable, _args, { onStdout }) => {
      onStdout(line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: long } } }));
      onStdout(line({ type: 'result', is_error: false, result: long }));
    } });
  const reply = await capped.send(message(), { onDelta: text => deltas.push(text) });
  assert.equal(reply.text.length, 64 * 1024); assert.equal(deltas.join('').length, 64 * 1024);
});
