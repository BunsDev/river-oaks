#!/usr/bin/env node
// Replace a pull request branch's unsigned history with one GitHub-signed commit.
// The merge guard refuses any unverified commit, and most sessions here cannot sign
// locally. GitHub signs commits made through its createCommitOnBranch mutation, so
// this rebuilds the branch's own changes on current main through it, on a temporary
// branch, and moves the branch only after the new tree is proven identical to main
// merged with the old head. Nothing moves without --apply.
//
//   pnpm run sign-branch <branch> [--message-file <file>] [--apply]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// git(args) returns trimmed stdout as a string, or a Buffer when `raw`.
// github: verified(sha), createRef(ref, sha), deleteRef(ref), createCommit({ branch,
// expectedHead, headline, body, additions, deletions }) -> oid.
export async function signBranch({ branch, git, github, apply = false, message, log = () => {}, remote = 'origin', base = 'main' }) {
  git(['fetch', '-q', remote, base, branch]);
  const main = git(['rev-parse', `${remote}/${base}`]), head = git(['rev-parse', `${remote}/${branch}`]);
  const own = git(['rev-list', `${remote}/${base}..${head}`]).split('\n').filter(Boolean);
  if (!own.length) throw new Error(`${branch} has no commits beyond ${base}.`);
  const unsigned = [];
  for (const sha of own) if (!(await github.verified(sha))) unsigned.push(sha);
  if (!unsigned.length) return { status: 'already-signed', head };

  const merged = mergeTree(git, main, head);
  const changes = git(['diff', '--no-renames', '--raw', '-z', git(['merge-base', main, head]), head], { raw: true });
  const { additions, deletions } = fileChanges(git, merged, changes);
  const subjects = git(['log', '--no-merges', '--format=%s', `${main}..${head}`]).split('\n').filter(Boolean).reverse();
  const [headline, ...rest] = (message ?? defaultMessage(subjects, unsigned)).split('\n');
  const plan = { status: 'planned', branch, oldHead: head, main, expectedTree: merged, unsigned, files: additions.length + deletions.length };
  log(`${branch}: ${unsigned.length} unsigned of ${own.length} commits; ${plan.files} files to rebuild on ${main.slice(0, 8)}; expected tree ${merged.slice(0, 8)}.`);
  if (!apply) return plan;

  const temp = `sign-branch/${branch}-${head.slice(0, 8)}`;
  await github.createRef(temp, main);
  try {
    const oid = await github.createCommit({ branch: temp, expectedHead: main, headline, body: rest.join('\n').trim(), additions, deletions });
    git(['fetch', '-q', remote, `refs/heads/${temp}`]);
    const tree = git(['rev-parse', `${oid}^{tree}`]), parents = git(['rev-list', '--parents', '-n', '1', oid]).split(' ').slice(1);
    if (tree !== merged) throw new Error(`Rebuilt tree ${tree.slice(0, 8)} differs from the expected ${merged.slice(0, 8)}; ${branch} left unchanged.`);
    if (parents.length !== 1 || parents[0] !== main) throw new Error(`Rebuilt commit is not a single child of ${base}; ${branch} left unchanged.`);
    if (!(await github.verified(oid))) throw new Error(`GitHub did not verify ${oid.slice(0, 8)}; ${branch} left unchanged.`);
    // Keep the old head reachable locally before the branch moves.
    git(['update-ref', `refs/sign-branch-backup/${branch}/${head}`, head]);
    git(['push', '-q', `--force-with-lease=refs/heads/${branch}:${head}`, remote, `${oid}:refs/heads/${branch}`]);
    log(`${branch}: ${head.slice(0, 8)} replaced by signed ${oid.slice(0, 8)}; backup refs/sign-branch-backup/${branch}/${head}.`);
    return { ...plan, status: 'signed', newHead: oid };
  } finally { await github.deleteRef(temp); }
}

function mergeTree(git, main, head) {
  try { return git(['merge-tree', '--write-tree', main, head]).split('\n')[0]; } catch (error) {
    throw new Error(`The branch conflicts with main; merge main and resolve first. (${error.message.split('\n')[0]})`);
  }
}

// Only regular files can be expressed through createCommitOnBranch; anything else
// (symlinks, submodules, mode changes) must be signed another way. Contents come from
// the merged tree, so a file main also changed keeps both sides' edits.
function fileChanges(git, merged, raw) {
  const fields = raw.toString('utf8').split('\0'), additions = [], deletions = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const [oldMode, newMode, , , status] = fields[i].replace(/^:/, '').split(' '), path = fields[i + 1];
    if (status === 'D') { deletions.push({ path }); continue; }
    if (newMode !== '100644' || (status === 'M' && oldMode !== newMode)) throw new Error(`${path} has mode ${newMode}${status === 'M' ? ` (was ${oldMode})` : ''}; createCommitOnBranch can only write regular files.`);
    additions.push({ path, contents: git(['show', `${merged}:${path}`], { raw: true }).toString('base64') });
  }
  return { additions, deletions };
}

function defaultMessage(subjects, unsigned) {
  const headline = subjects.at(-1) ?? 'Signed rebuild';
  const list = subjects.length > 1 ? `\n\nRebuilt from:\n${subjects.map(s => `- ${s}`).join('\n')}` : '';
  return `${headline}${list}\n\nSigned rebuild of ${unsigned.length} unsigned commit${unsigned.length === 1 ? '' : 's'} (${unsigned.map(s => s.slice(0, 8)).join(', ')}) on main.`;
}

export function localGit(cwd, exec = execFileSync) {
  return (args, { raw = false } = {}) => {
    const out = exec('git', args, { cwd, maxBuffer: 256 * 1024 * 1024, ...(raw ? {} : { encoding: 'utf8' }), stdio: ['ignore', 'pipe', 'pipe'] });
    return raw ? out : out.trim();
  };
}

// REST for refs and verification; one GraphQL mutation per signed branch.
export function gitHubCli(slug, exec = execFileSync) {
  const gh = (args, input) => {
    const text = exec('gh', ['api', ...args, ...(input ? ['--input', '-'] : [])], { encoding: 'utf8', input: input && JSON.stringify(input), maxBuffer: 64 * 1024 * 1024 });
    return text.trim() ? JSON.parse(text) : null;
  };
  return {
    async verified(sha) { return gh([`repos/${slug}/commits/${sha}`, '--jq', '{v: .commit.verification.verified}']).v === true; },
    async createRef(ref, sha) { gh([`repos/${slug}/git/refs`, '-X', 'POST'], { ref: `refs/heads/${ref}`, sha }); },
    async deleteRef(ref) { try { gh([`repos/${slug}/git/refs/heads/${ref}`, '-X', 'DELETE']); } catch { /* already gone */ } },
    async createCommit({ branch, expectedHead, headline, body, additions, deletions }) {
      const query = 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }';
      const input = { branch: { repositoryNameWithOwner: slug, branchName: branch }, expectedHeadOid: expectedHead, message: { headline, body }, fileChanges: { additions, deletions } };
      const result = gh(['graphql'], { query, variables: { input } });
      if (result.errors) throw new Error(result.errors.map(error => error.message).join('; '));
      return result.data.createCommitOnBranch.commit.oid;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const branch = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--message-file');
  try {
    if (!branch) throw new Error('Usage: pnpm run sign-branch <branch> [--message-file <file>] [--apply]');
    const git = localGit(process.cwd()), remoteUrl = git(['remote', 'get-url', 'origin']);
    const slug = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remoteUrl)?.[1];
    if (!slug) throw new Error('sign-branch needs a github.com origin.');
    const message = option('--message-file') && readFileSync(option('--message-file'), 'utf8');
    const result = await signBranch({ branch, git, github: gitHubCli(slug), apply: args.includes('--apply'), message, log: line => process.stdout.write(`${line}\n`) });
    if (result.status === 'already-signed') process.stdout.write(`${branch}: every commit is already verified; nothing to do.\n`);
    else if (result.status === 'planned') process.stdout.write('Dry run; nothing changed. Re-run with --apply to sign.\n');
  } catch (error) { process.stderr.write(`sign-branch: ${error.message}\n`); process.exitCode = 1; }
}
