import { TextureLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Diagnostic only: constrain the HTML-image fallback to one GLTFLoader rather
// than hiding createImageBitmap from every library in the document.
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
