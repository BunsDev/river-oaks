// Screen-focused viewing for IPIC screenings (#500): a local camera framing of the whole film. It never
// moves the avatar or the seat, and the walking camera owns the view again the moment focus ends.
//
// From a recliner the film is close, low and to one side: the front row's seated eye would need a field of
// view over 100° to see all of it. Focus therefore looks from a bounded point instead: on the screen's own
// centre line, at the viewer's row depth (never nearer than minDistance), at the film's centre height. That
// point is inside the auditorium and above seated heads. Pure geometry, testable without a renderer.
//
// The screening panel stays on screen in both views, over the bottom of the view. Focus centres the film in the
// band above it with a lens shift (the projection's vertical off-centre term), so the camera keeps its height and
// faces the screen square-on. Where the band is too short for the viewer's row within maxFov (the front row),
// focus steps back along the centre line, never past the back row.

export const FOCUS_VIEW = Object.freeze({ minFov: 30, maxFov: 80, margin: 1.04, minDistance: 2.5, easeSeconds: 0.35, panelGapPx: 12 });

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a); return l > 0 ? a.map(v => v / l) : a; };

// The film's four corners on the screen plane: centre, unit right and up vectors as the seats see them, and
// the film's own size (the screen's width and height divided by the fit's repeat).
export function filmCorners({ center, right, up, width, height }) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => center.map((c, i) => c + right[i] * x * width / 2 + up[i] * y * height / 2));
}

// The vertical field of view (degrees) that shows every corner from a position looking at the film's centre.
export function framingFov(position, film, aspect, view = FOCUS_VIEW) {
  const forward = norm(sub(film.center, position)), right = norm(cross(forward, [0, 1, 0])), up = cross(right, forward);
  let need = 0;
  for (const corner of filmCorners(film)) {
    const v = sub(corner, position), depth = dot(v, forward);
    if (!(depth > 0)) return Infinity;
    need = Math.max(need, Math.abs(dot(v, up)) / depth, Math.abs(dot(v, right)) / depth / aspect);
  }
  return 2 * Math.atan(need * view.margin) * 180 / Math.PI;
}

// The band of the view, in normalised device coordinates (-1 at the bottom, 1 at the top), that the panel leaves
// free: from just above the panel's top edge to the top of the view. Rects are client rects ({ top, height }).
export function focusBand(viewRect, panelRect, view = FOCUS_VIEW) {
  if (!(viewRect?.height > 0) || !(panelRect?.height > 0)) return { bottom: -1, top: 1 };
  const free = Math.min(viewRect.height, Math.max(0, panelRect.top - viewRect.top - view.panelGapPx));
  return { bottom: 1 - 2 * free / viewRect.height, top: 1 };
}

// The focused framing for a viewer seated at eye: a point on the film's centre line, at the eye's distance from
// the screen plane (or further back, up to maxDistance, when the band needs it), the field of view that shows the
// whole film in the band, and the lens shift that centres it there. fits is false when even the widest
// comfortable view cannot (a narrow portrait phone): the framing is then the widest, centred in the band.
export function screenFocusPose({ eye, film, aspect, band = { bottom: -1, top: 1 }, maxDistance = 0, view = FOCUS_VIEW }) {
  const normal = norm(cross(film.right, film.up));
  const row = Math.max(view.minDistance, dot(sub(eye, film.center), normal));
  // Half-angle tangents the film needs at distance d: its height within the band, its width across the view.
  const span = Math.max(0.25, band.top - band.bottom), widest = Math.tan(view.maxFov * Math.PI / 360);
  const need = d => Math.max(film.height / (d * span), film.width / (2 * d * aspect)) * view.margin;
  const distance = need(row) <= widest ? row : Math.max(row, Math.min(maxDistance, Math.max(film.height / (widest * span), film.width / (2 * widest * aspect)) * view.margin));
  const position = film.center.map((c, i) => c + normal[i] * distance);
  const wanted = 2 * Math.atan(need(distance)) * 180 / Math.PI;
  return { position, target: [...film.center], fov: Math.min(view.maxFov, Math.max(view.minFov, wanted)), fits: wanted <= view.maxFov + 1e-9, distance, row, wanted,
    shift: (band.top + band.bottom) / 2, band: { ...band } };
}

// Smoothstep easing between the walking camera and the focused framing; reduced motion is immediate.
export function focusBlend(elapsedSeconds, { reducedMotion = false, seconds = FOCUS_VIEW.easeSeconds } = {}) {
  if (reducedMotion || !(seconds > 0)) return 1;
  const t = Math.min(1, Math.max(0, elapsedSeconds / seconds));
  return t * t * (3 - 2 * t);
}
