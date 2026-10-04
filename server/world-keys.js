import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';

function validateNamespace(namespace) {
  if (typeof namespace !== 'string' || !/^[A-Za-z0-9:_-]{1,120}$/.test(namespace)) throw new Error('Invalid world namespace');
  return namespace;
}

export function roomPrefixFor(namespace, worldId = DEFAULT_WORLD_ID) {
  validateNamespace(namespace);validateWorldId(worldId);
  return `{${namespace}${worldId===DEFAULT_WORLD_ID?'':`:world:${worldId}`}}`;
}

export function accountPrefixFor(namespace, worldId = DEFAULT_WORLD_ID) {
  validateNamespace(namespace);validateWorldId(worldId);
  return `{${namespace.replace(/:v\d+$/,'')}:accounts:v1${worldId===DEFAULT_WORLD_ID?'':`:world:${worldId}`}}`;
}
