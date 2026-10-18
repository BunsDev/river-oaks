import { customizedCharacterDefinition } from './character-customization.js';
import { CHARACTER_ASSETS } from './character-assets.js';
import { LEGACY_APPEARANCES, canUseAppearance, permittedAppearance, sharedAppearance } from './shared-appearances.js';

export const CHARACTER_SCHEMA_VERSION = 1;
const fields = ['schemaVersion','ownerId','revision','appearanceId','rig','form','parameters','palette','hair','outfit','attachments','assets','provenance'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const owner = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\s\x00-\x1f\x7f]/.test(value);

// Version 1 describes existing authored bundles. Independent components become
// editable only when the catalog proves their compatibility with each rig.
export function characterDefinitionFor(ownerId, appearanceId, { revision = 0 } = {}) {
  if (!owner(ownerId) || !Number.isSafeInteger(revision) || revision < 0) throw new TypeError('Invalid character identity');
  if (!canUseAppearance(ownerId, appearanceId)) throw new TypeError('Appearance not permitted');
  const look = sharedAppearance(appearanceId);
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION, ownerId, revision,
    appearanceId: look.id, rig: look.rig ?? look.id, form: look.form,
    parameters: {}, palette: 'authored', hair: 'authored', outfit: look.id,
    attachments: [], assets: [{ ...CHARACTER_ASSETS[look.rig ?? look.id] }], provenance: { kind: 'authored', catalog: 'river-oaks-looks-v1' },
  };
}

function equal(value, expected) {
  if (Array.isArray(expected)) return Array.isArray(value) && value.length === expected.length && value.every((item,i) => equal(item,expected[i]));
  if (record(expected)) return record(value) && Object.keys(value).length === Object.keys(expected).length && Object.keys(expected).every(key => Object.hasOwn(value,key) && equal(value[key],expected[key]));
  return value === expected;
}

// Strict input validation, independent of DOM/Three.js so server and browser use
// identical rules. Never silently repair malformed publication requests.
export function validateCharacterDefinition(value, { ownerId } = {}) {
  if (!record(value) || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value,key))) return { ok:false, error:'invalid_character_definition' };
  if (!owner(ownerId) || value.ownerId !== ownerId) return { ok:false, error:'character_owner_mismatch' };
  if (![CHARACTER_SCHEMA_VERSION,2].includes(value.schemaVersion)) return { ok:false, error:'unsupported_character_version' };
  let canonical;
  try { canonical = value.schemaVersion===2
    ? customizedCharacterDefinition(ownerId,value.appearanceId,{revision:value.revision,palette:value.palette,hair:value.hair})
    : characterDefinitionFor(ownerId,value.appearanceId,{revision:value.revision}); }
  catch { return { ok:false, error:'invalid_character_definition' }; }
  // Legacy aliases are migrated on read, never published as a new identity.
  if (!equal(value,canonical)) return { ok:false, error:'invalid_character_definition' };
  return { ok:true, definition:canonical };
}

// Used only for reading old account/checkpoint data; publication uses strict
// validation. Authorization is re-evaluated for the authenticated owner.
export function migrateCharacterAppearance(ownerId, appearanceId) {
  return characterDefinitionFor(ownerId,permittedAppearance(ownerId,appearanceId));
}

export function characterAppearanceFor(definition, ownerId) {
  const result = validateCharacterDefinition(definition,{ownerId});
  return result.ok ? sharedAppearance(result.definition.appearanceId) : null;
}

// Storage reads only. New writes still require the strict human-only definition.
export function migrateStoredCharacterDefinition(value, {ownerId} = {}) {
  if (!record(value) || !Object.hasOwn(LEGACY_APPEARANCES,value.appearanceId)) return validateCharacterDefinition(value,{ownerId});
  if (value.form !== 'beast' || value.outfit !== value.appearanceId) return {ok:false,error:'invalid_character_definition'};
  const id=LEGACY_APPEARANCES[value.appearanceId];
  return validateCharacterDefinition({...value,appearanceId:id,outfit:id,form:'human'},{ownerId});
}
