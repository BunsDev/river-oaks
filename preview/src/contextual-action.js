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

// Picks the HUD's primary action from each button's state ({ shown, disabled, busy }).
// A busy action (its request or animation still running) keeps its place: its
// handler ignores a repeat press, and handing the slot to another action would
// turn that repeat press into something else. Only keyboard focus pins an action;
// a mouse or touch press also leaves focus on the button it pressed.
export function primaryAction(buttons, { seated = false, focused = null, inPrimary = false, keyboard = false } = {}) {
  const available = Object.fromEntries(Object.entries(buttons).map(([id, button]) => [id, button.shown && (!button.disabled || button.busy)]));
  if (keyboard && inPrimary && focused && available[focused]) return focused;
  return contextualAction({ ...available, seated });
}
