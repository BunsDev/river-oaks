// `node --import` this file to load desktop/main.js against the recording
// Electron stub instead of the real module (desktop/tests/squirrel.test.js).
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);
