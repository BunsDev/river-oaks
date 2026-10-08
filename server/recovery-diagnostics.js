// Recovery metadata must never include arbitrary storage/provider exceptions.
const messages = new Set([
  'Active visit on retired resident', 'Cannot recover enclosed resident',
  'Invalid appearances', 'Invalid build', 'Invalid build owner limit', 'Invalid builds',
  'Invalid chat', 'Invalid clocks', 'Invalid community', 'Invalid entry', 'Invalid envelope',
  'Invalid focus', 'Invalid inventory', 'Invalid legacy checkpoint', 'Invalid map',
  'Invalid player appearance', 'Invalid player position', 'Invalid players',
  'Invalid population migration', 'Invalid private home', 'Invalid private home exit',
  'Invalid resident', 'Invalid resident clock', 'Invalid resident route', 'Invalid seated player',
  'Invalid size', 'Invalid volunteer assignment', 'Invalid volunteer visit', 'Invalid wish',
  'No resident for active wish',
]);
const code = message => message.toLowerCase().replaceAll(' ', '_');
const reasons = new Set([...messages].map(code));
export const checkpointFailureReason = error => messages.has(error?.message) ? code(error.message) : 'unknown';
export const safeCheckpointReason = reason => reasons.has(reason) ? reason : 'unknown';
