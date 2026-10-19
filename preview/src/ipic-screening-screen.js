// The IPIC screen while a film shows on it (#498). The binding borrows the auditorium screen's own
// material (ipic-materials.js): it gives each loaded source and decoded size its own VideoTexture,
// fits the film inside the screen at the film's aspect, and draws the black mattes itself, so a
// film needs no baked border and its edge pixels never smear across the screen. Releasing it
// restores every borrowed property and disposes the texture; the screen's geometry and the
// world's renderer are untouched.
import { fitVideoToScreen } from './ipic-screening.js';

// Outside the film's own [0, 1] texture square the screen is black: no film, no lighting.
const MATTE = `#ifdef USE_EMISSIVEMAP
  outgoingLight *= step(0.0, vEmissiveMapUv.x) * step(vEmissiveMapUv.x, 1.0) * step(0.0, vEmissiveMapUv.y) * step(vEmissiveMapUv.y, 1.0);
#endif
#include <opaque_fragment>`;
const BORROWED = ['map', 'emissiveMap', 'emissiveIntensity', 'onBeforeCompile', 'customProgramCacheKey'];

export function createScreenBinding({ THREE }) {
  let bound = null;
  const counts = { created: 0, disposed: 0 };

  function bind(screen, video, key) {
    const material = screen.material;
    const saved = { color: material.color.clone(), emissive: material.emissive.clone(),
      own: Object.fromEntries(BORROWED.map(name => [name, Object.hasOwn(material, name) ? { value: material[name] } : null])) };
    const texture = new THREE.VideoTexture(video); counts.created++;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    const fit = fitVideoToScreen(video.videoWidth / video.videoHeight, screen.aspect);
    texture.repeat.set(...fit.repeat); texture.offset.set(...fit.offset);
    const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey;
    Object.assign(material, {
      map: texture, emissiveMap: texture, emissiveIntensity: 1,
      onBeforeCompile(shader, renderer) { compile.call(this, shader, renderer); shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', MATTE); },
      customProgramCacheKey() { return `${cacheKey.call(this)}|ipic-screen-matte`; },
    });
    material.color.set('#ffffff'); material.emissive.set('#ffffff'); material.needsUpdate = true;
    bound = { material, saved, texture, key, aspect: screen.aspect, width: video.videoWidth, height: video.videoHeight, fit, frameAt: null };
    upload(video);
  }
  // three.js uploads a VideoTexture when requestVideoFrameCallback fires. A paused element that has just
  // loaded or seeked presents no new frame, so a viewer joining a paused film (or one whose autoplay was
  // refused) would see an empty texture: upload its current frame when it binds and after each paused seek.
  function upload(video) {
    if (!bound || video.readyState < 2 || video.seeking || (!video.paused && bound.frameAt !== null) || bound.frameAt === video.currentTime) return;
    bound.texture.needsUpdate = true; bound.frameAt = video.currentTime;
  }
  function release() {
    if (!bound) return;
    const { material, saved, texture } = bound;
    for (const name of BORROWED) { if (saved.own[name]) material[name] = saved.own[name].value; else delete material[name]; }
    material.color.copy(saved.color); material.emissive.copy(saved.emissive); material.needsUpdate = true;
    texture.dispose(); counts.disposed++;
    bound = null;
  }

  return {
    // show: a decoded frame of the shared film's current source is ready. key names that source and
    // its decoded size; a new key is a new texture and fit. Called every frame.
    sync({ screen, video, key, show }) {
      if (!show || !screen?.material || !(video?.videoWidth > 0 && video.videoHeight > 0)) return release();
      if (bound?.key === key && bound.material === screen.material && bound.aspect === screen.aspect) return upload(video);
      release(); bind(screen, video, key);
    },
    release,
    inspect: () => ({ key: bound?.key ?? null, width: bound?.width ?? 0, height: bound?.height ?? 0, fit: bound?.fit ?? null, texture: bound?.texture.uuid ?? null, counts: { ...counts } }),
  };
}
