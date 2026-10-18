// Screen-focused viewing for IPIC screenings (#500): a local camera framing of the whole film. It never
// moves the avatar or the seat, and the walking camera owns the view again the moment focus ends.
//
// From a recliner the film is close, low and to one side: the front row's seated eye would need a field of
// view over 100° to see all of it. Focus therefore looks from a bounded point instead: on the screen's own
// centre line, at the viewer's row depth (never nearer than minDistance), at the film's centre height. That
// point is inside the auditorium and above seated heads. Pure geometry, testable without a renderer.

export const FOCUS_VIEW = Object.freeze({ minFov: 30, maxFov: 80, margin: 1.04, minDistance: 2.5, easeSeconds: 0.35 });

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

// The focused framing for a viewer seated at eye: the point on the film's centre line at the eye's distance
// from the screen plane, and the field of view that shows the whole film there. fits is false when even the
// widest comfortable view cannot (a narrow portrait phone): the framing is then the widest, centred.
export function screenFocusPose({ eye, film, aspect, view = FOCUS_VIEW }) {
  const normal = norm(cross(film.right, film.up));
  const distance = Math.max(view.minDistance, dot(sub(eye, film.center), normal));
  const position = film.center.map((c, i) => c + normal[i] * distance);
  const wanted = framingFov(position, film, aspect, view);
  return { position, target: [...film.center], fov: Math.min(view.maxFov, Math.max(view.minFov, wanted)), fits: wanted <= view.maxFov, distance, wanted };
}

// Smoothstep easing between the walking camera and the focused framing; reduced motion is immediate.
export function focusBlend(elapsedSeconds, { reducedMotion = false, seconds = FOCUS_VIEW.easeSeconds } = {}) {
  if (reducedMotion || !(seconds > 0)) return 1;
  const t = Math.min(1, Math.max(0, elapsedSeconds / seconds));
  return t * t * (3 - 2 * t);
}
