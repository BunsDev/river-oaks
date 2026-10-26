// Camera position is derived from the walker; moving the camera never moves
// the collision body, interaction origin, doorway trigger or navigation state.
export function createCameraBoom() {
  let distance=null;
  return {
    update(clearDistance,delta) {
      // Collision always wins. Only the return to an unobstructed view eases;
      // heading and the visitor's position keep their immediate input response.
      if(distance===null||delta<=0||clearDistance<distance)distance=clearDistance;
      else distance+=(clearDistance-distance)*(1-Math.exp(-8*Math.min(.08,delta)));
      return distance;
    },
  };
}

export function thirdPersonPose(state, environment) {
  const [x, eye, z] = state.position;
  const target = [x, eye - 0.25, z];
  const pitch = Math.max(-0.6, Math.min(0.5, state.pitch));
  const boomLength=state.cameraDistance??4.2;
  const distance = boomLength * Math.cos(pitch);
  const boom = [Math.sin(state.yaw) * distance, 1.05 - Math.sin(pitch) * boomLength, Math.cos(state.yaw) * distance];
  const room = environment.roomAt?.(x, z)?.storeId ?? null;
  let fraction = 0;
  for (let step = 1; step <= 42; step++) {
    const t = step / 42, px = x + boom[0] * t, pz = z + boom[2] * t;
    // Indoor rooms already define traversable floor space. Outdoor roof-height
    // restrictions would collapse the camera into the visitor inside every shop.
    const clear = room !== null ? environment.isFree(px, pz) : (environment.canFly?.(px, target[1] + boom[1] * t, pz) ?? environment.isFree(px, pz));
    const here = environment.roomAt?.(px, pz) ?? null, y = target[1] + boom[1] * t;
    if (!clear || (here?.storeId ?? null) !== room) break;
    if (y < environment.groundAt(px, pz) + 0.25) break;
    // A room that draws its ceilings (IPIC's) keeps the camera under them. Otherwise, on the escalators and
    // upstairs, the view was the top of a ceiling slab (Val, 2026-10-26).
    if (here?.ceilingAt && y > here.ceilingAt(px, -pz) - 0.3) break;
    fraction = t;
  }
  return { position: target.map((value, index) => value + boom[index] * fraction), target, showBody: fraction > 0.18 };
}

// A seat that names an eye pitch (a cinema recliner) is watched from the seated eye at that
// pitch (#368). The walking camera's boom already collapses into a recliner's back, but the pitch
// a walk leaves looks down at the sitter's own footrest, or at the backs of the row in front.
export function seatedEyeView(sitting) {
  return Number.isFinite(sitting?.eyePitch) ? { pitch: sitting.eyePitch } : null;
}

// The pitch after the server's seated pose changes: sitting in such a seat looks at what it faces,
// a reconnect or correction on the same seat keeps the sitter's own look, standing levels it.
export function pitchAfterSeatChange(before, after, pitch) {
  const eye = seatedEyeView(after);
  if (eye) return before?.buildId === after.buildId && before?.slot === after.slot ? pitch : eye.pitch;
  return seatedEyeView(before) ? 0 : pitch;
}
