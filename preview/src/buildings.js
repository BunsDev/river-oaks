import * as THREE from 'three';
import { physicalSurface } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Every detail is original procedural architecture, bounded by the GIS house mass.
// Parts use local x=east, y=up, z=south; the source yaw is applied once at placement.
export function houseParts(building) {
  const [width, depth, height] = building.size;
  const style = building.style;
  const modern = style === 'modern_estate';
  const tudor = style === 'tudor_revival';
  const french = style === 'french_eclectic';
  const wallHeight = height * (modern ? 0.9 : french ? 0.66 : 0.70);
  const parts = [];
  const add = (role, material, position, size, geometry = 'box', rotation = [0, 0, 0]) => {
    parts.push({ role, material, position, size, geometry, rotation });
  };
  const wallMaterial = modern || french ? 'stucco' : 'brick';
  add('foundation', 'stone', [0, 0.14, 0], [width, 0.28, depth]);
  add('walls', wallMaterial, [0, wallHeight / 2, 0], [width - 0.22, wallHeight, depth - 0.22]);
  if (tudor) {
    add('upper_stucco', 'stucco', [0, wallHeight * 0.75, 0], [width - 0.2, wallHeight * 0.5, depth - 0.2]);
  }

  const window = (x, y, z, windowWidth, windowHeight, rotation = 0, role = 'window') => {
    const rot = [0, rotation, 0];
    const frameMaterial = tudor ? 'timber' : modern ? 'metal' : 'trim';
    add('glass', 'glass', [x, y, z], [windowWidth * 0.92, windowHeight * 0.92, 0.045], 'box', rot);
    add(role, frameMaterial, [x, y, z], [windowWidth, windowHeight, 0.075], 'windowFrame', rot);
  };
  const columns = modern ? Math.max(2, Math.min(4, Math.floor(width / 4))) : Math.max(2, Math.min(5, Math.floor(width / 3)));
  const windowWidth = Math.min(modern ? 2.6 : 1.25, width / (columns * 1.7));
  const windowHeight = Math.min(modern ? 1.7 : 1.55, wallHeight * 0.26);
  for (const face of [-1, 1]) {
    for (let floor = 0; floor < 2; floor += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = (column - (columns - 1) / 2) * width * 0.78 / columns;
        // Leave a clear central entrance bay on the front ground floor.
        if (face === 1 && floor === 0 && Math.abs(x) < 1.25) continue;
        window(x, wallHeight * (floor ? 0.76 : 0.29), face * (depth / 2 - 0.045), windowWidth, windowHeight);
      }
    }
  }
  const sideColumns = Math.max(1, Math.min(3, Math.floor(depth / 5)));
  for (const face of [-1, 1]) {
    for (let floor = 0; floor < 2; floor += 1) {
      for (let column = 0; column < sideColumns; column += 1) {
        const z = (column - (sideColumns - 1) / 2) * depth * 0.72 / sideColumns;
        window(face * (width / 2 - 0.045), wallHeight * (floor ? 0.76 : 0.29), z, Math.min(windowWidth, depth * 0.19), windowHeight, Math.PI / 2);
      }
    }
  }

  const doorWidth = Math.min(1.3, width * 0.17);
  const doorHeight = Math.min(2.4, wallHeight * 0.45);
  const front = depth / 2 - 0.045;
  add('entrance', modern ? 'metal' : 'door', [0, doorHeight / 2 + 0.14, front], [doorWidth, doorHeight, 0.065]);
  add('entrance', 'trim', [0, doorHeight + 0.24, front], [doorWidth + 0.34, 0.18, 0.075]);
  for (const side of [-1, 1]) {
    add('entrance', modern ? 'stone' : 'trim', [side * (doorWidth / 2 + 0.12), doorHeight / 2 + 0.14, front], [0.16, doorHeight + 0.14, 0.075]);
  }
  // The step remains inside the original footprint; no setback space is invented.
  add('entrance_step', 'stone', [0, 0.18, depth / 2 - 0.3], [doorWidth + 0.65, 0.36, 0.6]);

  if (modern) {
    add('roof', 'roof', [0, wallHeight + 0.12, 0], [width - 0.24, 0.22, depth - 0.24]);
    const parapetHeight = height - wallHeight;
    for (const side of [-1, 1]) {
      add('parapet', 'stucco', [side * (width / 2 - 0.12), wallHeight + parapetHeight / 2, 0], [0.24, parapetHeight, depth]);
      add('parapet', 'stucco', [0, wallHeight + parapetHeight / 2, side * (depth / 2 - 0.12)], [width - 0.48, parapetHeight, 0.24]);
    }
    // A horizontal band and recessed screen emphasize the flat-roof style.
    add('floor_band', 'stone', [0, wallHeight * 0.51, front], [width - 0.3, 0.18, 0.075]);
    add('roof_service', 'metal', [width * 0.2, wallHeight + 0.27, 0], [Math.min(1.4, width * 0.15), 0.3, Math.min(1.2, depth * 0.15)]);
  } else if (tudor) {
    const roofHeight = height - wallHeight - 0.08;
    add('gable', 'stucco', [0, wallHeight, 0], [width - 0.12, roofHeight, depth - 0.12], 'gableEnds');
    add('roof', 'roof', [0, wallHeight, 0], [width, roofHeight, depth], 'gableRoof');
    add('ridge', 'roof', [0, height - 0.045, 0], [0.16, 0.08, depth - 0.06]);
    for (const face of [-1, 1]) {
      const timberZ = face * (depth / 2 - 0.055);
      add('timber', 'timber', [0, wallHeight * 0.55, timberZ], [width - 0.15, 0.13, 0.085]);
      add('timber', 'timber', [0, wallHeight - 0.08, timberZ], [width - 0.15, 0.13, 0.085]);
      for (const x of [-0.44, -0.22, 0.22, 0.44]) {
        add('timber', 'timber', [width * x, wallHeight * 0.78, timberZ], [0.13, wallHeight * 0.42, 0.085]);
      }
      const beam = (a, b) => {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        add('timber', 'timber', [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, timberZ], [0.12, Math.hypot(dx, dy), 0.085], 'box', [0, 0, Math.atan2(-dx, dy)]);
      };
      beam([-width * 0.44, wallHeight + 0.1], [0, height - 0.2]);
      beam([width * 0.44, wallHeight + 0.1], [0, height - 0.2]);
      beam([0, wallHeight], [0, height - 0.2]);
    }
  } else if (french) {
    add('roof', 'roof', [0, wallHeight, 0], [width, height * 0.30, depth], 'mansardRoof');
    add('cornice', 'trim', [0, wallHeight - 0.06, 0], [width, 0.14, depth]);
    const dormerCount = Math.max(1, Math.min(3, Math.floor(width / 5)));
    const dormerWidth = Math.min(1.5, width * 0.2);
    for (const face of [-1, 1]) {
      for (let index = 0; index < dormerCount; index += 1) {
        const x = (index - (dormerCount - 1) / 2) * width * 0.55 / dormerCount;
        const y = height * 0.80, z = face * depth * 0.4;
        add('dormer', 'stucco', [x, y, z], [dormerWidth, height * 0.13, depth * 0.14]);
        add('dormer', 'roof', [x, y + height * 0.065, z], [dormerWidth, height * 0.07, depth * 0.16], 'gableRoof');
        add('dormer', 'stucco', [x, y + height * 0.065, z], [dormerWidth - 0.08, height * 0.07, depth * 0.14], 'gableEnds');
        window(x, y, face * (depth * 0.47 + 0.015), dormerWidth * 0.68, height * 0.09, 0, 'dormer_window');
      }
    }
  } else {
    add('roof', 'roof', [0, wallHeight, 0], [width, height - wallHeight - 0.08, depth], 'hipRoof');
    add('cornice', 'trim', [0, wallHeight - 0.08, 0], [width, 0.18, depth]);
    add('entrance_pediment', 'trim', [0, doorHeight + 0.34, depth / 2 - 0.1], [doorWidth + 0.7, height * 0.055, 0.14], 'gableEnds');
  }

  if (!modern) {
    const chimneyHeight = height * 0.31;
    for (const side of french ? [1] : [-1, 1]) {
      const x = width * 0.29 * side, z = -depth * 0.16;
      add('chimney', 'brick', [x, height - chimneyHeight / 2 - 0.15, z], [0.55, chimneyHeight, 0.75]);
      add('chimney_cap', 'stone', [x, height - 0.10, z], [0.68, 0.16, 0.87]);
    }
  }
  return parts;
}

function roofGeometry(points, faces) {
  const positions = [], uvs = [];
  const middle = points.reduce((sum, point) => sum.add(new THREE.Vector3(...point)), new THREE.Vector3()).divideScalar(points.length);
  for (const face of faces) {
    const vertices = face.map((index) => new THREE.Vector3(...points[index]));
    const normal = new THREE.Vector3().crossVectors(vertices[1].clone().sub(vertices[0]), vertices[2].clone().sub(vertices[0]));
    const center = vertices.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(vertices.length);
    if (normal.dot(center.sub(middle)) < 0) vertices.reverse();
    const values = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
    const dominant = values.indexOf(Math.max(...values));
    const axes = [0, 1, 2].filter((axis) => axis !== dominant);
    for (let index = 1; index < vertices.length - 1; index += 1) {
      for (const point of [vertices[0], vertices[index], vertices[index + 1]]) {
        positions.push(...point.toArray());
        const array = point.toArray();
        uvs.push(array[axes[0]] + 0.5, array[axes[1]] + 0.5);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function architecturalGeometries() {
  const bars = [
    [[-0.4675, 0, 0], [0.065, 1, 1]], [[0.4675, 0, 0], [0.065, 1, 1]],
    [[0, -0.4675, 0], [0.87, 0.065, 1]], [[0, 0.4675, 0], [0.87, 0.065, 1]],
    [[0, 0, 0], [0.03, 0.87, 1]], [[0, 0, 0], [0.87, 0.03, 1]],
  ].map(([position, scale]) => new THREE.BoxGeometry(...scale).translate(...position));
  const frame = mergeGeometries(bars);
  bars.forEach((geometry) => geometry.dispose());
  const gable = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5], [-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5]];
  const corners = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]];
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    windowFrame: frame,
    gableEnds: roofGeometry(gable, [[0, 1, 2], [3, 4, 5]]),
    gableRoof: roofGeometry(gable, [[0, 2, 5, 3], [2, 1, 4, 5]]),
    hipRoof: roofGeometry([...corners, [-0.25, 1, 0], [0.25, 1, 0]], [[0, 1, 5, 4], [1, 2, 5], [2, 3, 4, 5], [3, 0, 4]]),
    mansardRoof: roofGeometry([...corners, [-0.32, 1, -0.32], [0.32, 1, -0.32], [0.32, 1, 0.32], [-0.32, 1, 0.32]], [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]]),
  };
}

export function partMatrix(building, part) {
  const translation = new THREE.Vector3(building.center[0], building.center[2] ?? 0, -building.center[1]);
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), building.yaw_deg * Math.PI / 180);
  const world = new THREE.Matrix4().compose(translation, yaw, new THREE.Vector3(1, 1, 1));
  const local = new THREE.Matrix4().compose(new THREE.Vector3(...part.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation)), new THREE.Vector3(...part.size));
  return world.multiply(local);
}

function surfaceTexture(kind, bump = false) {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  const base = kind === 'brick' ? [143, 111, 91] : kind === 'slate' ? [93, 105, 101] : [206, 201, 183];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const noise = ((x * 197 + y * 283 + x * y * 17) % 29) - 14;
      const courseHeight = kind === 'brick' ? 8 : 16;
      const course = Math.floor(y / courseHeight), tile = (x + (course % 2) * 16) % 32;
      const joint = kind !== 'stucco' && (y % courseHeight < 1 || tile < 1);
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[index + channel] = bump ? (joint ? 75 : 170 + noise) : joint ? (kind === 'brick' ? 172 : 61) : base[channel] + noise * (kind === 'stucco' ? 0.25 : 0.55);
      }
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(kind === 'stucco' ? 5 : 8, kind === 'slate' ? 5 : 3);
  texture.colorSpace = bump ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function architecturalMaterials() {
  const textured = (kind, extra = {}) => new THREE.MeshStandardMaterial({ map: surfaceTexture(kind), bumpMap: surfaceTexture(kind, true), bumpScale: kind === 'stucco' ? 0.025 : 0.055, roughness: 0.9, ...extra });
  return {
    brick: typeof document === 'undefined' ? textured('brick') : physicalSurface('brick', { tileSize: 2, instanced: true }),
    stucco: textured('stucco'),
    roof: textured('slate', { roughness: 0.82, side: THREE.DoubleSide }),
    stone: new THREE.MeshStandardMaterial({ color: '#b4b3a5', roughness: 0.94 }),
    trim: new THREE.MeshStandardMaterial({ color: '#ded9c7', roughness: 0.72 }),
    timber: new THREE.MeshStandardMaterial({ color: '#45483e', roughness: 0.87 }),
    metal: new THREE.MeshStandardMaterial({ color: '#596661', metalness: 0.45, roughness: 0.4 }),
    door: new THREE.MeshStandardMaterial({ color: '#645240', roughness: 0.72 }),
    glass: new THREE.MeshStandardMaterial({ color: '#c3d3d6', metalness: 0.65, roughness: 0.12, envMapIntensity: 1.5, emissive: '#302b21', emissiveIntensity: 0.1 }),
  };
}

function houseTone(id) {
  let hash = 0;
  for (const char of String(id)) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return 0.87 + (hash % 100) / 100 * 0.13;
}

export function buildBuildings(data) {
  const group = new THREE.Group();
  group.name = 'Procedural synthetic architecture';
  const geometries = architecturalGeometries(), materials = architecturalMaterials();
  const batches = new Map();
  data.buildings.forEach((building, buildingIndex) => {
    for (const part of houseParts(building)) {
      const key = `${part.geometry}:${part.material}`;
      if (!batches.has(key)) batches.set(key, { geometry: part.geometry, material: part.material, entries: [] });
      batches.get(key).entries.push({ part, building, buildingIndex });
    }
  });
  for (const [key, batch] of batches) {
    const mesh = new THREE.InstancedMesh(geometries[batch.geometry], materials[batch.material], batch.entries.length);
    mesh.name = key;
    mesh.userData.buildingIndices = new Uint32Array(batch.entries.length);
    const tint = new THREE.Color();
    batch.entries.forEach(({ part, building, buildingIndex }, index) => {
      mesh.setMatrixAt(index, partMatrix(building, part));
      const tone = houseTone(building.id);
      mesh.setColorAt(index, tint.setRGB(tone, tone, tone));
      mesh.userData.buildingIndices[index] = buildingIndex;
    });
    mesh.castShadow = batch.material !== 'glass';
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  group.userData.partCount = [...batches.values()].reduce((count, batch) => count + batch.entries.length, 0);
  group.userData.sourceBuildingCount = data.buildings.length;
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true;
    group.children.forEach((mesh) => mesh.dispose());
    Object.values(geometries).forEach((geometry) => geometry.dispose());
    Object.values(materials).forEach((material) => {
      if (!material.userData.sharedTextures) {
        material.map?.dispose();
        material.bumpMap?.dispose();
      }
      material.dispose();
    });
  };
  return group;
}
