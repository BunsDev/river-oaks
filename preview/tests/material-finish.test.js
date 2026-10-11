import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { finishKey } from '../src/material-finish.js';

test('plain materials that differ only in colour share a finish', () => {
  const stone = new THREE.MeshStandardMaterial({ color: '#d4cdbd', roughness: 0.5, metalness: 0.1 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#3c2c22', roughness: 0.5, metalness: 0.1 });
  assert.ok(finishKey(stone));
  assert.equal(finishKey(stone), finishKey(bronze));
  assert.notEqual(finishKey(stone), finishKey(new THREE.MeshStandardMaterial({ color: '#d4cdbd', roughness: 0.6, metalness: 0.1 })));
  assert.notEqual(finishKey(stone), finishKey(new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide })));
});

test('textured, glowing, see-through, cut-out, breakable and special materials keep their own', () => {
  const texture = new THREE.Texture();
  const own = [
    new THREE.MeshStandardMaterial({ map: texture }),
    new THREE.MeshStandardMaterial({ emissive: '#ffddb0', emissiveIntensity: 2 }),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 }),
    new THREE.MeshStandardMaterial({ alphaTest: 0.45 }),
    new THREE.MeshPhysicalMaterial({ roughness: 0.1 }),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  ];
  const breakable = new THREE.MeshStandardMaterial(); breakable.userData.breakableGlass = true; own.push(breakable);
  for (const material of own) assert.equal(finishKey(material), null, material.type);
  const glass = new THREE.MeshStandardMaterial();
  assert.equal(finishKey(glass, new Set([glass])), null, 'a listed special material');
  // An emissive colour with zero intensity does not glow.
  assert.ok(finishKey(new THREE.MeshStandardMaterial({ emissive: '#ffffff', emissiveIntensity: 0 })));
});
