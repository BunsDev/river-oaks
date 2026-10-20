// Explicit full-content scheduling experiment, never installed by default.
// Only the main page's createImageBitmap calls are queued. Inputs and output
// bitmap objects are unchanged; no pixel readback, resizing or bitmap closing.
(function(root) {
  function createQueue(decode, changed = () => {}) {
    let tail = Promise.resolve();
    const counts = { enqueued:0, completed:0, failed:0, active:0, maxActive:0, queued:0, decodedRGBABytes:0 };
    const snapshot = () => ({...counts});
    const publish = () => { try { changed(snapshot()); } catch { /* Diagnostics must not alter decoding. */ } };
    return {
      snapshot,
      run(...args) {
        const receiver = this;
        counts.enqueued++; counts.queued++; publish();
        const result = tail.then(async () => {
          counts.queued--; counts.active++; counts.maxActive = Math.max(counts.maxActive, counts.active); publish();
          try {
            const bitmap = await Reflect.apply(decode, receiver, args);
            counts.completed++;
            if (Number.isFinite(bitmap?.width) && Number.isFinite(bitmap?.height)) counts.decodedRGBABytes += bitmap.width * bitmap.height * 4;
            return bitmap;
          } catch (error) { counts.failed++; throw error; }
          finally { counts.active--; publish(); }
        });
        tail = result.then(() => {}, () => {});
        return result;
      },
    };
  }
  let installed = false;
  function install() {
    if (installed) return;
    installed = true;
    const supported = typeof root.createImageBitmap === 'function';
    const publish = counts => {
      const element = root.document?.documentElement;
      if (element) element.dataset.iosProbeDecodes = JSON.stringify({supported,...counts});
    };
    if (!supported) { publish({}); return; }
    const original = root.createImageBitmap;
    const queue = createQueue(original, publish);
    root.createImageBitmap = function(...args) {
      // Canvas/video/bitmap sources are mutable: native invocation must snapshot
      // them immediately. Only queue the immutable Blob path used by GLTFLoader.
      const blob = typeof root.Blob === 'function' && args[0] instanceof root.Blob;
      if (!blob || args.length > 2) return Reflect.apply(original, this, args);
      if (args.length === 2 && args[1] !== undefined) {
        const options = args[1];
        if (!options || Object.getPrototypeOf(options) !== Object.prototype) return Reflect.apply(original, this, args);
        const descriptors = Object.getOwnPropertyDescriptors(options);
        const keys = ['imageOrientation','premultiplyAlpha','colorSpaceConversion','resizeWidth','resizeHeight','resizeQuality'];
        if (Object.entries(descriptors).some(([key,value]) => !keys.includes(key) || !('value' in value) || !['string','number'].includes(typeof value.value))) return Reflect.apply(original, this, args);
        // WebIDL consumes option values when called, not when the queued decode starts.
        args[1] = Object.fromEntries(Object.entries(descriptors).map(([key,value]) => [key,value.value]));
      }
      return queue.run.apply(this, args);
    };
    publish(queue.snapshot());
    root.document?.addEventListener?.('DOMContentLoaded', () => publish(queue.snapshot()), {once:true});
  }
  function useHTMLImages() {
    root.createImageBitmap = undefined;
    const publish = () => {
      const element = root.document?.documentElement;
      if (element) {
        element.dataset.iosProbeDecoderMode = 'html-images';
        element.dataset.iosProbeImageBitmapAvailable = String(typeof root.createImageBitmap === 'function');
      }
    };
    publish();
    root.document?.addEventListener?.('DOMContentLoaded', publish, {once:true});
  }
  root.IOSProbeDecodes = { createQueue, install, useHTMLImages };
})(globalThis);
