import { sha256 } from './sha256.js';

// This offline compiler uses canonical JSON for reproducible artifacts and integrity checks.
export const canonical = value => JSON.stringify(value, (_, item) => {
  if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Nonfinite authoring value');
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
});
export const hash = value => sha256(canonical(value));
export const order = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export const round = value => Math.round(value * 1e6) / 1e6;
export const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
export const collections = ['roads', 'parcels', 'buildings', 'trees', 'places'];
