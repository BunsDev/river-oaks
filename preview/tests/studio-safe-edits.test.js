import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpace } from '../src/studio/space-templates.js';
import { createStudioDocument } from '../src/studio/document.js';
import { validateSpace, spacePointClear } from '../src/studio/space-document.js';

const officeContext = { templateId: 'office', profileVersion: 1 };
const blockedPatch = { east: 2, north: .9, width: .8, depth: 1.8, yaw: 0 };

test('meeting_route_blocked_spawn_clear retains accepted document, revision and history', () => {
  const space = createSpace('office');
  const blocked = structuredClone(space);
  Object.assign(blocked.objects.find(o => o.id === 'waiting-sofa'), blockedPatch);
  validateSpace(blocked);
  assert.equal(spacePointClear(blocked, blocked.spawn), true);
  const doc = createStudioDocument(space, { assessmentContext: officeContext });
  assert.throws(() => doc.update('waiting-sofa', blockedPatch), /meeting room/i);
  assert.deepEqual(doc.value, space);
  assert.equal(doc.revision, 0);
  assert.equal(doc.canUndo, false);
});

import { spaceTemplates, spaceAssessmentContext, spaceRouteProfile } from '../src/studio/space-templates.js';
import { assessSpace, spaceMovementSegment } from '../src/studio/space-assessment.js';
import { buildSpaceWorld } from '../src/studio/space-document.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { parseRegion, STORAGE_KEY } from '../src/studio/document.js';
import { createDesignerSession } from '../src/studio/designer-protocol.js';
import { proposalEnvelope } from '../src/studio/agent-chat.js';
const storage = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
};
function designer(doc) {
  const session = createDesignerSession(doc);
  session.connect({ id:'fixture', projectId:'safe-edits', packVersion:'1', capabilities:['objects.update','objects.add','objects.remove'] });
  const request = session.begin({ brief:'Rearrange furnishings', scope:'region' });
  const preview = operations => session.preview(proposalEnvelope(request, { operations, rationale:'Keep all required routes clear' }, doc));
  return { session, preview };
}

test('all four profiles check every destination and return/exit segments without changing v1', () => {
  for (const template of spaceTemplates) {
    const space = createSpace(template.id), context = spaceAssessmentContext(template.id);
    const result = assessSpace(space, context);
    assert.equal(result.status, 'passed', JSON.stringify(result.findings));
    assert.equal(result.routes.length, template.walkTargets.length + 1);
    const environment = createWalkingEnvironment(buildSpaceWorld(space));
    for (const route of result.routes) {
      assert.equal(route.returnChecked, true);
      for (let i = 1; i < route.points.length; i++) {
        assert.ok(spaceMovementSegment(environment, route.points[i-1], route.points[i]));
        assert.ok(spaceMovementSegment(environment, route.points[i], route.points[i-1]));
      }
    }
    const doc = createStudioDocument(space, { assessmentContext:context });
    const chair = space.objects.find(o => o.kind === 'chair');
    doc.update(chair.id, { finish:'walnut' });
    assert.equal(doc.assessment.status, 'passed');
    assert.deepEqual(parseRegion(doc.serialize()), doc.value);
  }
});

test('batch_valid_only_at_end commits once and undo/redo restores the complete batch', () => {
  const doc = createStudioDocument(createSpace('office'), { assessmentContext:officeContext });
  const before = doc.value, { session, preview } = designer(doc);
  const candidate = preview([
    { op:'update', id:'waiting-sofa', patch:blockedPatch },
    { op:'update', id:'meeting-divider-north', patch:{ width:1.5 } },
  ]);
  assert.deepEqual(doc.value, before);
  assert.equal(doc.revision, 0);
  session.apply();
  assert.deepEqual(doc.value, candidate.region);
  assert.equal(doc.revision, 1);
  doc.undo(); assert.deepEqual(doc.value, before); assert.equal(doc.canUndo, false);
  doc.redo(); assert.deepEqual(doc.value, candidate.region);
});

test('invalid agent final batch does not mutate accepted state or history', () => {
  const doc = createStudioDocument(createSpace('office'), { assessmentContext:officeContext });
  const before = doc.value, { session, preview } = designer(doc);
  assert.throws(() => preview([{ op:'update', id:'waiting-sofa', patch:blockedPatch }]), /meeting room/);
  assert.throws(() => session.apply(), /Preview/);
  assert.deepEqual(doc.value, before); assert.equal(doc.canUndo, false); assert.equal(doc.revision, 0);
  assert.ok(doc.rejectedAssessment.findings[0].objectIds.includes('waiting-sofa'));
});

test('thin_obstacle_between_samples and rotated furniture reject free-endpoint movement', () => {
  for (const [kind,yaw] of [['wall',0],['chair',45],['sofa',-35]]) {
    const space = createSpace('office');
    space.objects = [{ id:'thin', kind, label:'Thin obstacle', east:0, north:.35,
      width:.01, depth:.01, height:1, yaw, elevation:0, finish:'oak' }];
    const environment = createWalkingEnvironment(buildSpaceWorld(space));
    assert.equal(environment.isFree(-.125,0), true);
    assert.equal(environment.isFree(.125,0), true);
    assert.equal(spaceMovementSegment(environment, [-.125,0], [.125,0]), false);
    assert.equal(spaceMovementSegment(environment, [.125,0], [-.125,0]), false);
  }
});

test('movement segments retain the controller support-height rule', () => {
  const environment = { isFree:()=>true, groundAt:x=>x>0?.5:0 };
  assert.equal(spaceMovementSegment(environment, [-.125,0], [.125,0]), false);
});

test('profile_survives_local_reopen; bare export/import is honestly not assessed', () => {
  const store = storage(), doc = createStudioDocument(createSpace('office'), { assessmentContext:officeContext });
  doc.update('waiting-sofa', { finish:'walnut' }); doc.save(store);
  const record = JSON.parse(store.getItem(STORAGE_KEY));
  assert.deepEqual(record.assessmentContext, officeContext);
  assert.equal(record.region.assessmentContext, undefined);
  const reopened = createStudioDocument(); reopened.restore(store);
  assert.deepEqual(reopened.assessmentContext, officeContext);
  assert.equal(reopened.assessment.status, 'passed'); assert.equal(reopened.dirty, false);
  const imported = createStudioDocument(parseRegion(doc.serialize()));
  assert.equal(imported.assessmentContext, null); assert.equal(imported.assessment.status, 'not-assessed');
  imported.selectAssessmentContext(officeContext);
  assert.equal(imported.assessment.status, 'passed'); assert.equal(imported.dirty, true);
  imported.undo(); assert.equal(imported.assessment.status, 'not-assessed');
});

test('profile_not_inferred_from_name and unprofiled_v1_import_not_assessed', () => {
  for (const name of ['Garden Office', 'Courtyard House', 'office', 'Something else']) {
    const space = createSpace('office'); space.name = name;
    const doc = createStudioDocument(space);
    assert.equal(doc.assessment.status, 'not-assessed');
    doc.update('waiting-sofa', blockedPatch);
    assert.equal(doc.assessment.status, 'not-assessed');
  }
});

test('unknown profile/version cannot pass or accept guided edits and context is bounded', () => {
  for (const context of [{ templateId:'unknown', profileVersion:1 }, { ...officeContext, profileVersion:2 }]) {
    const doc = createStudioDocument(createSpace('office'), { assessmentContext:context });
    assert.equal(doc.assessment.status, 'not-assessed');
    assert.throws(() => doc.update('waiting-sofa', { finish:'walnut' }), /not assessed/);
    assert.equal(doc.canUndo, false);
    const store = storage(); doc.save(store);
    const reopened = createStudioDocument(); reopened.restore(store);
    assert.deepEqual(reopened.assessmentContext, context);
    assert.equal(reopened.assessment.status, 'not-assessed');
  }
  for (const context of [{ ...officeContext, extra:true }, { ...officeContext, templateId:'x'.repeat(100) }, { ...officeContext, profileVersion:Infinity }]) {
    assert.throws(() => createStudioDocument(createSpace('office'), { assessmentContext:context }), /context/);
  }
});

test('old route-invalid drafts open, save, export, reopen and repair without data loss', () => {
  const blocked = createSpace('office');
  Object.assign(blocked.objects.find(o => o.id === 'waiting-sofa'), blockedPatch);
  const doc = createStudioDocument(); doc.open(blocked, { assessmentContext:officeContext });
  assert.equal(doc.assessment.status, 'blocked');
  assert.deepEqual(parseRegion(doc.serialize()), blocked);
  const store = storage(); doc.save(store);
  const reopened = createStudioDocument(); reopened.restore(store);
  assert.deepEqual(reopened.value, blocked); assert.equal(reopened.assessment.status, 'blocked');
  reopened.update('waiting-sofa', { east:5, north:-4.6 });
  assert.equal(reopened.assessment.status, 'passed');
  reopened.undo(); assert.deepEqual(reopened.value, blocked); assert.equal(reopened.assessment.status, 'blocked');
});

test('required roles cannot be deleted, renamed away or changed to decoration to evade assessment', () => {
  const doc = createStudioDocument(createSpace('office'), { assessmentContext:officeContext });
  assert.throws(() => doc.remove('meeting-table'), /Restore meeting-table/);
  assert.throws(() => doc.update('meeting-table', { kind:'rug' }), /Restore meeting-table/);
  doc.update('meeting-table', { label:'Not a meeting room' });
  assert.throws(() => doc.update('waiting-sofa', blockedPatch), /meeting room/);
  const candidate = doc.value; candidate.objects.find(o => o.id === 'meeting-table').id = 'renamed';
  assert.throws(() => doc.commitCandidate(candidate), /Restore meeting-table/);
  assert.equal(spaceRouteProfile(officeContext).targets[2].objectId, 'meeting-table');
});

test('stale_assessment_after_replace_or_undo and profile/reopen changes cannot commit', () => {
  for (const change of [doc=>doc.replace(doc.value), doc=>{doc.update('waiting-sofa',{finish:'walnut'});doc.undo();},
    doc=>doc.open(createSpace('house')), doc=>doc.selectAssessmentContext({ ...officeContext, profileVersion:2 }),
    doc=>{const store=storage();doc.save(store);doc.restore(store);}]) {
    const doc = createStudioDocument(createSpace('office'), { assessmentContext:officeContext });
    const candidate = doc.value; candidate.lighting = 'evening';
    const baseRevision = doc.revision;
    doc.assessCandidate(candidate, { baseRevision });
    const {session,preview} = designer(doc); preview([{op:'update',id:'@environment',patch:{lighting:'evening'}}]);
    change(doc); const before = doc.value;
    assert.throws(() => doc.commitCandidate(candidate, { baseRevision }), /changed/);
    assert.throws(() => session.apply(), /changed|stale/);
    assert.deepEqual(doc.value, before);
  }
});

test('cancelled_agent_batch and aborted final edit leave state unchanged', () => {
  const doc = createStudioDocument(createSpace('office'), { assessmentContext:officeContext });
  const before = doc.value, {session,preview} = designer(doc);
  preview([{op:'update',id:'@environment',patch:{lighting:'evening'}}]); session.cancel();
  assert.throws(() => session.apply(), /active/);
  const candidate = doc.value; candidate.lighting = 'evening';
  const controller = new AbortController(); controller.abort();
  assert.throws(() => doc.commitCandidate(candidate, { signal:controller.signal }), /cancelled/);
  assert.deepEqual(doc.value, before); assert.equal(doc.canUndo, false); assert.equal(doc.revision, 0);
});

test('route_budget_exhausted is blocked and cannot mutate accepted state', () => {
  const doc = createStudioDocument(createSpace('office'), { assessmentContext:officeContext, routeBudget:1 });
  const before = doc.value;
  assert.equal(doc.assessment.status, 'blocked');
  assert.throws(() => doc.update('waiting-sofa', { finish:'walnut' }), /work limit/);
  assert.equal(doc.rejectedAssessment.findings[0].ruleId, 'route-budget');
  assert.deepEqual(doc.value, before); assert.equal(doc.revision, 0); assert.equal(doc.canUndo, false);
});

test('moving arrival inside cannot evade the fixed entrance/exit and malformed imports preserve context', () => {
  const doc = createStudioDocument(createSpace('office'), { assessmentContext:officeContext });
  const candidate = doc.value;
  Object.assign(candidate.objects.find(o=>o.id==='waiting-sofa'), {east:0,north:-6,width:2,depth:1});
  candidate.spawn = [0,-4];
  assert.throws(() => doc.commitCandidate(candidate), /exit/);
  assert.throws(() => doc.open({document_type:'studio-space'}));
  assert.deepEqual(doc.assessmentContext, officeContext); assert.equal(doc.revision, 0);
});


test('fractional arrivals use a bounded stable grid and still reach exact recipe destinations', () => {
  for (const spawn of [[.1,-8.4],[.123,-8.512],[.00001,-8.5]]) {
    const space=createSpace('office');space.spawn=spawn;
    const result=assessSpace(space,officeContext);
    assert.equal(result.status,'passed');
    assert.ok(result.work < 10000);
    assert.deepEqual(result.routes[3].points.at(-1),[3,1]);
  }
});

test('add cannot swallow budget exhaustion and invalid budgets never certify a candidate', () => {
  const doc=createStudioDocument(createSpace('office'),{assessmentContext:officeContext,routeBudget:0});
  const before=doc.value;
  assert.throws(()=>doc.add('furnishing'),/work limit/);
  assert.deepEqual(doc.value,before);assert.equal(doc.revision,0);
  for(const maxWork of [NaN,Infinity,-1])assert.throws(()=>assessSpace(before,officeContext,{maxWork}),/finite route/);
});

test('profile save conflicts and storage failure preserve both document and context', () => {
  const store=storage(),a=createStudioDocument(createSpace('office'),{assessmentContext:officeContext});a.save(store);
  const b=createStudioDocument();b.restore(store);
  a.selectAssessmentContext({...officeContext,profileVersion:2});a.save(store);
  b.update('waiting-sofa',{finish:'walnut'});
  assert.throws(()=>b.save(store),/another tab/);
  assert.deepEqual(b.assessmentContext,officeContext);assert.equal(b.dirty,true);
  const c=createStudioDocument();c.restore(store);
  c.selectAssessmentContext(officeContext);
  assert.throws(()=>c.save({getItem:store.getItem,setItem(){throw Error('Storage full');}}),/Storage full/);
  assert.equal(c.dirty,true);assert.deepEqual(c.assessmentContext,officeContext);
  assert.equal(JSON.parse(store.getItem(STORAGE_KEY)).assessmentContext.profileVersion,2);
});

test('a batch can temporarily cover arrival when its final layout clears it', () => {
  const doc=createStudioDocument(createSpace('office'),{assessmentContext:officeContext});
  const before=doc.value,{session,preview}=designer(doc);
  const candidate=preview([
    {op:'update',id:'@arrival',patch:{east:5,north:-4.6}},
    {op:'update',id:'waiting-sofa',patch:{north:-8}},
  ]);
  assert.deepEqual(doc.value,before);assert.equal(doc.revision,0);
  session.apply();assert.deepEqual(doc.value,candidate.region);assert.equal(doc.revision,1);
  assert.equal(doc.assessment.status,'passed');doc.undo();assert.deepEqual(doc.value,before);
});


test('detached staging never permits an invalid final spawn or footprint', () => {
  for(const patch of [{east:0,north:-8.5},{width:30,east:11}]){
    const doc=createStudioDocument(createSpace('office'),{assessmentContext:officeContext});
    const before=doc.value,{session,preview}=designer(doc);
    assert.throws(()=>preview([{op:'update',id:'waiting-sofa',patch}]));
    assert.throws(()=>session.apply(),/Preview/);
    assert.deepEqual(doc.value,before);assert.equal(doc.revision,0);assert.equal(doc.canUndo,false);
  }
});
