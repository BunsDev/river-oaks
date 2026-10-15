// One bounded job at a time. Superseding or cancelling a job terminates its
// worker, so even an exhausted search cannot block input or outlive the editor.
export function createSpaceAssessmentRunner({ makeWorker = () => new Worker(new URL('./space-assessment-worker.js', import.meta.url), { type: 'module' }) } = {}) {
  let current = null, disposed = false;
  const cancelled = () => new DOMException('Assessment cancelled. The draft is unchanged.', 'AbortError');
  return {
    assess(space, context, { revision, maxWork, signal } = {}) {
      current?.cancel();
      if (disposed || signal?.aborted) return Promise.reject(cancelled());
      return new Promise((resolve, reject) => {
        const worker = makeWorker();
        let settled = false;
        const timer=setTimeout(()=>finish(Error('Route assessment timed out. Retry the edit.')),10000);
        const finish = (error, result) => {
          if (settled) return;
          settled = true; clearTimeout(timer);worker.terminate(); signal?.removeEventListener('abort', cancel);
          if (current?.worker === worker) current = null;
          error ? reject(error) : resolve(result);
        };
        const cancel = () => finish(cancelled());
        current = { worker, cancel };
        signal?.addEventListener('abort', cancel, { once: true });
        worker.onmessage = ({ data }) => data.error ? finish(Error(data.error)) : finish(null, data.result);
        worker.onerror = () => finish(Error('Route assessment worker failed. Retry the edit.'));
        worker.onmessageerror = () => finish(Error('Route assessment response could not be read.'));
        try { worker.postMessage({ space, context, revision, maxWork }); } catch(error) { finish(error); }
      });
    },
    dispose() { disposed = true; current?.cancel(); },
  };
}
