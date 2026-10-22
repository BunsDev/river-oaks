// Pinned shipped rig bytes. Update with source receipts and compatibility checks.
export const CHARACTER_ASSETS = Object.freeze({
  "jevica": {
    "id": "jevica",
    "sha256": "722b96e2fd77b36c85ec01c1594a35e3f3f39b5ec76dfc3c9a351ef1eb4f117a",
    "bytes": 5779116,
    "receipt": "/assets/characters/jevica.sources.json"
  },
  "man-casual": {
    "id": "man-casual",
    "sha256": "e7ac712585ba2d4558092b67ccf30e67d29843a9a81c4ca00384200f69588684",
    "bytes": 2024532,
    "receipt": "/assets/characters/sources.json"
  },
  "man-tailored": {
    "id": "man-tailored",
    "sha256": "ae3834fbc9d96c3588f330a80280a2dfd5d69830ad18ca2f51d5e1003f7e042f",
    "bytes": 1848936,
    "receipt": "/assets/characters/sources.json"
  },
  "man-realistic-casual": {
    "id": "man-realistic-casual",
    "sha256": "bce971f3e523419b9ee1ceaccf9a8044152dc1647dd2148c458e40aad0da4305",
    "bytes": 9395508,
    "receipt": "/assets/characters/realistic-humans.sources.json"
  },
  "woman-realistic-tailored": {
    "id": "woman-realistic-tailored",
    "sha256": "d341bf3a344bfd8d091ea226482d9bd51ad18732fe361e5860537052e767cdc1",
    "bytes": 9447632,
    "receipt": "/assets/characters/realistic-humans.sources.json"
  }
});

// A definition may only reference a rig pinned above. An unpinned rig is refused
// rather than published with an empty asset record.
export function characterAssetFor(rig) {
  if (typeof rig !== 'string' || !Object.hasOwn(CHARACTER_ASSETS, rig)) throw new TypeError('Unpinned character rig');
  return { ...CHARACTER_ASSETS[rig] };
}
