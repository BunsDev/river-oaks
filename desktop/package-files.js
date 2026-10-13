// Every desktop module the packaged app loads. `desktop/tests/package-files.test.js`
// walks main.js's relative imports so a new module cannot be left out silently.
export const DESKTOP_FILES = ['main.js', 'runtime.js', 'auth.js', 'photo-download.js', 'studio-download.js', 'studio-designer-host.js', 'studio-command.js',
  'studio-preload.cjs', 'studio-agent-host.js', 'studio-agent-guide.js', 'studio-scene-context.js', 'studio-codex.js', 'host-error.js'];

export const DESKTOP_SHARED_FILES = ['scripts/studio-skill-pack.js','shared/studio-space-catalog.js'];
