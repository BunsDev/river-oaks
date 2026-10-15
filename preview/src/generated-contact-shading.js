// Subtle, fixed floor contact darkening for approved generated rooms. This is
// display-only: the plan's fixture bounds and collision remain unchanged.
export function generatedContactShade(room, a, d) {
  const wallDistance = Math.max(0, Math.min(a - room.aMin, room.aMax - a, room.depth - d));
  let darkening = 0.14 * Math.exp(-wallDistance / 0.32);
  for (const fixture of room.obstacles ?? []) {
    const across = Math.max(fixture.a0 - a, 0, a - fixture.a1);
    const depth = Math.max(fixture.d0 - d, 0, d - fixture.d1);
    const distance = Math.hypot(across, depth);
    darkening = Math.max(darkening, 0.18 * Math.exp(-distance / 0.28));
  }
  return Math.max(0.78, 1 - darkening);
}

export function generatedContactPixels(room, width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const front = room.frontInset, length = room.depth - front;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = room.aMin + (x + 0.5) / width * room.width;
    // Canvas row 0 maps to the back of a PlaneGeometry rotated onto the floor.
    const d = room.depth - (y + 0.5) / height * length;
    const shade = Math.round(255 * generatedContactShade(room, a, d));
    const offset = (y * width + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = shade;
    pixels[offset + 3] = 255;
  }
  return pixels;
}
