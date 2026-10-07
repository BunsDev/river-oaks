import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const textFields = ['runtime', 'scene', 'revision', 'capture', 'station', 'axes', 'exposure', 'time', 'weather', 'occupancy', 'rotationConvention', 'renderSettings'];
const sharedFields = ['runtime', 'scene', 'station', 'units', 'axes', 'position', 'rotation', 'projection', 'aspect', 'resolution', 'exposure', 'time', 'weather', 'occupancy', 'rotationConvention', 'renderSettings'];
const positive = value => Number.isFinite(value) && value > 0;
const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);

function validate(view, label) {
  if (!view || typeof view !== 'object' || Array.isArray(view)) return [`${label}: expected an object`];
  const errors = [];
  for (const field of textFields) {
    if (typeof view[field] !== 'string' || !view[field].trim() || /^(unknown|unavailable|not tested)$/i.test(view[field].trim())) errors.push(`${label}: missing or unknown ${field}`);
  }
  if (!['cm', 'm'].includes(view.units)) errors.push(`${label}: units must be cm or m`);
  for (const field of ['position', 'rotation']) {
    if (!vector(view[field], 3)) errors.push(`${label}: ${field} must contain three finite numbers`);
  }
  if (!positive(view.aspect)) errors.push(`${label}: aspect must be positive`);
  if (!vector(view.resolution, 2) || !view.resolution.every(n => Number.isInteger(n) && n > 0)) errors.push(`${label}: invalid resolution`);
  if (vector(view.resolution, 2) && positive(view.aspect) && Math.abs(view.aspect - view.resolution[0] / view.resolution[1]) > 1e-6) errors.push(`${label}: aspect disagrees with resolution`);
  if (view.projection === 'perspective') {
    if (!['horizontal', 'vertical'].includes(view.fovAxis)) errors.push(`${label}: invalid FOV axis`);
    if (!positive(view.fov) || view.fov >= 180) errors.push(`${label}: FOV must be between 0 and 180 degrees`);
  } else if (view.projection === 'orthographic') {
    if (!positive(view.viewSize)) errors.push(`${label}: viewSize must be positive in declared units`);
  } else errors.push(`${label}: unsupported projection`);
  return errors;
}

// Exact metadata equality is intentionally conservative; no image or runtime claims.
export function compareViews(baseline, variant) {
  const errors = [...validate(baseline, 'baseline'), ...validate(variant, 'variant')];
  const scope = 'Capture metadata only; no pixel, provenance, collision, multiplayer or performance validation.';
  if (errors.length) return { status: 'invalid', errors, scope };
  const fields = [...sharedFields, ...(baseline.projection === 'perspective' ? ['fovAxis', 'fov'] : ['viewSize'])];
  const differences = fields.filter(field => !isDeepStrictEqual(baseline[field], variant[field]));
  return { status: differences.length ? 'unmatched' : 'matched', differences, scope };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Expected baseline.json and variant.json');
    const [baseline, variant] = process.argv.slice(2).map(path => JSON.parse(readFileSync(path, 'utf8')));
    const result = compareViews(baseline, variant);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = { matched: 0, unmatched: 1, invalid: 2 }[result.status];
  } catch {
    console.log(JSON.stringify({ status: 'invalid', errors: ['Expected two readable capture-metadata JSON files.'] }));
    process.exitCode = 2;
  }
}
