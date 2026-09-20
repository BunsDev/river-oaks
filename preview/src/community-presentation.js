// Explanations mirror the simulation's gates; only interactWithLocal spends resources.
export function supportAvailability(state, local) {
  let blocked = null;
  if (['success', 'failed'].includes(state.status)) blocked = 'This scenario has ended.';
  else if (local.needKnown && (!local.priority || local.status === 'supported')) blocked = 'No further support needed.';
  else if (!state.running) blocked = state.elapsed > 0 ? 'Resume the scenario first.' : 'Start the scenario first.';
  else if (!local.needKnown) blocked = 'Ask what would help first.';
  else if (local.status === 'unmet') blocked = 'The support window has closed.';
  else if (local.status === 'aid_en_route') blocked = 'A volunteer visit is already assigned.';
  if (blocked) return { supply: blocked, dispatch: blocked };

  const cooldown = Math.max(0, Math.ceil(local.cooldownUntil - state.elapsed));
  return {
    supply: cooldown > 0
      ? `Next delivery in ${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, '0')} sim.`
      : state.supplies < state.scenario.supplyCost
        ? `Needs ${state.scenario.supplyCost} kits; ${state.supplies} available.`
        : null,
    dispatch: state.helpBudget < 1 ? 'No volunteer visits remaining.' : null,
  };
}
