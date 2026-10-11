import { validateWorkplaceRequest } from '../preview/src/workplace-contract.js';

const STATUS = {invalid_request: 400, unknown_action: 404, invalid_brief: 400, companion_required: 409, companion_limit: 409, grant_required: 403,
  grant_active: 409, grant_missing: 404, grant_stale: 409, offer_settled: 409, task_active: 409, artifact_limit: 409, task_missing: 404,
  task_state: 409, artifact_missing: 404, notice_missing: 404, stations_full: 409, workplace_busy: 503};

/** Owner identity comes from the authenticated edge; nothing in the body can name another owner. */
export async function workplaceAction({action, identity, workplace, worldId, readBody, listPlaces, allowWrite, now = Date.now}) {
  if (!workplace) return {status: 404, value: {error: 'Not found.'}};
  let data;
  try {data = await readBody();} catch {return {status: 400, value: {error: 'Invalid workplace request.'}};}
  const request = validateWorkplaceRequest(action, data, now());
  if (!request.ok) return {status: STATUS[request.reason], value: {error: request.reason}};
  const actor = {userId: identity.userId, name: identity.name};
  if (!['state', 'artifact', 'occupancy'].includes(action) && !await allowWrite(identity.userId))
    return {status: 429, value: {error: 'Please wait before changing your workplace.'}};
  const result = action === 'submit'
    ? await workplace.submit(actor, request.value, {worldId, places: await listPlaces()})
    : await workplace[action](actor, request.value);
  return result.ok ? {status: action === 'submit' ? 201 : 200, value: result} : {status: STATUS[result.reason] ?? 409, value: {error: result.reason}};
}
