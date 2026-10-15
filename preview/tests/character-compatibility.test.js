import test from 'node:test';
import assert from 'node:assert/strict';
import { characterCompatibility, CHARACTER_RIG_REQUIREMENTS } from '../src/character-compatibility.js';
import { SHARED_APPEARANCES } from '../src/shared-appearances.js';
import { supportsCharacterColors } from '../src/character-customization.js';

test('each authored appearance has an explicit compatible rig and immutable bundle',()=>{
  for(const look of SHARED_APPEARANCES){
    const item=characterCompatibility(look.id);
    assert.equal(item.rig,look.rig??look.id);assert.ok(CHARACTER_RIG_REQUIREMENTS[item.rig]);
    assert.equal(item.form,look.form);assert.equal(item.outfit,look.id);
    assert.equal(item.colors,supportsCharacterColors(look.id));
    assert.deepEqual(item.editableAttachments,[]);assert.deepEqual(item.editableMorphs,[]);
    assert.throws(()=>item.editableAttachments.push('unfitted-wing'));assert.throws(()=>item.rig='unknown');
  }
  for(const id of ['unknown','__proto__',null])assert.equal(characterCompatibility(id),null);
});
