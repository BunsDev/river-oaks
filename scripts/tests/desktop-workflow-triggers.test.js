// Configuration-level trigger contract, not a simulation of GitHub scheduling.
// Read this workflow's simple event/filter subset; reject unsupported syntax.
// The separate scope tests execute the actual platform-selection shell step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/desktop.yml', import.meta.url), 'utf8');
const events = {}, unquote = value => value.trim().replace(/^(['"])(.*)\1$/, '$2');
const lines = workflow.match(/^on:\s*\n([\s\S]*?)(?=^\S)/m)?.[1].split('\n');
assert.ok(lines, 'Workflow events are readable');
let event, filter;
for (const raw of lines) {
  const line = raw.replace(/\s+#.*$/, '');
  if (!line.trim() || line.trimStart().startsWith('#')) continue;
  const entry = /^  (\w+):\s*$/.exec(line);
  if (entry) { event = events[entry[1]] = {}; filter = null; continue; }
  const key = /^    ([\w-]+):\s*(.*)$/.exec(line);
  if (key) {
    assert.ok(['branches', 'tags', 'paths'].includes(key[1]), `Unsupported filter: ${key[1]}`);
    filter = event[key[1]] = [];
    if (key[2]) {
      assert.ok(key[2].startsWith('[') && key[2].endsWith(']'), 'Inline filter is a list');
      filter.push(...key[2].slice(1, -1).split(',').map(unquote));
    }
    continue;
  }
  const item = /^      - (.+)$/.exec(line);
  assert.ok(item && filter, `Unsupported event syntax: ${line}`);
  filter.push(unquote(item[1]));
}

function validatePattern(pattern) {
  const literal = pattern.endsWith('/**') ? pattern.slice(0, -3) : pattern === 'v*' ? 'v' : pattern;
  assert.equal(/[*?![\]{}]/.test(literal), false, `Unsupported pattern: ${pattern}`);
}
for (const config of Object.values(events)) for (const patterns of Object.values(config)) for (const pattern of patterns) validatePattern(pattern);

// Only exact paths, directory prefixes and this workflow's v* tags are needed.
function matches(value, pattern) {
  validatePattern(pattern);
  if (pattern.endsWith('/**')) return value.startsWith(pattern.slice(0, -2));
  if (pattern === 'v*') return value.startsWith('v') && !value.includes('/');
  return value === pattern;
}
function eligible(name, { ref = 'refs/heads/main', files = [] } = {}) {
  const config = events[name];
  if (!config) return false;
  if (name === 'workflow_dispatch') return true;
  if (name === 'push') {
    const kind = ref.startsWith('refs/heads/') ? 'branches' : ref.startsWith('refs/tags/') ? 'tags' : null;
    if (!kind || (!config[kind] && (config.branches || config.tags))) return false;
    if (config[kind] && !config[kind].some(pattern => matches(ref.slice(kind === 'tags' ? 10 : 11), pattern))) return false;
    if (kind === 'tags') return true; // GitHub does not apply path filters to tags.
  } else assert.ok(!config.branches && !config.tags, 'PR branch filters need an explicit contract');
  return !config.paths || files.some(file => config.paths.some(pattern => matches(file, pattern)));
}

test('Desktop remains eligible for a documentation-only main push', () => {
  assert.equal(eligible('push', { files: ['docs/city-kit.md', 'docs/superpowers/plans/costs.md'] }), true);
});
test('Desktop remains eligible for frontend-only and empty-diff main pushes', () => {
  for (const files of [['preview/src/main.js'], []]) assert.equal(eligible('push', { files }), true);
});
test('main eligibility does not admit other branches or unversioned tags', () => {
  assert.equal(eligible('push', { ref: 'refs/heads/feature/example', files: ['desktop/main.js'] }), false);
  assert.equal(eligible('push', { ref: 'refs/tags/archive/example', files: ['desktop/main.js'] }), false);
  assert.equal(eligible('push', { ref: 'refs/tags/v0.3.0/extra', files: ['desktop/main.js'] }), false);
  assert.equal(eligible('push', { ref: 'refs/tags/v0.3.0', files: ['docs/desktop.md'] }), true);
});
test('pull requests keep their original path restrictions', () => {
  for (const file of ['desktop/main.js', 'shared/town-protocol.js', 'scripts/studio-skill-pack.js', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.github/workflows/desktop.yml']) assert.equal(eligible('pull_request', { files: [file] }), true, file);
  for (const file of ['docs/desktop.md', 'preview/src/main.js', 'server/world.js']) assert.equal(eligible('pull_request', { files: [file] }), false, file);
});
test('manual dispatch remains configured and unrelated events remain excluded', () => {
  assert.equal(eligible('workflow_dispatch'), true);
  assert.equal(eligible('pull_request_target', { files: ['desktop/main.js'] }), false);
});
test('unsupported glob forms fail instead of being treated as literal prefixes', () => {
  for (const pattern of ['desktop/?/**', 'ma?n*', 'desktop/*', '!desktop/**', 'v**', '**']) assert.throws(() => matches('desktop/main.js', pattern), /Unsupported pattern/);
});
