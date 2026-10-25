import { STREET } from '../../preview/src/street-profile.js';
import { footprint } from './polygon.js';

const escape = text => String(text).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c]));

export function previewSvg(artifact, world = {buildings: artifact.region.buildings.map(building => ({...building, ring: footprint(building)}))}) {
  const {region, recipe} = artifact, [w, s, e, n] = region.bounds_m;
  const polygon = ring => ring.map(([x, y]) => `${x},${-y}`).join(' ');
  const rect = ([left, bottom, right, top], attrs) => `<rect x="${left}" y="${-top}" width="${right - left}" height="${top - bottom}" ${attrs}/>`;
  const layers = [rect(region.bounds_m, 'fill="#f8f2e5"')];
  for (const parcel of recipe.reference?.parcels ?? []) {
    const path = [parcel.ring, ...parcel.holes].map(ring => `M ${ring.map(([x, y]) => `${x} ${-y}`).join(' L ')} Z`).join(' ');
    layers.push(`<path class="reference-parcel" d="${path}" fill="#b7d5a4" fill-opacity=".25" fill-rule="evenodd" stroke="#74946a" stroke-width=".4"><title>Reference parcel ${escape(parcel.source_id)}</title></path>`);
  }
  for (const area of recipe.reference?.protected ?? []) {
    const path = [area.ring, ...area.holes].map(ring => `M ${ring.map(([x, y]) => `${x} ${-y}`).join(' L ')} Z`).join(' ');
    layers.push(`<path d="${path}" fill="#b5b5bc" fill-rule="evenodd" stroke="#666675" stroke-dasharray="1 1"><title>Protected reference: ${escape(area.source_id)}</title></path>`);
  }
  for (const road of region.roads) {
    const points = polygon(road.points);
    for (let i=1;i<road.points.length;i++) layers.push(`<polyline points="${polygon(road.points.slice(i-1,i+1))}" fill="none" stroke="#d6d2c8" stroke-width="${road.width_m + (road.kind === 'footway' ? 0 : 2 * (STREET.sidewalkWidth + STREET.curbWidth))}" stroke-linecap="square"/>`);
    layers.push(`<polyline points="${points}" fill="none" stroke="#6e7e80" stroke-width="${road.width_m}"/>`);
  }
  for (const area of recipe.reserved) layers.push(rect(area.bounds_m, 'fill="#8bbd9a" fill-opacity=".5" stroke="#497b58" stroke-dasharray="1 1"'));
  for (const parcel of region.parcels) layers.push(rect(parcel.bounds_m, 'fill="none" stroke="#aa9d81" stroke-width=".4"'));
  for (const building of world.buildings) {
    const approved = artifact.approved.includes(building.id), authored = artifact.overrides.some(item => item.id === building.id);
    layers.push(`<polygon points="${polygon(building.ring)}" fill="${building.kind === 'retail' ? '#59a5a5' : '#d59aa9'}" stroke="${approved ? '#9b7020' : authored ? '#d16723' : '#3e575b'}" stroke-width="${approved || authored ? 1 : .4}"><title>${escape(building.id)} · ${building.size[2]} m${approved ? ' · approved' : authored ? ' · authored' : ''}</title></polygon>`);
  }
  layers.push(`<circle cx="${region.spawn[0]}" cy="${-region.spawn[1]}" r="1.5" fill="#522c84"><title>Arrival</title></circle>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${w - 8} ${-n - 23} ${e - w + 16} ${n - s + 40}" role="img" aria-labelledby="title desc"><title id="title">${escape(recipe.title)}</title><desc id="desc">Top-down candidate. Teal retail; rose homes; brass approved; orange authored. Geographic and visual acceptance remain separate.</desc><text x="${w}" y="${-n - 13}" font-family="sans-serif" font-size="5">${escape(recipe.title)} · seed ${escape(recipe.seed)}</text>${layers.join('')}<text x="${w}" y="${-s + 9}" font-family="sans-serif" font-size="3">${region.buildings.length} buildings · ${region.parcels.length} parcels · metres · candidate blockout</text></svg>\n`;
}
