import * as THREE from 'three';
import { wishLift } from './wishes.js';
import { createWishDragon } from './wish-dragon.js';
import { createWishDog, loadWishDogAsset } from './wish-dog.js';

// Small, local props. Allocate only for enchanted residents, and release on undo.
export function createWishVisual(holder, model, { groundOffset = 0, loadDogAsset = loadWishDogAsset } = {}) {
  const root = new THREE.Group(); root.name = 'Wish effects'; holder.add(root);
  const originalVisible = model.visible, hidden = new Map();
  let kind = null, offset = 0, egg, dragon, dragonAsset, dog, dogAsset, tears;
  const restore = () => { for (const [mesh, visible] of hidden) mesh.visible = visible; hidden.clear(); model.visible = originalVisible; };
  const clear = () => {
    dragonAsset?.dispose();dragonAsset = null;
    dogAsset?.dispose();dogAsset = null;
    root.traverse(item => { if (item.isMesh) { item.geometry.dispose(); item.material.dispose(); } }); root.clear();
    egg = dragon = dog = tears = null;
  };
  const mesh = (parent, color, position, scale, geometry = new THREE.SphereGeometry(1, 16, 12)) => {
    const item = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    item.position.set(...position); item.scale.set(...scale); item.castShadow = true;
    if (holder.userData.localId) item.userData.localId = holder.userData.localId;
    parent.add(item); return item;
  };
  const build = value => {
    restore(); clear(); kind = value;
    root.position.y = ['dog', 'dragon'].includes(kind) ? groundOffset : 0;
    if (kind === 'dragon') {
      egg = new THREE.Group(); egg.name = 'Wish egg'; root.add(egg);
      mesh(egg, '#eaca79', [0.7, 0.35, 0.1], [0.22, 0.32, 0.22]);
      dragonAsset = createWishDragon(holder.userData.localId);dragon = dragonAsset.object;
      dragon.position.set(1.6, 0, 0);root.add(dragon);
    } else if (kind === 'dog') {
      dogAsset=createWishDog(holder.userData.localId,{loadAsset:loadDogAsset});
      dog=dogAsset.object;root.add(dog);
    } else if (kind === 'invisibility') {
      model.traverse(item => {
        if (!item.isMesh) return;
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        if (materials.every(material => /^(young|middleage|old|brown|eyebrow|eyelash|bob|short|ponytail|long|afro|curly)/.test(material?.name ?? ''))) { hidden.set(item, item.visible); item.visible = false; }
      });
    } else if (kind === 'mind-reading') {
      tears = new THREE.Group(); tears.name = 'Wish tears'; root.add(tears);
      for (const side of [-1, 1]) mesh(tears, '#82c5df', [side * 0.1, 1.55, 0.16], [0.025, 0.065, 0.025]);
    }
  };
  return {
    update(wish, { baseY = holder.position.y - offset, reducedMotion = false } = {}) {
      if ((wish?.kind ?? null) !== kind) build(wish?.kind ?? null);
      offset = wishLift(wish);
      holder.position.y = baseY + offset;
      if (egg) { egg.visible = wish.phase === 'gift'; dragon.visible = !egg.visible;dragonAsset.update(wish.age, reducedMotion); }
      if (dog) {dogAsset.update(wish.age,wish.phase,reducedMotion);model.visible=dogAsset.loaded?false:originalVisible;}
      if (tears) { tears.visible = wish.phase !== 'gift'; tears.position.y = reducedMotion ? 0 : -((wish.age % 1) * 0.18); }
      root.userData.kind = wish?.kind ?? null;
    },
    dispose() { holder.position.y -= offset; offset = 0; restore(); clear(); root.removeFromParent(); },
  };
}
