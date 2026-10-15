import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageBitmapLoader, TextureLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const emptyScene = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{}] });

test('avatar-only HTML control changes its glTF parser without changing the browser bitmap API', async t => {
  const original = globalThis.createImageBitmap;
  const bitmap = () => { throw new Error('No image should be decoded in this parser test'); };
  globalThis.createImageBitmap = bitmap;
  t.after(() => {
    if (original === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = original;
  });

  const module = await import('../src/gltf-image-decoder.js').catch(() => null);
  assert.ok(module?.createAssetGLTFLoader, 'a scoped glTF loader factory must exist');
  const inspect = async htmlImages => {
    const loader = module.createAssetGLTFLoader({ htmlImages });
    let textureLoader;
    loader.register(parser => {
      textureLoader = parser.textureLoader;
      return { name: 'TEST_texture_loader_capture' };
    });
    await loader.parseAsync(emptyScene, '');
    return textureLoader;
  };

  assert.ok(await inspect(true) instanceof TextureLoader);
  assert.ok(await inspect(false) instanceof ImageBitmapLoader);
  assert.equal(globalThis.createImageBitmap, bitmap);
});

test('avatar fixture control selects HTML textures for resident glTF loads', async t => {
  const original = globalThis.createImageBitmap;
  const originalControl = globalThis.__riverPhoneAvatarHtmlImages;
  globalThis.createImageBitmap = () => { throw new Error('No image should be decoded'); };
  globalThis.__riverPhoneAvatarHtmlImages = true;
  t.after(() => {
    if (original === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = original;
    if (originalControl === undefined) delete globalThis.__riverPhoneAvatarHtmlImages;
    else globalThis.__riverPhoneAvatarHtmlImages = originalControl;
  });

  const { loadResidentAvatar } = await import(`../src/avatars.js?decoder-test=${Date.now()}`);
  let selected;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async function () {
    this.register(parser => {
      selected = parser.textureLoader;
      return { name: 'TEST_avatar_texture_capture' };
    });
    await this.parseAsync(emptyScene, '');
    throw new Error('decoder selection captured');
  });
  await assert.rejects(loadResidentAvatar(0, 'decoder-probe', 'woman-casual'), /decoder selection captured/);
  assert.ok(selected instanceof TextureLoader, 'avatar glTF parser uses HTML textures');
});
