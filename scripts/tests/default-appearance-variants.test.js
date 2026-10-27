import test from 'node:test';
import assert from 'node:assert/strict';
import { untrialedVariant } from '../lib/default-appearance-variants.mjs';
import { DEFAULT_APPEARANCE_REALISM } from '../../preview/src/default-appearance-realism.js';

const trialHigh = {realism: 'high'}, off = {realism: 'off'}, roughness = {realism: 'high', components: ['roughness']};

test('a named default the policy leaves out has no trial variant to capture', () => {
  const policy = {enabled: true, appearances: {'sable-human': ['roughness']}};
  assert.equal(untrialedVariant('jevica', trialHigh, policy), true);
  assert.equal(untrialedVariant('jevica', {realism: 'low', samples: 0}, policy), true);
  // Off and explicit components are still captured, and a listed look keeps its trial.
  assert.equal(untrialedVariant('jevica', off, policy), false);
  assert.equal(untrialedVariant('jevica', roughness, policy), false);
  assert.equal(untrialedVariant('sable-human', trialHigh, policy), false);
  // Other looks were never in the policy; their policy-decided tier is the whole preset.
  assert.equal(untrialedVariant('man-tailored', trialHigh, policy), false);
  // Listing Jevica again, or rolling the trial back, decides it the same way the world does.
  assert.equal(untrialedVariant('jevica', trialHigh, {...policy, appearances: {...policy.appearances, jevica: ['roughness']}}), false);
  assert.equal(untrialedVariant('sable-human', trialHigh, {...policy, enabled: false}), true);
});

test('the shipped policy decides with the same rule', () => {
  for (const id of ['jevica', 'sable-human'])
    assert.equal(untrialedVariant(id, trialHigh), !(DEFAULT_APPEARANCE_REALISM.enabled && Object.hasOwn(DEFAULT_APPEARANCE_REALISM.appearances, id)), id);
});
