// Only current, enabled actions enter this policy; the actual handlers still
// recheck reach, doorway permissions and server-owned interactions on activation.
export function contextualAction({ seated = false, talk = false, enter = false, interact = false, meet = false } = {}) {
  if (seated && interact) return 'interact';
  if (talk) return 'talk';
  if (enter) return 'enter';
  if (interact) return 'interact';
  if (meet) return 'meet';
  return null;
}
