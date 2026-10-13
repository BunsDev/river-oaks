import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSceneContext, sceneText } from '../studio-scene-context.js';
import { createSpace } from '../../preview/src/studio/space-templates.js';
import { spaceItems } from '../../preview/src/studio/space-document.js';

test('space context shares editable furnishings and light without unknown/private fields',()=>{
  const space=createSpace('house');space.privateKey='never-share';space.objects[0].script='never-share';
  const context=sanitizeSceneContext({documentType:'studio-space',objects:spaceItems(space),region:space});
  assert.equal(context.documentType,'studio-space');
  assert.equal(context.objects.find(i=>i.id==='@environment').lighting,'warm');
  assert.equal(context.objects.find(i=>i.id==='living-sofa').finish,'fabric');
  assert.equal(context.region.document_type,'studio-space');assert.equal(context.region.objects.length,space.objects.length);
  assert.ok(sceneText(context).includes('Courtyard House'));
  assert.doesNotMatch(JSON.stringify(context),/never-share|script|privateKey/);
});
