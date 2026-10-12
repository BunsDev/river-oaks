import test from 'node:test';
import assert from 'node:assert/strict';
import { HostError, publicError } from '../host-error.js';
import { createStudioAgentHost } from '../studio-agent-host.js';
import { createStudioDesignerHost } from '../studio-designer-host.js';
import { runStudioCommand } from '../studio-command.js';
import { lastCodexMessage } from '../studio-codex.js';

test('only host-written messages reach the page', () => {
  assert.equal(publicError(new HostError('Design request canceled.'), 'fallback').message, 'Design request canceled.');
  let parse; try { JSON.parse('{"secret": model output'); } catch (error) { parse = error; }
  const filesystem = Object.assign(new Error("ENOENT: no such file or directory, open '/Users/someone/private'"), { code: 'ENOENT' });
  for (const error of [parse, filesystem, new Error('Designer host saw /Users/someone/x'), new TypeError('x is undefined'), 'string', null])
    assert.equal(publicError(error, 'fallback').message, 'fallback');
});

test('real failure paths in each host module raise HostError', async () => {
  const agent = createStudioAgentHost({ root: '/unused', env: { PATH: '' }, resolve: async () => null });
  await assert.rejects(agent.send({ providerId: 'bash' }), error => error instanceof HostError && /Invalid agent message/.test(error.message));
  const designer = createStudioDesignerHost({ root: '/unused', pack: { manifest: { version: '1', skills: [] }, files: [] }, execute: async () => '' });
  await assert.rejects(designer.connect({ mode: 'general', runtimeId: 'coven-codex', projectId: 'not-a-uuid', name: 'A' }), error => error instanceof HostError);
  await assert.rejects(designer.request({ connectionId: 'missing' }), error => error instanceof HostError);
  await assert.rejects(runStudioCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 20 }), error => error instanceof HostError && /timed out/.test(error.message));
  await assert.rejects(runStudioCommand('/definitely/not/an/executable', []), error => error instanceof HostError);
  assert.throws(() => lastCodexMessage(''), error => error instanceof HostError);
});
