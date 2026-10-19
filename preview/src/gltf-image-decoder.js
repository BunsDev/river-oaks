import { TextureLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function prefersHtmlAvatarImages(nav = globalThis.navigator) {
  const userAgent = nav?.userAgent ?? '';
  if (!userAgent.includes('AppleWebKit/')) return false;
  return /\b(?:iPhone|iPad|iPod)\b/.test(userAgent)
    || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
}

// Constrain the iOS fallback to resident avatars instead of changing image
// decoding for every loader in the document.
export function createAssetGLTFLoader({ htmlImages = false } = {}) {
  const loader = new GLTFLoader();
  if (htmlImages) loader.register(parser => {
    const textures = new TextureLoader(parser.options.manager);
    textures.setCrossOrigin(parser.options.crossOrigin);
    textures.setRequestHeader(parser.options.requestHeader);
    parser.textureLoader = textures;
    return { name: 'RIVER_OAKS_html_images' };
  });
  return loader;
}
