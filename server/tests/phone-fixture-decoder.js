// A phone-fixture-only control for the WebKit decoder failure investigated in
// iOS probe #309. It runs before the app modules so Three.js takes its normal
// HTMLImageElement fallback for glTF textures. Never install this in a build.
export function phoneDecoderProbePlugin() {
  return {
    name: 'phone-fixture-html-image-decoder',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, context) {
        if (!context.filename.endsWith('/index.html')) return;
        const url = new URL(context.originalUrl ?? context.path, 'http://phone-fixture.invalid');
        if (url.searchParams.get('phone-decoder') !== 'html') return;
        return [{
          tag: 'script',
          attrs: { id: 'phone-decoder-control' },
          injectTo: 'head-prepend',
          children: "globalThis.createImageBitmap = undefined; document.documentElement.dataset.phoneDecoder = 'html-images';",
        }];
      },
    },
  };
}
