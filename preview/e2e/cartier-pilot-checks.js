export function watchCartierErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location?.().url ?? ''}`); });
  return errors;
}

export function assertCartierRender(errors, glError) {
  if (glError || errors.length) throw new Error(`WebGL ${glError}: ${errors.join('; ')}`);
}

export function assertCartierWalk(before, after) {
  if (before.inside !== 'osm-node-8172494965' || after.inside !== before.inside) throw new Error('Walking must stay inside Cartier');
  if (![before.position, after.position].every(position => Array.isArray(position) && position.length === 3 && position.every(Number.isFinite))) throw new Error('Walking position must be finite');
  const distance = Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]);
  if (distance <= 0.35) throw new Error(`Walking must make meaningful progress: ${distance} m`);
  if (distance >= 6) throw new Error(`Walking must remain bounded: ${distance} m`);
  return distance;
}
