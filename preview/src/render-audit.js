// Used only by the explicit development audit. A full buffer is a failure,
// never a silently truncated performance sample.
export function createRenderAudit({ limit = 120000 } = {}) {
  let frames = [], previous = null, overflow = false, active = false;
  return {
    start() { frames = []; previous = null; overflow = false; active = true; },
    frame(at, cpuMs) {
      if (!active) return;
      if (previous !== null) {
        if (frames.length >= limit) overflow = true;
        else frames.push({ intervalMs: at - previous, cpuMs });
      }
      previous = at;
    },
    stop() { active = false; return { frames, overflow }; },
  };
}
