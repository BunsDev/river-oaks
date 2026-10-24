// Evidence readback is scheduled by the production frame loop, never an extra render.
export function captureWorldFrame({ schedule, readiness, read }) {
  return new Promise((resolve, reject) => {
    schedule(() => {
      try {
        const state = readiness();
        if (!state.environment || state.software || state.seeking || !state.paused || !state.ao || !state.bloom) {
          throw new Error(`Incomplete full-world color evidence: ${JSON.stringify(state)}`);
        }
        resolve(read());
      } catch (error) { reject(error); }
    });
  });
}

export function assertCaptureHour(requested, actual) {
  if (Number(actual) !== requested) throw new Error(`Unexpected lighting hour: requested ${requested}, captured ${actual}`);
}
