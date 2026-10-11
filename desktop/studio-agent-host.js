import { mkdir, lstat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { runStudioCommand } from './studio-command.js';
import { STUDIO_AGENT_GUIDE, studioAgentPrompt } from './studio-agent-guide.js';
import { sanitizeSceneContext, normalizeText } from './studio-scene-context.js';
import { codexArgs } from './studio-codex.js';

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
export const STUDIO_AGENT_PROVIDERS = {
  claude: { name: 'Claude', command: 'claude', env: 'RIVER_OAKS_AGENT_CLAUDE',
    models: [{ id: 'claude-opus-5-5', label: 'Opus 5.5' }, { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' }, { id: 'claude-haiku-5-5', label: 'Haiku 5.5' }],
    // No tools, slash commands, MCP servers, settings sources (so no CLAUDE.md) or saved sessions.
    args: ({ model, prompt }) => ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', model,
      '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '', '--disable-slash-commands', '--system-prompt', STUDIO_AGENT_GUIDE, '--tools', '', '--', prompt] },
  codex: { name: 'Codex', command: 'codex', env: 'RIVER_OAKS_AGENT_CODEX',
    models: [{ id: 'default', label: 'Codex' }],
    // Tool-less: see studio-codex.js for why the read-only sandbox alone is not enough.
    args: ({ model, prompt, workspace }) => codexArgs({ model, workspace, prompt: `${STUDIO_AGENT_GUIDE}\n\n${prompt}` }) },
};

// GUI launches often miss the shell PATH, so common user install locations are searched too.
export async function resolveExecutable(command, { env = process.env, extra = [join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'] } = {}) {
  for (const dir of [...(env.PATH || '').split(delimiter), ...extra].filter(Boolean)) {
    const path = join(dir, command);
    try { await access(path, constants.X_OK); return path; } catch { /* Try the next directory. */ }
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
      if (failed) throw Error(failed);
      if (!final?.trim()) throw Error('The agent returned an incomplete response.');
      return final;
    },
  };
}

export function createStudioAgentHost({ root, env = process.env, execute = runStudioCommand, resolve = resolveExecutable, confirm = async () => false, timeout = 180000 }) {
  const chats = new Map(), active = new Map(), consented = new Set(), sent = [];
  let executables = null;
  async function locate() {
    if (!executables) {
      executables = {};
      for (const [id, provider] of Object.entries(STUDIO_AGENT_PROVIDERS)) executables[id] = env[provider.env] || await resolve(provider.command, { env });
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
        || typeof input.message !== 'string' || !input.message.trim() || input.message.length > MAX_MESSAGE || Buffer.byteLength(JSON.stringify(input.context ?? null)) > MAX_CONTEXT) throw Error('Invalid agent message.');
      // One reply at a time across every chat, so one user gesture cannot fan out into many runs.
      if (active.size) throw Error('The agent is still answering. Wait or stop it first.');
      const now = Date.now();
      while (sent.length && now - sent[0] > RATE.windowMs) sent.shift();
      if (sent.length >= RATE.sends) throw Error('Too many agent messages in the last few minutes. Wait a moment and try again.');
      // Counted before the first await, so a burst of direct calls cannot all pass the check.
      sent.push(now);
      const message = normalizeText(input.message);
      if (!message) throw Error('Invalid agent message.');
      // Claim the chat before the first await so overlapping sends cannot both start.
      const control = new AbortController(); active.set(input.chatId, { requestId: input.requestId, control });
      try {
        const executable = (await locate())[input.providerId];
        if (!executable) throw Error(`${provider.name} CLI was not found. Install it, sign in, or set ${provider.env} to its path.`);
        if (!consented.has(input.providerId)) {
          if (!await confirm({ providerId: input.providerId, name: provider.name })) throw Error('Agent chat canceled.');
          consented.add(input.providerId);
        }
        if (control.signal.aborted) throw Error('Agent reply stopped.');
        const workspace = join(root, input.providerId);
        await mkdir(workspace, { recursive: true, mode: 0o700 });
        const stat = await lstat(workspace); if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Agent workspace must be a private directory.');
        const history = transcript(input.chatId);
        const prompt = studioAgentPrompt({ history, message, context: sanitizeSceneContext(input.context), mode: input.mode });
        let forwarded = 0;
        const reader = createStreamReader(input.providerId, delta => {
          const part = capBytes(delta, MAX_REPLY - forwarded); forwarded += part.used;
          if (part.text) onDelta(part.text);
        });
        const extraPath = [join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'].join(delimiter);
        try {
          await execute(executable, provider.args({ model: input.modelId, prompt, workspace }), { cwd: workspace, env: { ...env, PATH: `${env.PATH || ''}${delimiter}${extraPath}` },
            signal: control.signal, timeout, maxBytes: 8 * 1024 * 1024, onStdout: chunk => reader.push(chunk) });
        } catch (error) {
          if (control.signal.aborted) throw Error('Agent reply stopped.');
          if (/timed out/.test(error.message)) throw Error(`${provider.name} did not answer in time.`);
          throw Error(`${provider.name} CLI failed. Check that it is signed in on this device.`);
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
