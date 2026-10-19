// A short flight across a game sheet's board (darts, axes): the thrown dart or axe leaves
// the hand below the board and arcs onto where the throw landed, shrinking as it flies
// away from the thrower. Reduced motion lands it at once. Screen units are the board
// SVG's own.
const SVG = 'http://www.w3.org/2000/svg';

// Where the flight is at t (0–1): along the line, lifted on an arc, and how big it looks.
export function flightPoint([x0, y0], [x1, y1], t, { lift = 40, near = 10, far = 4 } = {}) {
  const k = Math.min(1, Math.max(0, t));
  return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k - lift * 4 * k * (1 - k), r: near + (far - near) * k };
}

// Flies a marker from `from` to `to` on `svg` over `duration` ms; resolves true on arrival,
// false if `cancelled()` turns true first. The marker is removed either way.
export function flyOnBoard(svg, { from, to, duration = 260, reducedMotion = false, className = 'board-flight', lift = 40, now = () => performance.now(),
  frame = callback => requestAnimationFrame(callback), cancelled = () => false } = {}) {
  if (reducedMotion || !svg) return Promise.resolve(!cancelled());
  const marker = document.createElementNS(SVG, 'circle'), start = now();
  marker.setAttribute('class', className); marker.setAttribute('aria-hidden', 'true');
  svg.append(marker);
  return new Promise(resolve => {
    const step = () => {
      if (cancelled()) { marker.remove(); resolve(false); return; }
      const t = (now() - start) / duration, { x, y, r } = flightPoint(from, to, t, { lift });
      marker.setAttribute('cx', x.toFixed(1)); marker.setAttribute('cy', y.toFixed(1)); marker.setAttribute('r', r.toFixed(1));
      if (t >= 1) { marker.remove(); resolve(true); return; }
      frame(step);
    };
    step();
  });
}
