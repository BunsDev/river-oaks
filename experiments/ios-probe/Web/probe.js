// Standalone: injected into WKWebView's isolated world, or pasted into Safari's
// inspector. No account data, URL queries, network interception or native bridge.
(function(root) {
  function createCollector({ limit = 240000 } = {}) {
    let previous = null, visible = true, intervals = [], overflow = false, invalid = 0, interruptions = 0;
    const snapshot = () => {
      const sorted = [...intervals].sort((a, b) => a - b);
      const pick = q => sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)];
      return { intervalsMs: [...intervals], overflow, invalid, interruptions,
        distribution: sorted.length ? { count: sorted.length, p50Ms: pick(.5), p95Ms: pick(.95), p99Ms: pick(.99), maxMs: pick(1) } : null };
    };
    return {
      frame(at) {
        if (!Number.isFinite(at) || previous !== null && at <= previous) { invalid++; previous = null; return; }
        if (!visible) return;
        if (previous !== null) {
          if (intervals.length >= limit) overflow = true;
          else intervals.push(at - previous);
        }
        previous = at;
      },
      visibility(value) { if (visible && !value) interruptions++; visible = value; previous = null; },
      snapshot,
      drain() { const result = snapshot(); intervals = []; return result; },
    };
  }
  function sceneSnapshot() {
    const data = document.querySelector('#canvas-host')?.dataset ?? {};
    const numeric = (raw, keys) => { try { const value = JSON.parse(raw); return Object.fromEntries(keys.filter(k => Number.isFinite(value?.[k])).map(k => [k, value[k]])); } catch { return {}; } };
    const pipeline = numeric(data.pipeline, ['samples','renderScale','aoScale','transmissionScale']);
    try { const value = JSON.parse(data.pipeline); for (const key of ['ao','bloom']) if (typeof value?.[key] === 'boolean') pipeline[key] = value[key]; } catch { /* Unavailable telemetry. */ }
    const result = { ready: data.playerReady === 'true', renderCounts: numeric(data.renderStats, ['calls','triangles','geometries','textures']), pipeline };
    for (const key of ['matureTrees','plantedBeds','storePeopleReady','storePeopleTotal']) {
      if (typeof data[key] === 'string' && data[key].trim() && Number.isFinite(Number(data[key]))) result[key] = Number(data[key]);
    }
    return result;
  }
  function install() {
    if (root.__iosProbe) return root.__iosProbe;
    const collector = createCollector(), started = performance.now();
    let readyAt = null, raf, active = true, lost = 0, restored = 0, resourceOverflow = false;
    collector.visibility(document.visibilityState === 'visible');
    const visibility = () => collector.visibility(document.visibilityState === 'visible');
    const contextLost = () => { lost++; };
    const contextRestored = () => { restored++; };
    const resourceFull = () => { resourceOverflow = true; };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('webglcontextlost', contextLost, true);
    document.addEventListener('webglcontextrestored', contextRestored, true);
    performance.addEventListener('resourcetimingbufferfull', resourceFull);
    // Keep foreground continuity; visibility() must only reset at transitions.
    let lastVisible = document.visibilityState === 'visible';
    collector.visibility(lastVisible);
    function tick(at) {
      const ready = document.querySelector('#canvas-host')?.dataset.playerReady === 'true';
      const visible = ready && document.visibilityState === 'visible';
      if (visible !== lastVisible) { collector.visibility(visible); lastVisible = visible; }
      if (ready && readyAt === null) readyAt = performance.now();
      if (visible) collector.frame(at);
      if (active) raf = requestAnimationFrame(tick);
    }
    const read = () => {
      const host = document.querySelector('#canvas-host'), canvas = document.querySelector('#viewport canvas');
      const numeric = (raw, keys) => { try { const value = JSON.parse(raw); return Object.fromEntries(keys.filter(k => Number.isFinite(value?.[k])).map(k => [k, value[k]])); } catch { return {}; } };
      const quality = numeric(host?.dataset.quality, ['scale','fps','frameMs']);
      try {
        const value = JSON.parse(host?.dataset.quality);
        if (['auto','sharp','smooth'].includes(value?.mode)) quality.mode = value.mode;
        if (typeof value?.occlusion === 'boolean') quality.occlusion = value.occlusion;
      } catch { /* No scene or unavailable quality telemetry. */ }
      const navigation = performance.getEntriesByType('navigation')[0];
      return { schema: 'typesafe.ios-probe.v1', clockMs: performance.now(), installedAtMs: started,
        source: 'requestAnimationFrame scheduling; not GPU duration or game render-loop instrumentation',
        ready: host?.dataset.playerReady === 'true', readyAtMs: readyAt, visibility: document.visibilityState,
        viewport: [innerWidth, innerHeight, devicePixelRatio], canvas: canvas ? [canvas.width, canvas.height] : null,
        renderCounts: numeric(host?.dataset.renderStats, ['calls','triangles','geometries','textures']),
        quality,
        contextLost: lost, contextRestored: restored, resourceTimingOverflow: resourceOverflow,
        resourceCount: performance.getEntriesByType('resource').length,
        transferBytes: performance.getEntriesByType('resource').reduce((sum, e) => sum + (e.transferSize || 0), 0),
        navigation: navigation ? { responseStartMs: navigation.responseStart, domContentLoadedMs: navigation.domContentLoadedEventEnd, loadMs: navigation.loadEventEnd } : null,
        ...collector.drain() };
    };
    raf = requestAnimationFrame(tick);
    root.__iosProbe = { read, stop() { active = false; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('webglcontextlost', contextLost, true); document.removeEventListener('webglcontextrestored', contextRestored, true); performance.removeEventListener('resourcetimingbufferfull', resourceFull); return read(); } };
    return root.__iosProbe;
  }
  root.IOSProbe = { createCollector, sceneSnapshot, install };
})(globalThis);
