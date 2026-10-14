import { runStudioCommand } from '../studio-command.js';

// The Studio host fixtures (fixtures/*.mjs) are Node scripts standing in for real
// CLIs. Unix spawns them directly through their shebang, the same way production
// spawns an installed CLI. Windows has no shebangs, and spawn() without a shell
// refuses a script (EFTYPE), so there the tests start the script with this Node
// binary. Only tests pass this wrapper: production spawning in studio-command.js
// stays shell-free, and Windows lookup still selects only .exe/.com files.
export function runFixtureCommand(executable, args, options) {
  if (process.platform === 'win32' && /\.m?js$/i.test(executable)) return runStudioCommand(process.execPath, [executable, ...args], options);
  return runStudioCommand(executable, args, options);
}
