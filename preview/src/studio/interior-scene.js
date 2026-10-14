import * as THREE from 'three';

const COLORS = { limestone: '#c9bca4', oak: '#b78b5e', terracotta: '#be8067', concrete: '#adb5b1' };
const material = (color, opacity = 1) => new THREE.MeshStandardMaterial({ color, roughness: 0.88,
  transparent: opacity < 1, opacity, side: THREE.DoubleSide });

function shapeFromFootprint(footprint, opening) {
  const shape = new THREE.Shape();
  footprint.forEach(([u, v], index) => index ? shape.lineTo(u, v) : shape.moveTo(u, v));
  shape.closePath();
  if (opening?.length) {
    const hole = new THREE.Path();
    opening.forEach(([u, v], index) => index ? hole.lineTo(u, v) : hole.moveTo(u, v));
    hole.closePath(); shape.holes.push(hole);
  }
  return shape;
}

function wallBetween(a, b, parent, wallMaterial) {
  const du = b[0] - a[0], dv = b[1] - a[1], length = Math.hypot(du, dv);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 1.25, 0.08), wallMaterial);
  wall.position.set((a[0] + b[0]) / 2, 0.66, -(a[1] + b[1]) / 2);
  wall.rotation.y = Math.atan2(dv, du);
  parent.add(wall);
}

/** A local-coordinate editor preview. Only the server-approved plan defines shared collision. */
export function createInteriorLevelPreview(plan) {
  const levels = new Map(), group = new THREE.Group();
  const shellMaterial = material('#d9dfd8'), wallMaterial = material('#91aaa0', 0.62);
  const fixtureMaterial = material('#9a6651'), portalMaterial = material('#3b846a');
  for (const level of plan.levels) {
    const root = new THREE.Group(); root.name = level.id;
    root.position.y = level.floorElevation - plan.anchor.baseElevation;
    const layers = new Map();
    for (const name of ['shell', 'partitions', 'fixtures', 'finishes', 'authoredOverrides']) {
      const layer = new THREE.Group(); layer.name = name; root.add(layer); layers.set(name, layer);
    }
    const shell = level.layers.shell[0];
    const opening = level.index > 0 ? shell.localStairOpening : null;
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shapeFromFootprint(shell.localFloor, opening)), shellMaterial);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.035;
    floor.name = shell.id; layers.get('shell').add(floor);
    for (let index = 0; index < shell.localFloor.length; index++)
      wallBetween(shell.localFloor[index], shell.localFloor[(index + 1) % shell.localFloor.length], layers.get('shell'), wallMaterial);
    for (const fixture of level.layers.fixtures) {
      const points = fixture.localFootprint;
      const us = points.map(point => point[0]), vs = points.map(point => point[1]);
      const width = Math.max(...us) - Math.min(...us), depth = Math.max(...vs) - Math.min(...vs);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.95, depth), fixtureMaterial);
      mesh.position.set((Math.min(...us) + Math.max(...us)) / 2, 0.51, -(Math.min(...vs) + Math.max(...vs)) / 2);
      mesh.name = fixture.id; layers.get('fixtures').add(mesh);
    }
    for (const portal of level.portals.filter(item => item.kind === 'stairs')) {
      const marker = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.55, 24), portalMaterial);
      marker.rotation.x = -Math.PI / 2; marker.position.set(portal.localPosition[0], 0.055, -portal.localPosition[1]);
      marker.name = portal.id; layers.get('shell').add(marker);
    }
    const finish = level.layers.finishes[0];
    const finishSurface = new THREE.Mesh(new THREE.ShapeGeometry(shapeFromFootprint(shell.localFloor, opening)),
      material(COLORS[finish.material] ?? '#c9bca4', 0.72));
    finishSurface.rotation.x = -Math.PI / 2; finishSurface.position.y = 0.045;
    finishSurface.name = finish.id; layers.get('finishes').add(finishSurface);
    root.visible = false; group.add(root); levels.set(level.index, { root, layers });
  }
  return { group, levels };
}

export function showInteriorPreview(preview, levelIndex, visibleLayers = {}) {
  if (levelIndex !== null && !preview.levels.has(levelIndex)) throw new Error('Choose a generated level.');
  for (const [index, { root, layers }] of preview.levels) {
    root.visible = index === levelIndex;
    for (const [name, layer] of layers) layer.visible = visibleLayers[name] !== false;
  }
}
