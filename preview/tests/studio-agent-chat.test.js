import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioDocument } from '../src/studio/document.js';
import { createDesignerSession, DESIGNER_CAPABILITIES } from '../src/studio/designer-protocol.js';
import { parseAgentReply, proposalEnvelope, describeChange, starterPrompts } from '../src/studio/agent-chat.js';
const reply = 'Frame the arrival.\n\n```studio-edit\n{"rationale":"Frame arrival","operations":[{"op":"add","type":"tree","patch":{"east":6,"north":-18,"height":7,"radius":3}},{"op":"update","id":"@arrival","patch":{"east":2}}]}\n```\n\n```studio-next\n["Review the arrival sightline","Add a bench","Check spacing","Too many"]\n```';
function begin(doc) { const session = createDesignerSession(doc); session.connect({ id: 'chat', projectId: 'studio-agent', packVersion: 'agent-chat-1', capabilities: DESIGNER_CAPABILITIES }); return { session, request: session.begin({ brief: 'Plant trees', scope: 'region' }) }; }

test('replies split into prose, one edit and at most three next steps', () => {
  const parsed = parseAgentReply(reply);
  assert.equal(parsed.body, 'Frame the arrival.'); assert.equal(parsed.edit.operations.length, 2);
  assert.deepEqual(parsed.next, ['Review the arrival sightline', 'Add a bench', 'Check spacing']);
  assert.equal(parseAgentReply('Working on it\n```studio-edit\n{"rationale":', { streaming: true }).body, 'Working on it');
  assert.match(parseAgentReply('x\n```studio-edit\n{bad json}\n```').editError, /could not read/);
});

test('agent operations become a validated proposal that applies as one undoable edit', () => {
  const doc = createStudioDocument(), before = doc.serialize(), { session, request } = begin(doc);
  const envelope = proposalEnvelope(request, parseAgentReply(reply).edit, doc);
  assert.deepEqual(envelope.affectedIds.sort(), ['@arrival', 'tree-1']); assert.deepEqual(envelope.requiredCapabilities.sort(), ['objects.add', 'objects.update']);
  const preview = session.preview(envelope);
  assert.equal(doc.serialize(), before, 'preview is detached');
  assert.deepEqual(preview.changes.map(describeChange), ['Add tree tree-1 at 6, -18 m', 'Change @arrival: east 0 → 2']);
  session.apply(); assert.equal(doc.value.trees.length, 1); assert.equal(doc.value.spawn[0], 2);
  doc.undo(); assert.equal(doc.serialize(), before);
});

test('invalid or stale agent proposals never touch the draft', () => {
  const doc = createStudioDocument(), before = doc.serialize();
  for (const operations of [[{ op: 'remove', id: '@arrival' }], [{ op: 'update', id: '@arrival', patch: { east: 9999 } }], [{ op: 'eval', code: 'alert(1)' }], [{ op: 'add', type: 'tree', patch: { colour: 'red' } }]]) {
    const { session, request } = begin(doc);
    assert.throws(() => session.preview(proposalEnvelope(request, { operations }, doc)));
  }
  assert.throws(() => proposalEnvelope({}, { rationale: 'none' }, doc), /no operations/);
  const { session, request } = begin(doc);
  session.preview(proposalEnvelope(request, { operations: [{ op: 'update', id: '@arrival', patch: { east: 3 } }] }, doc));
  doc.update('@arrival', { north: -10 });
  assert.throws(() => session.apply(), /changed/);
  doc.undo(); assert.equal(doc.serialize(), before);
});

test('starter prompts follow the region contents', () => {
  const doc = createStudioDocument();
  assert.deepEqual(starterPrompts(doc), ['Add a landmark building near the arrival', 'Plant trees along Main Walk', 'Check the arrival and wayfinding']);
  doc.add('building');
  assert.equal(starterPrompts(doc)[0], 'Review building scale and spacing');
});
