// The world-streaming bound: a lap may hold at most 20 scene objects, 20 geometries and 10 textures
// more than the warmed baseline. Resident figures come and go with who walks by, so what they alone
// hold is left out of both sides (figure-resources.js). The limits are unchanged. No figure may
// excuse more than the most one was measured to add, so growth inside a live figure still counts:
// up to 26 geometries over 240 samples on 2026-11-07, now that what only hidden objects share counts
// as the figure's (23 on 2026-11-04 before that), and up to 5 textures (2026-11-04).
export const FIGURE_GEOMETRIES = 28, FIGURE_TEXTURES = 5;

const withoutFigures = state => {
  const { figures, geometries, textures } = state.residentResources;
  return {
    geometries: state.renderer.geometries - Math.min(geometries, figures * FIGURE_GEOMETRIES),
    textures: state.renderer.textures - Math.min(textures, figures * FIGURE_TEXTURES),
  };
};

export function withinResourceBounds(rows, reference) {
  return rows.every((state, i) => {
    const now = withoutFigures(state), then = withoutFigures(reference[i]);
    return state.objects <= reference[i].objects + 20 && now.geometries <= then.geometries + 20 && now.textures <= then.textures + 10;
  });
}

// The graphics-recovery bound: across context restores no count may rise above the first sample.
// The renderer re-adds a disposal listener to each resource on its first draw after a restore, and
// resident figures change during the cycles (a swap moved the count by -10 listeners on 2026-11-07).
// What the shown figures alone hold is left out of both samples, and no figure excuses more
// listeners than the most one was measured to hold (54 across 240 samples on 2026-11-07).
export const FIGURE_LISTENERS = 58;

const listenersWithoutFigures = sample => {
  const { figures, listeners } = sample.residentResources;
  return sample.listeners - Math.min(listeners, figures * FIGURE_LISTENERS);
};

// Each sample is { memory: renderer.info.memory, listeners, residentResources }.
export function restoreBounds(samples) {
  const memory = sample => withoutFigures({ renderer: sample.memory, residentResources: sample.residentResources });
  const first = samples[0], then = memory(first), listeners = listenersWithoutFigures(first);
  return {
    listeners: samples.every(sample => listenersWithoutFigures(sample) <= listeners),
    memory: samples.every(sample => {
      const now = memory(sample);
      return now.geometries <= then.geometries && now.textures <= then.textures;
    }),
  };
}
