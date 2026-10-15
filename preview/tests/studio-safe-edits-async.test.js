import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioDocument, STORAGE_KEY } from '../src/studio/document.js';
import { createSpace, spaceAssessmentContext } from '../src/studio/space-templates.js';
import { assessSpace } from '../src/studio/space-assessment.js';

const context = spaceAssessmentContext('office');
function controlledRunner() {
  const jobs = [];
  const runner = (space, profile, options) => new Promise((resolve, reject) => {
    jobs.push({ space: structuredClone(space), context: structuredClone(profile), options,
      resolve: () => resolve(assessSpace(space, profile, options)), reject });
  });
  return { jobs, runner };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('async final candidate remains detached until assessment passes and creates one undo item', async () => {
  const { jobs, runner } = controlledRunner();
  const doc = createStudioDocument(createSpace('office'), { assessmentContext: context, assessmentRunner: runner });
  const before = doc.value;
  const pending = doc.update('waiting-sofa', { finish: 'walnut' });
  await tick();
  assert.equal(typeof pending?.then, 'function');
  assert.equal(jobs.length, 1);
  assert.deepEqual(doc.value, before);
  assert.equal(doc.revision, 0); assert.equal(doc.canUndo, false);
  jobs[0].resolve(); await pending;
  assert.equal(doc.value.objects.find(o => o.id === 'waiting-sofa').finish, 'walnut');
  assert.equal(doc.revision, 1); assert.equal(doc.assessment.status, 'passed');
  doc.undo(); assert.deepEqual(doc.value, before); assert.equal(doc.canUndo, false);
});

test('async blocked assessment and worker failure preserve accepted state and history', async () => {
  for (const fails of [false, true]) {
    const { jobs, runner } = controlledRunner();
    const doc = createStudioDocument(createSpace('office'), { assessmentContext: context, assessmentRunner: runner });
    const before = doc.value;
    const pending = doc.update('waiting-sofa', fails ? { finish: 'walnut' } : { east: 2, north: .9, width: .8, depth: 1.8, yaw: 0 });
    const rejected = assert.rejects(pending, fails ? /worker failed/ : /meeting room/);
    await tick();
    if (fails) jobs[0].reject(Error('worker failed')); else jobs[0].resolve();
    await rejected;
    assert.deepEqual(doc.value, before); assert.equal(doc.revision, 0); assert.equal(doc.canUndo, false);
  }
});

test('late worker results cannot commit after open, context change, undo or restore', async () => {
  for (const action of ['open', 'context', 'undo', 'restore']) {
    const { jobs, runner } = controlledRunner();
    const doc = createStudioDocument(createSpace('office'), { assessmentContext: context, assessmentRunner: runner });
    // Establish undo history without invoking asynchronous acceptance.
    doc.open(createSpace('office'), { assessmentContext: { ...context, profileVersion: 2 } });
    doc.selectAssessmentContext(context);
    const pending = doc.update('waiting-sofa', { finish: 'walnut' });
    const rejected = assert.rejects(pending, /changed|stale|cancel|abort/i);
    await tick();
    const job = jobs[0];
    if (action === 'open') doc.open(createSpace('house'));
    if (action === 'context') doc.selectAssessmentContext({ ...context, profileVersion: 2 });
    if (action === 'undo') doc.undo();
    if (action === 'restore') doc.restore({ getItem: key => key === STORAGE_KEY ? JSON.stringify({ revision: 'fixture', region: createSpace('house') }) : null });
    assert.equal(job.options.signal.aborted, true, action);
    const after = doc.value, revision = doc.revision;
    job.resolve(); await rejected;
    assert.deepEqual(doc.value, after, action); assert.equal(doc.revision, revision, action);
  }
});

test('caller abort fences a final candidate even when its worker ignores cancellation', async () => {
  const { jobs, runner } = controlledRunner();
  const doc = createStudioDocument(createSpace('office'), { assessmentContext: context, assessmentRunner: runner });
  const before = doc.value, controller = new AbortController();
  const candidate = doc.value; candidate.lighting = 'evening';
  const pending = doc.commitCandidate(candidate, { baseRevision: doc.revision, signal: controller.signal });
  const rejected = assert.rejects(pending, /cancel|abort/i);
  await tick(); controller.abort();
  assert.equal(jobs[0].options.signal.aborted, true);
  jobs[0].resolve(); await rejected;
  assert.deepEqual(doc.value, before); assert.equal(doc.revision, 0); assert.equal(doc.canUndo, false);
});

test('refresh assessment is pending without a synchronous search and ignores old results', async () => {
  const { jobs, runner } = controlledRunner();
  const doc = createStudioDocument(createSpace('office'), { assessmentContext: context, assessmentRunner: runner });
  assert.equal(doc.assessment.status, 'pending'); assert.equal(jobs.length, 0);
  const pending = doc.refreshAssessment();
  // A refresh may reject cancellation or resolve to a non-current result; neither
  // is allowed to overwrite the replacement document's assessment.
  const settled = Promise.resolve(pending).catch(() => null);
  await tick(); assert.equal(jobs.length, 1);
  doc.open(createSpace('house'));
  assert.equal(jobs[0].options.signal.aborted, true);
  jobs[0].resolve(); await settled;
  assert.equal(doc.assessment.status, 'not-assessed'); assert.equal(doc.assessmentContext, null);
  assert.equal(doc.revision, 1); assert.equal(doc.dirty, true);
});

test('missing required roles restore together while retaining unrelated furniture and one undo', async () => {
  for (const asyncMode of [false, true]) {
    const space = createSpace('office');
    space.objects = space.objects.filter(o => !['meeting-table', 'kitchenette-sink'].includes(o.id));
    space.objects.find(o => o.id === 'waiting-sofa').finish = 'walnut';
    const doc = createStudioDocument(space, { assessmentContext: context,
      ...(asyncMode ? { assessmentRunner: async (value, profile, options) => assessSpace(value, profile, options) } : {}) });
    const before = doc.value;
    await doc.restoreRequiredRoles();
    assert.ok(doc.value.objects.some(o => o.id === 'meeting-table'));
    assert.ok(doc.value.objects.some(o => o.id === 'kitchenette-sink'));
    for (const object of before.objects) assert.deepEqual(doc.value.objects.find(o => o.id === object.id), object);
    assert.equal(doc.assessment.status, 'passed'); assert.equal(doc.revision, 1);
    doc.undo(); assert.deepEqual(doc.value, before); assert.equal(doc.canUndo, false);
    doc.redo(); assert.ok(doc.value.objects.some(o => o.id === 'meeting-table'));
  }
});

test('role restoration that blocks arrival is rejected without partial restoration', async () => {
  const space = createSpace('office');
  space.objects = space.objects.filter(o => !['meeting-table', 'kitchenette-sink'].includes(o.id));
  space.spawn = [5, 2.6];
  const doc = createStudioDocument(space, { assessmentContext: context });
  const before = doc.value;
  await assert.rejects(async () => doc.restoreRequiredRoles(), /arrival|route|clear/i);
  assert.deepEqual(doc.value, before); assert.equal(doc.revision, 0); assert.equal(doc.canUndo, false);
});

test('failed refresh can retry at the same revision', async () => {
  let attempts=0;
  const doc=createStudioDocument(createSpace('office'),{assessmentContext:context,assessmentRunner:async(space,profile,options)=>{
    if(++attempts===1)throw new DOMException('Superseded','AbortError');
    return assessSpace(space,profile,options);
  }});
  await assert.rejects(doc.refreshAssessment(),/Superseded/);
  await doc.refreshAssessment();
  assert.equal(attempts,2);assert.equal(doc.assessment.status,'passed');
});
