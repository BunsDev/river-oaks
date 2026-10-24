import { COMMONS_REVISION } from '../shared/east-garden-commons-layout.js';
import { attachEastGardenCommons } from '../preview/src/east-garden-commons-world.js';
import { HEIGHTS_REVISION } from '../shared/bayou-heights-layout.js';
import { attachBayouHeights } from '../preview/src/bayou-heights-world.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { attachDistrictGalleryPlan } from '../preview/src/district-interior-contract.js';
import { DISTRICT_REVISION_GARDENS, attachGardenCampus } from '../preview/src/garden-campus-district.js';

/** The pinned district with its approved gallery; the Gardens revision replaces the garage (#507). */
export async function loadDistrictData({ districtRevision } = {}) {
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
  const attached = attachDistrictGalleryPlan(world, plan);
  const campus = [DISTRICT_REVISION_GARDENS,COMMONS_REVISION,HEIGHTS_REVISION].includes(districtRevision) ? attachGardenCampus(attached) : attached;
  const commons = [COMMONS_REVISION,HEIGHTS_REVISION].includes(districtRevision) ? attachEastGardenCommons(campus) : campus;
  // Bayou Heights composes across the bayou from the Commons (#586 continuation).
  return districtRevision === HEIGHTS_REVISION ? attachBayouHeights(commons) : commons;
}
