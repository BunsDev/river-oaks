// Command search matches the label, shortcut and any extra search terms. Rail
// show/hide toggles sort after the commands that open something, so typing a tab
// name ("places", "people") and pressing Enter opens it instead of hiding the rail.
export function matchCommands(actions, query) {
  const text = query.trim().toLowerCase();
  const matched = actions.filter(action => `${action.label} ${action.keys ?? ''} ${action.terms ?? ''}`.toLowerCase().includes(text));
  return text ? [...matched.filter(action => !action.toggle), ...matched.filter(action => action.toggle)] : matched;
}
