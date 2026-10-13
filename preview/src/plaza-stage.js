import { plazaSalonPlan } from './plaza-salon-plan.js';

// X at the plaza's music stage: take the stage, or step down. The town holds the
// microphone for one performer at a time (world.js `stage`), so everyone sees the
// same performer and the stage lights come up for all of them.
export const STAGE_REACH = 1.5;

export function createPlazaStage({ walking, getMultiplayer = () => null, getStageView = () => null }) {
  let stage = null, busy = false, live = null;
  const notify = text => walking.notify?.(text);
  const self = multiplayer => multiplayer?.snapshot?.players.find(player => player.id === multiplayer.identity?.id) ?? null;

  async function send(action) {
    const multiplayer = getMultiplayer();
    if (!multiplayer?.connected) { notify('Reconnect before taking an action.'); return; }
    if (busy) return;
    busy = true;
    try {
      const result = await multiplayer.command({ type: 'stage', action });
      if (!result.ok) notify(result.message ?? 'The town could not confirm that.');
      else if (result.player) walking.applyServerPose(result.player);
    } catch (error) { notify(error.message); }
    finally { busy = false; }
  }

  return {
    setWorld(world) { stage = world ? plazaSalonPlan(world)?.stage ?? null : null; live = null; },
    // The walking HUD's X action, when the stage is the nearest thing to play.
    interaction() {
      const multiplayer = getMultiplayer();
      if (!stage || !multiplayer?.connected) return null;
      if (self(multiplayer)?.performing) return { kind: 'stage', label: 'Step down from the stage', run: () => send('leave'), disabled: busy };
      const pose = walking.getPose();
      if (!pose || pose.sitting || pose.riding || pose.altitude > 0.1) return null;
      if (Math.hypot(pose.position[0] - stage.x, -pose.position[2] - stage.north) > stage.radius + STAGE_REACH) return null;
      const performer = multiplayer.snapshot?.players.find(player => player.performing);
      if (performer) return { kind: 'stage', label: `${performer.name} is performing`, run: () => {}, disabled: true };
      return { kind: 'stage', label: 'Take the stage', run: () => send('take'), disabled: busy };
    },
    // Stage lights follow whether anyone in town is performing.
    update() {
      const on = Boolean(getMultiplayer()?.snapshot?.players.some(player => player.performing));
      if (on === live) return;
      const view = getStageView();
      if (!view) return;
      live = on; view.setLive(on);
    },
  };
}
