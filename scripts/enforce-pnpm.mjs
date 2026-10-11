import { existsSync, readFileSync } from 'node:fs';
const { packageManager } = JSON.parse(readFileSync('package.json', 'utf8'));
const expected = packageManager?.replace('pnpm@', '').split('+')[0];
const actual = process.env.npm_config_user_agent?.match(/^pnpm\/([^ ]+)/)?.[1];
const foreign = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'bun.lock', 'bun.lockb'].find(file => existsSync(file));
if (!expected || actual !== expected || foreign) {
  console.error(`This repository requires ${packageManager}. Use pnpm install --frozen-lockfile and pnpm run <script>.${foreign ? ` Remove ${foreign}; pnpm-lock.yaml is the only JavaScript lockfile.` : ''}`);
  process.exit(1);
}
