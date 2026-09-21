import * as THREE from 'three';

// Sun elevation, sky brightness and haze move together through the day, so
// dusk actually dims the district instead of only rotating the shadows.
export function atmosphereFor(hour, weather) {
  const angle = (hour - 6) / 14 * Math.PI, elevation = Math.max(0.04, Math.sin(angle));
  const dusk = Math.min(1, Math.max(0, (hour - 16.5) / 2.5)), dawn = Math.min(1, Math.max(0, (9 - hour) / 2));
  const low = Math.max(dusk, dawn), overcast = weather === 'overcast', haze = weather === 'haze';
  const sunColor = new THREE.Color('#fff4f9').lerp(new THREE.Color('#ffb98a'), low * 0.85);
  const horizon = new THREE.Color(overcast ? '#b9c3c9' : haze ? '#d2cfc1' : '#dee0ec').lerp(new THREE.Color('#e7b9c4'), low * (overcast ? 0.25 : 0.7));
  return {
    angle, sunColor, horizon,
    sunIntensity: (overcast ? 0.8 : 3.2) * (0.3 + 0.7 * Math.min(1, elevation * 1.5)),
    ambientIntensity: (overcast ? 0.55 : 0.35) * (1 - 0.45 * low),
    environmentIntensity: (overcast ? 0.45 : 0.7) * (1 - 0.55 * low),
    backgroundIntensity: 1 - 0.6 * low,
    fogDensity: haze ? 0.0016 : overcast ? 0.0008 : 0.00055 + 0.00025 * low,
    exposure: 0.95 * (1 - 0.12 * low),
  };
}
