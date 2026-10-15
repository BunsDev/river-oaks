import { mkdir, lstat, access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { runStudioCommand } from './studio-command.js';
import { STUDIO_AGENT_GUIDE, studioAgentPrompt } from './studio-agent-guide.js';
import { sanitizeSceneContext, normalizeText } from './studio-scene-context.js';
import { codexArgs } from './studio-codex.js';
import { HostError } from './host-error.js';

const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const validId = value => typeof value === 'string' && idPattern.test(value);
const MAX_MESSAGE = 4000, MAX_CONTEXT = 160 * 1024, MAX_TRANSCRIPT = 48 * 1024, MAX_CHATS = 8, MAX_REPLY = 64 * 1024;
// UTF-8 byte budget, cut on a code point boundary.
function capBytes(text, budget) {
  let used = 0, out = '';
  for (const char of text) { const size = Buffer.byteLength(char); if (used + size > budget) break; used += size; out += char; }
  return { text: out, used };
}
// A page script cannot spend the user's provider quota faster than a person chats.
const RATE = { sends: 20, windowMs: 10 * 60 * 1000 };

// Executables, argv and models are fixed here. The renderer picks only IDs from this table.
// The prompt is never an argument: `input` builds what the CLI reads on stdin.
export const STUDIO_AGENT_PROVIDERS = {
  claude: { name: 'Claude', command: 'claude', env: 'RIVER_OAKS_AGENT_CLAUDE',
    models: [{ id: 'claude-opus-5-5', label: 'Opus 5.5' }, { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' }, { id: 'claude-haiku-5-5', label: 'Haiku 5.5' }],
    // No tools, slash commands, MCP servers, settings sources (so no CLAUDE.md) or saved sessions.
    // With no prompt argument, -p reads the prompt from stdin.
    args: ({ model }) => ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', model,
      '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '', '--disable-slash-commands', '--system-prompt', STUDIO_AGENT_GUIDE, '--tools', ''],
    input: prompt => prompt },
  codex: { name: 'Codex', command: 'codex', env: 'RIVER_OAKS_AGENT_CODEX',
    models: [{ id: 'default', label: 'Codex' }],
    // Tool-less: see studio-codex.js for why the read-only sandbox alone is not enough.
    args: ({ model, workspace }) => codexArgs({ model, workspace }),
    input: prompt => `${STUDIO_AGENT_GUIDE}\n\n${prompt}` },
};

// GUI launches often miss the shell PATH, so common user install locations are searched too.
export function extraExecutableDirs(platform = process.platform, home = homedir()) {
  if (platform === 'win32') return [join(home, '.local', 'bin')];
  return [join(home, '.local/bin'), ...(platform === 'darwin' ? ['/opt/homebrew/bin'] : []), '/usr/local/bin'];
}
const pathDelimiter = platform => platform === 'win32' ? ';' : ':';
export const extraExecutablePath = (platform = process.platform) => extraExecutableDirs(platform).join(pathDelimiter(platform));
// Windows has no execute bit; PATHEXT names what the shell would run. Only .exe and
// .com can be spawned without a shell. npm's .cmd/.bat shims (and .ps1) need cmd.exe
// or PowerShell, which would parse the prompt text, so they are never selected.
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD', SPAWNABLE = ['.exe', '.com'];
const extensionOf = path => /\.[^\\/.]+$/.exec(path)?.[0].toLowerCase() ?? '';
export const windowsShim = path => ['.cmd', '.bat', '.ps1'].includes(extensionOf(path));
export function missingExecutableMessage(name, command, env, platform = process.platform) {
  return platform === 'win32'
    ? `${name} CLI was not found. Install the native ${command}.exe, sign in, or set ${env} to its path. Studio cannot run Windows script shims (${command}.cmd).`
    : `${name} CLI was not found. Install it, sign in, or set ${env} to its path.`;
}
export async function resolveExecutable(command, { env = process.env, platform = process.platform, extra = extraExecutableDirs(platform) } = {}) {
  const windows = platform === 'win32';
  const names = dir => {
    if (!windows || extensionOf(command)) return [join(dir, command)];
    return (env.PATHEXT || DEFAULT_PATHEXT).split(';').map(ext => ext.toLowerCase()).filter(ext => SPAWNABLE.includes(ext)).map(ext => join(dir, command + ext));
  };
  for (const dir of [...(env.PATH || '').split(pathDelimiter(platform)), ...extra].filter(Boolean)) {
    for (const path of names(dir)) {
      try {
        if (windows) { if (!windowsShim(path) && SPAWNABLE.includes(extensionOf(path)) && (await stat(path)).isFile()) return path; }
        else { await access(path, constants.X_OK); if ((await stat(path)).isFile()) return path; }
      } catch { /* Try the next candidate. */ }
    }
  }
  return null;
}

// Turns one CLI's JSON-lines stdout into text deltas and a final answer.
export function createStreamReader(providerId, onDelta) {
  let buffer = '', text = '', final = null, failed = null;
  const line = raw => {
    if (!raw.trim()) return;
    let event; try { event = JSON.parse(raw); } catch { return; }
    if (providerId === 'claude') {
      const delta = event.type === 'stream_event' && event.event?.type === 'content_block_delta' && event.event.delta?.type === 'text_delta' ? event.event.delta.text : null;
      if (typeof delta === 'string') { text += delta; onDelta(delta); }
      if (event.type === 'result') { if (event.is_error) failed = 'Claude reported an error. Check its sign-in and usage limits.'; else final = typeof event.result === 'string' ? event.result : text; }
    } else {
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
        const delta = (text ? '\n\n' : '') + event.item.text; text += delta; onDelta(delta);
      }
      if (event.type === 'turn.failed' || event.type === 'error') failed = 'Codex reported an error. Check its sign-in and usage limits.';
      if (event.type === 'turn.completed') final = text;
    }
  };
  return {
    push(chunk) { buffer += chunk; const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(line); },
    finish() {
      line(buffer); buffer = '';
      if (failed) throw new HostError(failed);
      if (!final?.trim()) throw new HostError('The agent returned an incomplete response.');
      return final;
    },
  };
}

export function createStudioAgentHost({ root, env = process.env, platform = process.platform, execute = runStudioCommand, resolve = resolveExecutable, confirm = async () => false, timeout = 180000 }) {
  const chats = new Map(), active = new Map(), consented = new Set(), sent = [], unavailable = {};
  let executables = null;
  async function locate() {
    if (!executables) {
      executables = {};
      for (const [id, provider] of Object.entries(STUDIO_AGENT_PROVIDERS)) {
        const configured = env[provider.env];
        if (configured && platform === 'win32' && windowsShim(configured)) {
          // A configured shim would fail at spawn with no useful message; say why up front.
          unavailable[id] = `${provider.env} points at ${configured}, but Studio cannot run Windows script shims (.cmd, .bat, .ps1) without a shell. Point it at ${provider.command}.exe instead.`;
          executables[id] = null;
        } else executables[id] = configured || await resolve(provider.command, { env, platform });
      }
    }
    return executables;
  }
  function transcript(chatId) {
    if (!chats.has(chatId)) { chats.set(chatId, []); if (chats.size > MAX_CHATS) chats.delete(chats.keys().next().value); }
    return chats.get(chatId);
  }
  return {
    async catalog() {
      const found = await locate();
      return { providers: Object.entries(STUDIO_AGENT_PROVIDERS).map(([id, provider]) => ({ id, name: provider.name, available: Boolean(found[id]), models: provider.models })),
        modes: [{ id: 'ask', label: 'Ask mode' }, { id: 'allow', label: 'Allow mode' }] };
    },
    async send(input, { onDelta = () => {} } = {}) {
      const provider = STUDIO_AGENT_PROVIDERS[input?.providerId];
      if (!provider || !validId(input.chatId) || !validId(input.requestId) || !provider.models.some(model => model.id === input.modelId) || !['ask', 'allow'].includes(input.mode)
        || typeof input.message !== 'string' || !input.message.trim() || input.message.length > MAX_MESSAGE || Buffer.byteLength(JSON.stringify(input.context ?? null)) > MAX_CONTEXT) throw new HostError('Invalid agent message.');
      // One reply at a time across every chat, so one user gesture cannot fan out into many runs.
      // A reply already stopped (New chat, Stop) is only cleaning up and does not count.
      if ([...active.values()].some(run => !run.control.signal.aborted)) throw new HostError('The agent is still answering. Wait or stop it first.');
      const now = Date.now();
      while (sent.length && now - sent[0] > RATE.windowMs) sent.shift();
      if (sent.length >= RATE.sends) throw new HostError('Too many agent messages in the last few minutes. Wait a moment and try again.');
      // Counted before the first await, so a burst of direct calls cannot all pass the check.
      sent.push(now);
      const message = normalizeText(input.message);
      if (!message) throw new HostError('Invalid agent message.');
      // Claim the chat before the first await so overlapping sends cannot both start.
      const control = new AbortController(); active.set(input.chatId, { requestId: input.requestId, control });
      try {
        const executable = (await locate())[input.providerId];
        if (!executable) throw new HostError(unavailable[input.providerId] ?? missingExecutableMessage(provider.name, provider.command, provider.env, platform));
        if (!consented.has(input.providerId)) {
          if (!await confirm({ providerId: input.providerId, name: provider.name })) throw new HostError('Agent chat canceled.');
          consented.add(input.providerId);
        }
        if (control.signal.aborted) throw new HostError('Agent reply stopped.');
        const workspace = join(root, input.providerId);
        await mkdir(workspace, { recursive: true, mode: 0o700 });
        const stat = await lstat(workspace); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new HostError('Agent workspace must be a private directory.');
        const history = transcript(input.chatId);
        const prompt = studioAgentPrompt({ history, message, context: sanitizeSceneContext(input.context), mode: input.mode });
        let forwarded = 0;
        const reader = createStreamReader(input.providerId, delta => {
          const part = capBytes(delta, MAX_REPLY - forwarded); forwarded += part.used;
          if (part.text) onDelta(part.text);
        });
        try {
          await execute(executable, provider.args({ model: input.modelId, workspace }), { cwd: workspace, env: { ...env, PATH: `${env.PATH || ''}${pathDelimiter(platform)}${extraExecutablePath(platform)}` },
            signal: control.signal, timeout, maxBytes: 8 * 1024 * 1024, onStdout: chunk => reader.push(chunk), input: provider.input(prompt) });
        } catch (error) {
          if (control.signal.aborted) throw new HostError('Agent reply stopped.');
          if (/timed out/.test(error.message)) throw new HostError(`${provider.name} did not answer in time.`);
          throw new HostError(`${provider.name} CLI failed. Check that it is signed in on this device.`);
        }
        const text = capBytes(reader.finish(), MAX_REPLY).text;
        history.push({ role: 'user', text: message }, { role: 'agent', text });
        while (history.length > 2 && Buffer.byteLength(JSON.stringify(history)) > MAX_TRANSCRIPT) history.splice(0, 2);
        return { requestId: input.requestId, text };
      } finally { if (active.get(input.chatId)?.requestId === input.requestId) active.delete(input.chatId); }
    },
    async cancel({ chatId, requestId } = {}) { const run = active.get(chatId); if (run?.requestId === requestId) run.control.abort(); return { canceled: true }; },
    async reset({ chatId } = {}) { active.get(chatId)?.control.abort(); chats.delete(chatId); return { reset: true }; },
    dispose() { for (const run of active.values()) run.control.abort(); active.clear(); chats.clear(); },
  };
}
