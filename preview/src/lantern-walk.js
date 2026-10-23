import { LANTERN_REACH } from '../../shared/commons-destination.js';
import './lantern-walk.css';

// The Lantern Walk in Bayou Market Commons (server/lantern-walk.js). Standing by
// an unlit lantern offers "Light" on Z; the town's snapshot lights the scene and
// the status chip for everyone. The server re-checks reach on every request.
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const names = list => list.length <= 2 ? list.join(' & ') : `${list.slice(0, -1).join(', ')} & ${list.at(-1)}`;

export function createLanternWalkClient({ getLayout, getPose, getSnapshot, send, getScene, now = Date.now }) {
  let busy = false, shownKey = null, status = null, announced = null, wasInside = null;
  const lanterns = () => getLayout()?.destination?.lanterns ?? [];
  const inCommons = pose => { const layout = getLayout(); return Boolean(layout && pose && pose.position[0] > layout.edge); };
  const onFoot = pose => pose && !pose.sitting && !pose.riding && (pose.altitude ?? 0) <= .1;
  function nearest(pose) {
    let best = null;
    for (const lantern of lanterns()) {
      const distance = Math.hypot(pose.position[0] - lantern.at[0], -pose.position[2] - lantern.at[1]);
      // A little inside the server's reach, so a press near the edge is not refused.
      if (distance <= LANTERN_REACH - .2 && (!best || distance < best.distance)) best = { lantern, distance };
    }
    return best?.lantern ?? null;
  }
  function notice(text) {
    const element = document.querySelector('#walking-notice');
    if (!element) return;
    clearTimeout(element._timer); element.textContent = text; element.hidden = false;
    element._timer = setTimeout(() => { element.hidden = true; }, 4200);
  }
  function interaction() {
    const pose = getPose?.(), state = getSnapshot();
    if (!onFoot(pose) || !inCommons(pose)) return null;
    const lantern = nearest(pose);
    if (!lantern) return null;
    const lit = state?.lanterns.find(item => item.id === lantern.id);
    if (lit?.lit || state?.round?.completedAt) return null;
    return { kind: 'light-lantern', label: `Light the ${lantern.name}`, disabled: busy, run: async () => {
      if (busy) return;
      busy = true;
      try {
        const reply = await send({ type: 'lanterns', action: 'light', lanternId: lantern.id });
        if (!reply?.ok) notice(reply?.message ?? 'The lantern did not light.');
        else if (!reply.completed) { const count = reply.lanternWalk.lanterns.filter(item => item.lit).length; notice(`${lantern.name} lit · ${count} of ${reply.lanternWalk.lanterns.length}`); }
      } catch (error) { notice(error.message); } finally { busy = false; }
    } };
  }
  function chip() {
    if (status?.isConnected) return status;
    // Only progress is announced; the running clock is visual (aria-hidden).
    status = document.createElement('p'); status.id = 'lantern-walk-status'; status.hidden = true;
    status.innerHTML = '<span role="status" aria-live="polite" class="lantern-walk-progress"></span><span aria-hidden="true" class="lantern-walk-clock"></span>';
    (document.querySelector('#viewport') ?? document.body).append(status);
    return status;
  }
  function update() {
    const state = getSnapshot(), scene = getScene();
    if (!state || !scene?.userData.setLanterns) { if (status) status.hidden = true; return; }
    const lit = new Set(state.lanterns.filter(item => item.lit).map(item => item.id)), complete = Boolean(state.round?.completedAt);
    const key = `${[...lit].join(',')}|${complete}`;
    if (key !== shownKey) { shownKey = key; scene.userData.setLanterns(lit, complete); }
    if (complete && announced !== state.round.completedAt) {
      announced = state.round.completedAt;
      notice(`The Bayou Lantern is lit! ${clock(state.round.seconds)} · ${names(state.round.lamplighters)}`);
    }
    const element = chip(), pose = getPose?.(), inside = inCommons(pose);
    // Crossing the promenade names the place you arrive in, both ways.
    if (pose && inside !== wasInside) {
      if (inside) notice('Bayou Market Commons · Market Street, the Bayou Green and the Bayou Lantern');
      else if (wasInside) notice('Back in River Oaks District');
      wasInside = inside;
    }
    element.hidden = !inside;
    if (element.hidden) return;
    const count = lit.size, total = state.lanterns.length, elapsed = state.round && !complete ? (now() - state.round.startedAt) / 1000 : null;
    const best = state.best ? ` · Best ${clock(state.best.seconds)} (${names(state.best.lamplighters)})` : '';
    const text = complete ? `Lantern Walk · The Bayou Lantern is lit${best}` : `Lantern Walk · ${count} of ${total} lit${elapsed === null ? ' · Light all five together' : ''}${best}`;
    const progress = element.querySelector('.lantern-walk-progress'), timer = element.querySelector('.lantern-walk-clock'), ticking = elapsed === null ? '' : ` · ${clock(elapsed)}`;
    if (progress.textContent !== text) progress.textContent = text;
    if (timer.textContent !== ticking) timer.textContent = ticking;
  }
  return { interaction, update, debug: () => ({ lanterns: lanterns().map(item => ({ ...item })), state: getSnapshot(), busy, near: (() => { const pose = getPose?.(); return pose ? nearest(pose)?.id ?? null : null; })() }) };
}
