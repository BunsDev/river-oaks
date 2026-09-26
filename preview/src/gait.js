// Exponential easing takes the shortest arc and is independent of refresh rate.
export function turnToward(current, target, delta, responsiveness = 9.75) {
  if (![current, target, delta].every(Number.isFinite) || delta <= 0) return current;
  const arc = Math.atan2(Math.sin(target-current), Math.cos(target-current));
  return current + arc * (1-Math.exp(-responsiveness*Math.min(delta, 0.1)));
}
