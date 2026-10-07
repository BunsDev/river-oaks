import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const readConfig = () => JSON.parse(readFileSync(join(repository, 'config/agent-workflow.json'), 'utf8'));

export function selectTasks(config, profile) {
  if (!Object.hasOwn(config.profiles, profile)) throw new Error(`Unknown profile: ${profile}`);
  return config.profiles[profile].map(id => {
    const task = config.tasks.find(candidate => candidate.id === id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    return task;
  });
}

function save(path, report) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
}

// Each check owns its process group so interruption cannot leave fixture servers behind.
function execute(task, { root, env, quiet, signal }) {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve({ status: null, error: { code: 'ABORT_ERR' } }); return; }
    const child = spawn(task.command[0], task.command.slice(1), {
      cwd: root, env, stdio: quiet ? 'ignore' : 'inherit', shell: false,
      detached: process.platform !== 'win32',
    });
    let error;
    const stop = code => {
      error = { code };
      if (!child.pid) return;
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch (failure) { if (failure.code !== 'ESRCH') error = { code: failure.code }; }
    };
    const abort = () => stop('ABORT_ERR');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop('ETIMEDOUT'), task.timeoutMs ?? 600000);
    child.on('error', failure => { error = failure; });
    child.on('close', (status, childSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve({ status, signal: childSignal, error });
    });
  });
}

export async function runProfile(profile, tasks, { root = repository, receipt, env = process.env, quiet = false, signal } = {}) {
  if (!tasks.length) throw new Error('A verification profile must contain tasks.');
  receipt ??= join(root, '.runtime/agent', `${profile}.json`);
  const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout?.trim() ?? '';
  const report = {
    schemaVersion: 1, profile, startedAt: new Date().toISOString(), status: 'running',
    revision: git(['rev-parse', 'HEAD']), dirty: Boolean(git(['status', '--porcelain'])),
    scope: 'Selected repository checks only; not production, live auth, native Unreal, human accessibility, or target GPU acceptance.',
    results: [],
  };
  save(receipt, report);
  let stopped = false;
  for (const task of tasks) {
    const result = { id: task.id, command: task.command, status: 'not_run' };
    report.results.push(result);
    if (stopped) continue;
    const missing = (task.requiresEnv ?? []).filter(name => !env[name]?.trim());
    if (missing.length) {
      Object.assign(result, { status: 'blocked', missingEnv: missing });
      stopped = true;
    } else {
      if (!quiet) console.log(`\n[${task.id}] ${task.command.join(' ')}`);
      result.status = 'running';
      save(receipt, report);
      const start = Date.now();
      const child = await execute(task, { root, env, quiet, signal });
      Object.assign(result, {
        status: child.error?.code === 'ENOENT' ? 'blocked'
          : !child.error && !child.signal && child.status === (task.expectedExit ?? 0) ? 'passed' : 'failed',
        exitCode: child.status, expectedExit: task.expectedExit ?? 0,
        signal: child.signal, error: child.error?.code, durationMs: Date.now() - start,
      });
      stopped = result.status !== 'passed';
    }
    save(receipt, report);
  }
  report.status = report.results.some(r => r.status === 'failed') ? 'failed'
    : report.results.some(r => r.status === 'blocked') ? 'blocked' : 'passed';
  report.finishedAt = new Date().toISOString();
  save(receipt, report);
  if (!quiet) console.log(`\n${profile}: ${report.status}; receipt: ${receipt}`);
  return report;
}

async function doctor(profile) {
  const tasks = selectTasks(readConfig(), profile);
  const checks = [];
  const add = (name, ok, fix) => checks.push({ name, status: ok ? 'passed' : 'blocked', ...(ok ? {} : { fix }) });
  const [major, minor] = process.versions.node.split('.').map(Number);
  add('node', major > 22 || major === 22 && minor >= 12, 'Install Node >=22.12; CI uses Node 24.');
  const commands = [...new Set(tasks.flatMap(t => [t.command[0], ...(t.requiresTools ?? [])]))];
  for (const command of commands) {
    const check = spawnSync(command, ['--version'], { cwd: repository, stdio: 'ignore', timeout: 10000 });
    add(command, check.status === 0, `Install ${command} and ensure it is on PATH.`);
  }
  if (commands.includes('npm')) add('node_modules', existsSync(join(repository, 'node_modules/.package-lock.json')), 'Run npm ci.');
  if (commands.includes('uv')) add('python environment', existsSync(join(repository, '.venv/pyvenv.cfg')), 'Run uv sync --locked.');
  for (const name of new Set(tasks.flatMap(t => t.requiresEnv ?? []))) {
    add(name, Boolean(process.env[name]?.trim()), `Set ${name} to an isolated test service; never use a production database.`);
  }
  if (tasks.some(t => t.browser)) {
    let installed = false;
    try {
      const { chromium } = await import('playwright');
      installed = existsSync(chromium.executablePath());
    } catch { /* Missing dependency is reported without dumping environment data. */ }
    add('chromium', installed, 'Run npx playwright install chromium; Linux also needs browser OS dependencies and Xvfb/Mesa for shared journeys.');
  }
  const report = { schemaVersion: 1, profile, status: checks.every(c => c.status === 'passed') ? 'passed' : 'blocked', checks,
    scope: 'Prerequisite presence only; run verification to prove behavior. No secrets or env files are read.' };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const [command = 'help', profile = 'core', ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('Too many arguments. Use: node scripts/agent.mjs <list|doctor|verify> [profile]');
  if (command === 'help') {
    console.log('Usage: node scripts/agent.mjs <list|doctor|verify> [profile]\nDefault profile: core. See docs/agent-workflow.md.');
    return;
  }
  if (command === 'list') { console.log(JSON.stringify(readConfig(), null, 2)); return; }
  if (!['doctor', 'verify'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const interruption = new AbortController();
  const interrupt = () => interruption.abort();
  for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(name, interrupt);
  try {
    const report = command === 'doctor' ? await doctor(profile)
      : await runProfile(profile, selectTasks(readConfig(), profile), { signal: interruption.signal });
    process.exitCode = report.status === 'passed' ? 0 : report.status === 'blocked' ? 2 : 1;
  } finally {
    for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(name, interrupt);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
