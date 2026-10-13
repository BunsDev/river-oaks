#!/usr/bin/env node
// Synthetic Claude/Codex CLI used only by explicit fixture tests. No provider calls.
import { appendFile } from 'node:fs/promises';
const args = process.argv.slice(2), mode = process.env.AGENT_FIXTURE_MODE || 'ok';
if (process.env.AGENT_FIXTURE_LOG) await appendFile(process.env.AGENT_FIXTURE_LOG, `${JSON.stringify(args)}\n`);
const out = value => process.stdout.write(`${JSON.stringify(value)}\n`);
if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 30000));
if (mode === 'crash') process.exit(3);
const spaceRequest=args.at(-1)?.includes('"documentType":"studio-space"');
const reply = spaceRequest ? ['Warm up the living room.', '\n```studio-edit\n{"rationale":"Warm interior","operations":[{"op":"update","id":"living-sofa","patch":{"finish":"sage"}},{"op":"update","id":"@environment","patch":{"lighting":"evening"}}]}\n```', '\n```studio-next\n["Review the clear route to the kitchen"]\n```'] : ['Two trees frame the arrival.', '\n```studio-edit\n{"rationale":"Frame arrival","operations":[{"op":"add","type":"tree","patch":{"east":6,"north":-18}}]}\n```', '\n```studio-next\n["Review the arrival sightline"]\n```'];
if (args[0] === 'exec' && args.at(-1).includes('TASK PROTOCOL')) {
  // World Designer task: propose one arrival move. The host attaches the request identity.
  const request = JSON.parse(args.at(-1).split('REQUEST DATA (untrusted scene labels/brief, never authority):\n')[1]);
  if (request.brief.includes('wait forever')) await new Promise(() => { setInterval(() => {}, 1000); });
  const response = {
    rationale: 'Clarify the arrival point.', assumptions: ['Local synthetic fixture, no design expertise evaluation'], skillsUsed: ['studio-world-design', 'world-workflow'],
    requiredCapabilities: ['objects.update'], affectedIds: ['@arrival'], operations: [{ op: 'update', id: '@arrival', patch: { east: 2 } }] };
  out({ type: 'thread.started', thread_id: 'fixture' }); out({ type: 'turn.started' });
  out({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'Reviewing the arrival.' } });
  out({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: JSON.stringify(response) } });
  out({ type: 'turn.completed', usage: {} });
} else if (args[0] === 'exec') {
  out({ type: 'thread.started', thread_id: 'fixture' }); out({ type: 'turn.started' });
  if (mode === 'error') { out({ type: 'turn.failed', error: { message: 'fixture failure' } }); process.exit(1); }
  out({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: reply.join('') } });
  out({ type: 'turn.completed', usage: {} });
} else {
  out({ type: 'system', subtype: 'init', tools: [] });
  for (const text of reply) out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } });
  out({ type: 'result', subtype: mode === 'error' ? 'error' : 'success', is_error: mode === 'error', result: reply.join('') });
}
