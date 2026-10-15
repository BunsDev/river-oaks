// Prints Electron's reading of Windows shortcuts (.lnk) as JSON, including the
// AppUserModelID, for desktop/installer-acceptance.js. Run with the development
// Electron: `electron desktop/read-shortcuts.cjs <path.lnk>...`. Not packaged.
const { app, shell } = require('electron');

const result = {};
for (const path of process.argv.slice(2)) {
  try { result[path] = shell.readShortcutLink(path); } catch (error) { result[path] = { error: error.message }; }
}
process.stdout.write(`${JSON.stringify(result)}\n`, () => app.exit(0));
