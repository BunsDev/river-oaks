#!/usr/bin/env node
// Land a pull request through a queue shared by every session on this machine.
// main requires branches to be up to date, so merges are serial; instead of
// agreeing an order by message, each session takes a turn here. On its turn the
// lander updates the branch from main, waits for Verify (rerunning failed jobs
// once for known flakes), and merges only through the merge guard.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createQueue } from './local-queue.mjs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The queue is shared with local browser runs; see local-queue.mjs.
export { createQueue };

async function waitFor(check, sleep, poll, limit, what) {
  for (let polls = 0; polls < limit; polls++) { const value = await check(); if (value) return value; await sleep(poll); }
  throw new Error(`Timed out waiting for ${what}.`);
}

// github: pull, updateBranch, verifyRun, failedJobs, rerunFailed. guard(pr): {code, output}.
export async function land({ pr, owner, github, guard, queue, log = () => {}, sleep, poll = 30000, attempts = 4, limit = 120 }) {
  queue.enqueue(pr, owner);
  try {
    for (let ahead; (ahead = queue.position(pr)) > 0;) { log(`#${pr}: ${ahead} ahead in the landing queue; waiting.`); await sleep(poll); }
    const run = (head, attempt) => waitFor(async () => { const value = await github.verifyRun(head); return value?.status === 'completed' && value.attempt >= attempt && value; }, sleep, poll, limit, `Verify on ${head.slice(0, 7)}`);
    for (let attempt = 0; attempt < attempts; attempt++) {
      const pull = await waitFor(async () => { const value = await github.pull(pr); return (value.merged || value.state !== 'open' || value.mergeable_state !== 'unknown') && value; }, sleep, poll, limit, `GitHub to compute #${pr}'s merge state`);
      if (pull.merged) return { status: 'merged', merge: pull.merge_commit_sha };
      if (pull.state !== 'open') throw new Error(`#${pr} is ${pull.state}, not open.`);
      if (pull.mergeable_state === 'dirty') throw new Error(`#${pr} conflicts with main; merge main into the branch and resolve it first.`);
      if (pull.mergeable_state === 'behind') {
        log(`#${pr}: behind main; updating the branch.`);
        await github.updateBranch(pr, pull.head);
        await waitFor(async () => (await github.pull(pr)).head !== pull.head, sleep, poll, limit, `#${pr}'s updated head`);
        continue;
      }
      let verify = await run(pull.head, 1);
      if (verify.conclusion !== 'success') {
        log(`#${pr}: Verify failed (${(await github.failedJobs(verify.id)).join(', ')}); rerunning the failed jobs once.`);
        await github.rerunFailed(verify.id);
        verify = await run(pull.head, verify.attempt + 1);
        if (verify.conclusion !== 'success') throw new Error(`#${pr}: Verify still failing after one rerun (${(await github.failedJobs(verify.id)).join(', ')}).`);
      }
      log(`#${pr}: Verify passed on ${pull.head.slice(0, 7)}; handing over to the merge guard.`);
      const result = await guard(pr), after = await github.pull(pr);
      if (after.merged) return { status: 'merged', merge: after.merge_commit_sha };
      const reason = result.output.trim().split('\n').pop();
      if (after.mergeable_state !== 'behind') throw new Error(`#${pr}: the merge guard refused (${reason}).`);
      log(`#${pr}: main moved before the merge (${reason}); going again.`);
    }
    throw new Error(`#${pr}: main kept moving; gave up after ${attempts} attempts.`);
  } finally { queue.dequeue(pr); }
}

function gitHubApi(root) {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
  const slug = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote)?.[1];
  if (!slug) throw new Error('Landing needs a github.com origin.');
  const api = (path, ...args) => { const text = execFileSync('gh', ['api', ...args, `repos/${slug}/${path}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); return text.trim() ? JSON.parse(text) : null; };
  return {
    async pull(pr) { const p = api(`pulls/${pr}`); return { state: p.state, merged: p.merged, mergeable_state: p.mergeable_state, head: p.head.sha, merge_commit_sha: p.merge_commit_sha }; },
    async updateBranch(pr, head) { api(`pulls/${pr}/update-branch`, '-X', 'PUT', '-f', `expected_head_sha=${head}`); },
    async verifyRun(head) {
      const run = api(`actions/runs?head_sha=${head}&per_page=20`).workflow_runs.find(item => item.name === 'Verify');
      return run && { id: run.id, status: run.status, conclusion: run.conclusion, attempt: run.run_attempt };
    },
    async failedJobs(id) { return api(`actions/runs/${id}/jobs?per_page=100`).jobs.filter(job => job.conclusion === 'failure').map(job => job.name); },
    async rerunFailed(id) { api(`actions/runs/${id}/rerun-failed-jobs`, '-X', 'POST'); },
  };
}

const guardRunner = path => pr => new Promise((done, fail) => {
  const child = spawn('bash', [path, String(pr)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
  child.on('error', fail);
  child.on('close', code => done({ code, output }));
});

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const common = resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim());
  const queue = createQueue({ file: join(common, 'river-oaks-land-queue.json'), lock: join(common, 'river-oaks-land-queue.lock') });
  if (args[0] === '--status') {
    const entries = queue.list();
    process.stdout.write(entries.length ? entries.map((entry, index) => `${index + 1}. #${entry.id}  ${entry.owner}  pid ${entry.pid}  since ${entry.queuedAt}`).join('\n') + '\n' : 'The landing queue is empty.\n');
  } else {
    const pr = Number(args[0]), ownerIndex = args.indexOf('--owner'), owner = ownerIndex >= 0 ? args[ownerIndex + 1] : process.env.RIVER_OAKS_LAND_OWNER;
    const guardPath = process.env.RIVER_OAKS_MERGE_GUARD ?? join(homedir(), '.claude', 'scripts', 'gh-merge-when-green.sh');
    try {
      if (!Number.isInteger(pr) || pr <= 0) throw new Error('Usage: pnpm run land <pr> [--owner <name>] | pnpm run land --status');
      // Fail closed: this tool never merges on its own judgement.
      if (!existsSync(guardPath)) throw new Error(`Merge guard not found at ${guardPath}; set RIVER_OAKS_MERGE_GUARD.`);
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { queue.dequeue(pr); process.exit(130); });
      const sleep = ms => new Promise(done => setTimeout(done, ms));
      const result = await land({ pr, owner, github: gitHubApi(process.cwd()), guard: guardRunner(guardPath), queue, sleep, log: line => process.stdout.write(`${line}\n`) });
      process.stdout.write(`#${pr} landed as ${result.merge}.\n`);
    } catch (error) { process.stderr.write(`land: ${error.message}\n`); process.exitCode = 1; }
  }
}
