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
  },
  "woman-casual": {
    "id": "woman-casual",
    "sha256": "51fa4cda6fd5f76c2657a350a2bfd800eb25b3da28a41d4001330cd174a8d3d1",
    "bytes": 1889592,
    "receipt": "/assets/characters/sources.json"
  },
  "woman-tailored": {
    "id": "woman-tailored",
    "sha256": "c4fbe6b7c069ed2236d16774190893222f5dc8459a09e2cd68b73dbd4ca1e19c",
    "bytes": 1748448,
    "receipt": "/assets/characters/sources.json"
  },
  "woman-daywear": {
    "id": "woman-daywear",
    "sha256": "7d2db64730455d55d207773850de760c4046db71c0e095d4006da8d549a148d9",
    "bytes": 2164940,
    "receipt": "/assets/characters/sources.json"
  },
  "man-workwear": {
    "id": "man-workwear",
    "sha256": "37e96403d3ea1e779551070e3568543a669f6c3029233d2c54926f1332ab95fd",
    "bytes": 1893396,
    "receipt": "/assets/characters/sources.json"
  }
});

// A definition may only reference a rig pinned above. An unpinned rig is refused
// rather than published with an empty asset record.
export function characterAssetFor(rig) {
  if (typeof rig !== 'string' || !Object.hasOwn(CHARACTER_ASSETS, rig)) throw new TypeError('Unpinned character rig');
  return { ...CHARACTER_ASSETS[rig] };
}
