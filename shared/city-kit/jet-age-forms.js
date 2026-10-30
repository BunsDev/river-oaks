// Jet-Age architectural forms (#738 Pink Jet-Age, #741 Gardens): the shape vocabulary that
// turns the boxy shells into optimistic mid-century retrofuturism (Googie and Streamline
// Moderne): saucer crowns, rounded-corner volumes, upswept boomerang canopies, parabolic
// vault ribs, jet-bridge hoops, tapered pilotis, ring lights and a starburst pylon.
//
// Pure and deterministic: every form is a function of its parameters (no randomness, no
// clock), returning plain point lists in metres. preview/src/jet-age-forms.js turns them into
// Three.js geometry; tests and scripts/jet-age-forms.mjs read them without a renderer. A form
// never decides where it stands: placements (for example preview/src/garden-campus-jet-age.js)
// own the source-contract rules (clearance, obstacles, silhouette caps).
//
// Bump JET_AGE_FORMS_VERSION when any profile's output changes; the manifest digest test pins it.
export const JET_AGE_FORMS_VERSION = 'jet-age-forms-v1';

const round = value => Math.round(value * 1e6) / 1e6;
const point = (x, y) => [round(x), round(y)];

/**
 * A rounded rectangle outline, counter-clockwise, centred at 0: width w (x) by depth d (y),
 * corner radius r (clamped to the half sides), `segments` per quarter arc.
 */
export function roundedRectOutline(w, d, r, segments = 6) {
  const hw = w / 2, hd = d / 2, radius = Math.max(0, Math.min(r, hw, hd)), out = [];
  const corners = [[hw - radius, -hd + radius, -Math.PI / 2], [hw - radius, hd - radius, 0], [-hw + radius, hd - radius, Math.PI / 2], [-hw + radius, -hd + radius, Math.PI]];
  for (const [cx, cy, start] of corners) {
    if (radius === 0) { out.push(point(cx, cy));continue; }
    for (let i = 0; i <= segments; i++) {
      const a = start + (Math.PI / 2) * (i / segments);
      out.push(point(cx + radius * Math.cos(a), cy + radius * Math.sin(a)));
    }
  }
  return out;
}

/** A stadium (capsule) outline: a rounded rectangle whose short ends are full semicircles. */
export const stadiumOutline = (w, d, segments = 8) => roundedRectOutline(w, d, Math.min(w, d) / 2, segments);

/**
 * A saucer (lens) half-profile for a lathe, from the axis outward and back: [radius, height]
 * pairs, y = 0 at the underside. A shallow dome over a thin knife rim: radius R, rim thickness
 * `rim`, dome rise `dome` above the rim and a sag `belly` below it.
 */
export function saucerProfile({ radius = 1, rim = 0.04, dome = 0.12, belly = 0.06, segments = 10 } = {}) {
  const under = [], top = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, r = radius * t;
    under.push(point(r, belly * t * t)); // lowest at the centre, rising to the rim
    top.push(point(r, belly + rim + dome * (1 - t * t)));
  }
  // Underside from the axis out, up the rim, the dome back to the axis.
  return [...under, ...top.reverse()];
}

/**
 * An upswept "boomerang" canopy side profile, closed: x from 0 (the wall) to `depth`, rising
 * by `rise` toward a rounded nose; thickness tapers from `root` at the wall to `tip`.
 */
export function boomerangProfile({ depth = 1.6, rise = 0.5, root = 0.18, tip = 0.05, segments = 12 } = {}) {
  const upper = [], lower = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, x = depth * t, lift = rise * t * t, thick = root + (tip - root) * t;
    lower.push(point(x, lift));upper.push(point(x, lift + thick));
  }
  // A half-round nose joining the two edges at the tip.
  const nose = [], [nx, ny] = lower[segments], r = tip / 2;
  for (let i = 1; i < 6; i++) {
    const a = -Math.PI / 2 + Math.PI * (i / 6);
    nose.push(point(nx + r * Math.cos(a), ny + r + r * Math.sin(a)));
  }
  return [...lower, ...nose, ...upper.reverse()];
}

/** A parabolic arch centreline in its own plane: x across `span`, y from `spring` up to `crown`. */
export function parabolicArch({ span = 10, spring = 0, crown = 1, segments = 16 } = {}) {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments, x = -span / 2 + span * t, s = 2 * t - 1;
    return point(x, spring + (crown - spring) * (1 - s * s));
  });
}

/**
 * A jet-bridge hoop centreline: two straight legs of `legHeight` at +/- width/2, joined by a
 * half-ellipse crown rising `crownRise` above the legs. y = 0 at the feet.
 */
export function hoopCentreline({ width = 3.8, legHeight = 3.4, crownRise = 0.9, segments = 14 } = {}) {
  const hw = width / 2, out = [point(-hw, 0)];
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI - Math.PI * (i / segments);
    out.push(point(hw * Math.cos(a), legHeight + crownRise * Math.sin(a)));
  }
  out.push(point(hw, 0));
  return out;
}

/** A tapered pilotis column half-profile for a lathe: wider at the head than at the foot. */
export function taperedColumnProfile({ height = 3, foot = 0.06, head = 0.13, capital = 0.04 } = {}) {
  return [point(0, 0), point(foot, 0), point(head, height - capital), point(head + 0.03, height - capital), point(head + 0.03, height), point(0, height)];
}

/**
 * Starburst ray directions: `rays` unit vectors spread evenly over a sphere by the golden
 * angle (deterministic, no seed), each with its own length from a fixed 3-step cycle.
 */
export function starburstRays({ rays = 14, length = 1, cycle = [1, 0.62, 0.8] } = {}) {
  const golden = Math.PI * (3 - Math.sqrt(5)), out = [];
  for (let i = 0; i < rays; i++) {
    const y = 1 - (2 * (i + 0.5)) / rays, r = Math.sqrt(1 - y * y), a = golden * i;
    out.push({ direction: [round(r * Math.cos(a)), round(y), round(r * Math.sin(a))], length: round(length * cycle[i % cycle.length]) });
  }
  return out;
}

/** The vocabulary: every form with its default parameters, for manifests and the showcase. */
export const JET_AGE_FORMS = Object.freeze({
  'rounded-rect': { make: () => roundedRectOutline(5, 6, 1.2), role: 'rounded-corner volumes, headhouses, kiosks' },
  stadium: { make: () => stadiumOutline(2, 6), role: 'capsule plans, signs, portals' },
  saucer: { make: () => saucerProfile({ radius: 3 }), role: 'saucer crowns and pavilion roofs (lathe)' },
  boomerang: { make: () => boomerangProfile(), role: 'upswept entrance canopies (extruded)' },
  'parabolic-arch': { make: () => parabolicArch(), role: 'vault ribs, pergolas, portals' },
  hoop: { make: () => hoopCentreline(), role: 'jet-bridge hoops over skywalks (tube)' },
  'tapered-column': { make: () => taperedColumnProfile(), role: 'pilotis and pergola posts (lathe)' },
  starburst: { make: () => starburstRays(), role: 'sputnik finials on pylons' },
});

/** A stable manifest of the vocabulary's default output: name, role, point count, FNV-1a digest. */
export function jetAgeFormsManifest() {
  const forms = Object.entries(JET_AGE_FORMS).map(([name, { make, role }]) => {
    const data = make(), text = JSON.stringify(data);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i);hash = Math.imul(hash, 0x01000193) >>> 0; }
    return { name, role, points: data.length, digest: hash.toString(16).padStart(8, '0') };
  });
  return { version: JET_AGE_FORMS_VERSION, forms };
}
