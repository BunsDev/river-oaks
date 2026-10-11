#!/usr/bin/env node
// Synthetic Claude/Codex CLI used only by explicit fixture tests. No provider calls.
import { appendFile } from 'node:fs/promises';
const args = process.argv.slice(2), mode = process.env.AGENT_FIXTURE_MODE || 'ok';
if (process.env.AGENT_FIXTURE_LOG) await appendFile(process.env.AGENT_FIXTURE_LOG, `${JSON.stringify(args)}\n`);
const out = value => process.stdout.write(`${JSON.stringify(value)}\n`);
if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 30000));
if (mode === 'crash') process.exit(3);
const reply = ['Two trees frame the arrival.', '\n```studio-edit\n{"rationale":"Frame arrival","operations":[{"op":"add","type":"tree","patch":{"east":6,"north":-18}}]}\n```', '\n```studio-next\n["Review the arrival sightline"]\n```'];
if (args[0] === 'exec') {
  out({ type: 'thread.started', thread_id: 'fixture' }); out({ type: 'turn.started' });
  if (mode === 'error') { out({ type: 'turn.failed', error: { message: 'fixture failure' } }); process.exit(1); }
  out({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: reply.join('') } });
  out({ type: 'turn.completed', usage: {} });
} else {
  out({ type: 'system', subtype: 'init', tools: [] });
  for (const text of reply) out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } });
  out({ type: 'result', subtype: mode === 'error' ? 'error' : 'success', is_error: mode === 'error', result: reply.join('') });
}
