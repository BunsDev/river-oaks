// Three.js builders for the Jet-Age form vocabulary (shared/city-kit/jet-age-forms.js).
// Each builder returns a fresh BufferGeometry in its own local frame; placements transform
// and merge them. mergeJetAgeParts() folds every part that shares a material into one
// non-indexed geometry, so a whole vocabulary costs one draw call per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boomerangProfile, hoopCentreline, parabolicArch, saucerProfile, starburstRays, taperedColumnProfile } from '../../shared/city-kit/jet-age-forms.js';

const v2 = points => points.map(([x, y]) => new THREE.Vector2(x, y));

/** A solid prism from a closed outline in the ground plane (x, y = campus u, v), z0..z1 up. */
export function prismGeometry(outline, z0, z1, holes = []) {
  const shape = new THREE.Shape(v2(outline));
  for (const hole of holes) shape.holes.push(new THREE.Path(v2(hole)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 1 });
  // Shape (x, y) extruded along z -> campus (u, v, up): scene x = u, y = up, z = -v.
  geometry.rotateX(-Math.PI / 2);geometry.translate(0, z0, 0);
  return geometry;
}

/** A lathe (saucer, column) about the local up axis, `segments` around. */
export const latheGeometry = (profile, segments = 32) => new THREE.LatheGeometry(v2(profile), segments);
export const saucerGeometry = (options, segments = 40) => latheGeometry(saucerProfile(options), segments);
export const columnGeometry = (options, segments = 12) => latheGeometry(taperedColumnProfile(options), segments);

/** An upswept canopy: the boomerang side profile (x out, y up) extruded `width` along local -z..+z. */
export function boomerangGeometry(options, width) {
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(v2(boomerangProfile(options))), { depth: width, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -width / 2);
  return geometry;
}

/** A round tube along a polyline of 3D points (sharp joints kept, no spline overshoot). */
export function tubeGeometry(points, radius, radial = 8) {
  const path = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...points[i - 1]), new THREE.Vector3(...points[i])));
  return new THREE.TubeGeometry(path, Math.max(2, (points.length - 1) * 2), radius, radial, false);
}

/** A hoop or arch (2D centreline in its own x/y plane) as a tube standing in local x/y. */
export const hoopGeometry = (options, radius, radial) => tubeGeometry(hoopCentreline(options).map(([x, y]) => [x, y, 0]), radius, radial);
export const archGeometry = (options, radius, radial) => tubeGeometry(parabolicArch(options).map(([x, y]) => [x, y, 0]), radius, radial);

/** A flat ring light lying in the ground plane. */
export function ringGeometry(radius, tube, radial = 4, tubular = 24) {
  const geometry = new THREE.TorusGeometry(radius, tube, radial, tubular);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** A starburst: a hub sphere and tapered rays (cones) along the golden-angle directions. */
export function starburstGeometry({ rays = 14, length = 0.6, hub = 0.09, rayRadius = 0.018 } = {}) {
  const parts = [new THREE.SphereGeometry(hub, 10, 6)], up = new THREE.Vector3(0, 1, 0);
  for (const ray of starburstRays({ rays, length })) {
    const cone = new THREE.ConeGeometry(rayRadius, ray.length, 5, 1);
    const direction = new THREE.Vector3(...ray.direction).normalize();
    cone.translate(0, ray.length / 2, 0);cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction));
    parts.push(cone);
  }
  return mergeAll(parts);
}

/** The tips of a starburst, for glow beads: positions at each ray's end. */
export const starburstTips = ({ rays = 14, length = 0.6 } = {}) => starburstRays({ rays, length }).map(ray => ray.direction.map(c => c * ray.length));

// Merge geometries of mixed index state and attribute sets into one non-indexed position/normal/uv geometry.
function mergeAll(geometries) {
  const ready = geometries.map(geometry => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    for (const name of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(name)) flat.deleteAttribute(name);
    if (!flat.attributes.normal) flat.computeVertexNormals();
    if (!flat.attributes.uv) flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
    flat.clearGroups();
    return flat;
  });
  const merged = mergeGeometries(ready, false);
  for (const geometry of ready) geometry.dispose();
  if (!merged) throw new Error('Jet-Age forms: geometries could not be merged');
  return merged;
}

/**
 * Merge placed parts ({ material, geometry } with geometry already in campus space) into one
 * geometry per material key. The part geometries are consumed (disposed).
 */
export function mergeJetAgeParts(parts) {
  const byMaterial = new Map();
  for (const part of parts) {
    if (!byMaterial.has(part.material)) byMaterial.set(part.material, []);
    byMaterial.get(part.material).push(part.geometry);
  }
  return new Map([...byMaterial].map(([material, geometries]) => [material, mergeAll(geometries)]));
}
