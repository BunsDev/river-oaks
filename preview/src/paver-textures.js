import * as THREE from 'three';

// Authored from the supplied Street View references, not sampled imagery.
// Four metres contain eight 0.5 m strips per row and 32 rows. These are
// design dimensions, not a survey. The even row count makes the bond seamless.
export const PAVER_TILE = 4;
const SIZE = 512;
const hash = (x, y) => {
  let n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

export function createPaverTextures(anisotropy = 4) {
  const color = new Uint8Array(SIZE * SIZE * 4), arm = new Uint8Array(color.length);
  const normal = new Uint8Array(color.length), heights = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const row = Math.floor(y / 16), shifted = (x + (row % 2) * 32) % SIZE;
    const column = Math.floor(shifted / 64), u = shifted % 64, v = y % 16;
    const edge = Math.min(u, 63 - u, v, 15 - v);
    const joint = edge === 0, bevel = Math.min(1, edge / 2);
    const pick = hash(column, row), grit = (hash(x, y) - .5) * 9;
    const tone = 113 + hash(column + 59, row) * 83;
    const rgb = pick < .075 ? [159, 113, 96] : [tone + 3, tone + 2, tone];
    const i = (y * SIZE + x) * 4;
    for (let c = 0; c < 3; c++) color[i + c] = joint ? 94 + grit : rgb[c] + grit - (1 - bevel) * 10;
    color[i + 3] = 255;
    arm.set([joint ? 190 : 250, joint ? 245 : 205 + hash(column, row + 41) * 28, 0, 255], i);
    heights[y * SIZE + x] = bevel * .0015 + (joint ? 0 : grit * .000015);
  }
  const height = (x, y) => heights[((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (height(x + 1, y) - height(x - 1, y)) / (2 * PAVER_TILE / SIZE);
    const dy = (height(x, y + 1) - height(x, y - 1)) / (2 * PAVER_TILE / SIZE);
    const length = Math.hypot(dx, dy, 1);
    normal.set([128 - dx / length * 127, 128 - dy / length * 127, 128 + 1 / length * 127, 255], (y * SIZE + x) * 4);
  }
  const make = (data, srgb = false) => {
    const map = new THREE.DataTexture(data, SIZE, SIZE);
    map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = anisotropy; map.needsUpdate = true;
    return map;
  };
  return { color: make(color, true), normal: make(normal), arm: make(arm) };
}
