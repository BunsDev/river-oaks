import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { attachDistrictGalleryPlan } from '../preview/src/district-interior-contract.js';

export async function loadDistrictData() {
  const [district, vegetation, approved] = await Promise.all([
    readFile(new URL('../preview/public/data/district.json', import.meta.url), 'utf8'),
    readFile(new URL('../preview/public/data/district-vegetation.json', import.meta.url), 'utf8'),
    readFile(new URL('../preview/public/data/building-interiors/river-oaks-gallery-v2.json', import.meta.url), 'utf8'),
  ]);
  const world = JSON.parse(district);
  world.vegetation = JSON.parse(vegetation);
  const plan = JSON.parse(approved);
  const { approvedSha256, ...payload } = plan;
  if (createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== approvedSha256) {
    throw new Error('District gallery plan digest mismatch');
  }
  return attachDistrictGalleryPlan(world, plan);
}
