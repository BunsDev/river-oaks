export function renderPixelRatio(width, height, devicePixelRatio = 1) {
  if (![width, height, devicePixelRatio].every(Number.isFinite) || width <= 0 || height <= 0 || devicePixelRatio <= 0) return 1;
  // Native UHD at 3840×2160, or Retina resolution on smaller screens, without accidentally rendering 8K.
  return Math.min(devicePixelRatio, 2, Math.sqrt((3840 * 2160) / (width * height)));
}
