#!/usr/bin/env node
// Wait for a pull request without spending the shared API quota. Sessions here used
// `until gh pr view …; sleep N` and `gh pr checks --watch` loops, which spend GraphQL
// points on every turn (`gh pr checks` costs 2). This polls REST conditionally, so an
// unchanged answer costs nothing, and waits out the quota reset when it runs low.
//
//   pnpm run pr:wait <pr> [--until merged|checks] [--interval <seconds>] [--timeout <minutes>]
//
// Exit 0: merged, or every check on the current head passed. 1: closed unmerged, or a
// check failed. 2: timed out.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { conditionalGet, nextPollDelay } from './github-rest.mjs';

const PASSING = ['success', 'neutral', 'skipped'];

// get(path) returns parsed JSON; sleep(ms) waits; rate() is the latest quota seen.
export async function waitForPull({ slug, pr, until = 'merged', get, sleep, log = () => {}, interval = 60000, timeoutMs = 3 * 3600000, now = Date.now, rate = () => undefined }) {
  const deadline = now() + timeoutMs;
  let last;
  for (;;) {
    const pull = get(`repos/${slug}/pulls/${pr}`);
    let state, done;
    if (until === 'merged') {
      state = pull.merged ? `merged as ${pull.merge_commit_sha}` : pull.state === 'closed' ? 'closed without merging' : `open (${pull.mergeable_state ?? 'unknown'})`;
      if (pull.merged) done = { code: 0, state };
      else if (pull.state === 'closed') done = { code: 1, state };
    } else {
      const runs = get(`repos/${slug}/commits/${pull.head.sha}/check-runs?per_page=100`).check_runs;
      const pending = runs.filter(run => run.status !== 'completed'), failed = runs.filter(run => run.status === 'completed' && !PASSING.includes(run.conclusion));
      state = `${pull.head.sha.slice(0, 7)}: ${runs.length - pending.length}/${runs.length} complete${failed.length ? `, failed: ${failed.map(run => run.name).join(', ')}` : ''}`;
      if (runs.length && !pending.length) done = { code: failed.length ? 1 : 0, state };
    }
    if (state !== last) { log(`#${pr} ${state}`); last = state; }
    if (done) return done;
    if (now() >= deadline) return { code: 2, state: `timed out; last ${state}` };
    await sleep(nextPollDelay({ interval, rate: rate(), now: now() }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const pr = Number(args[0]), until = option('--until', 'merged');
  try {
    if (!Number.isInteger(pr) || pr <= 0 || !['merged', 'checks'].includes(until)) throw new Error('Usage: pnpm run pr:wait <pr> [--until merged|checks] [--interval <seconds>] [--timeout <minutes>]');
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const slug = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote)?.[1];
    if (!slug) throw new Error('pr:wait needs a github.com origin.');
    let latest;
    const result = await waitForPull({
      slug, pr, until, get: conditionalGet({ onRate: value => { latest = value; } }), rate: () => latest,
      sleep: ms => new Promise(done => setTimeout(done, ms)), log: line => process.stdout.write(`${line}\n`),
      interval: Math.max(15, Number(option('--interval', 60))) * 1000, timeoutMs: Number(option('--timeout', 180)) * 60000,
    });
    process.stdout.write(`${result.state}\n`);
    process.exitCode = result.code;
  } catch (error) { process.stderr.write(`pr:wait: ${error.message}\n`); process.exitCode = 2; }
}
