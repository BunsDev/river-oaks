// Loads desktop/main.js as the packaged app would start, on the platform and
// with the arguments the test passes, and prints the Electron calls it made.
const { ExitSignal } = await import('electron');
Object.defineProperty(process, 'platform', { value: process.env.STUB_PLATFORM });
process.argv = JSON.parse(process.env.STUB_ARGV);
process.execPath = process.argv[0];
let exited = false;
try { await import('../../../main.js'); }
catch (error) { if (!(error instanceof ExitSignal)) throw error; exited = true; }
process.stdout.write(JSON.stringify({ exited, calls: globalThis.__electronCalls }));
