// GitHub REST through gh, with conditional requests. Every session on this machine
// shares one account's API quota; polling `gh pr view` / `gh pr checks` spends GraphQL
// points on every turn. A GET repeated with the previous ETag answers 304 Not Modified
// when nothing changed, and GitHub does not count a 304 against the rate limit.
import { execFileSync } from 'node:child_process';

// `gh api -i` prints the status line and headers, a blank line, then the body.
export function parseResponse(text) {
  const split = text.search(/\r?\n\r?\n/), head = split < 0 ? text : text.slice(0, split);
  const [statusLine, ...lines] = head.split(/\r?\n/);
  const headers = Object.fromEntries(lines.map(line => line.split(/:\s*/)).filter(pair => pair.length > 1).map(([key, ...value]) => [key.toLowerCase(), value.join(':').trim()]));
  const body = split < 0 ? '' : text.slice(split).trim();
  return { status: Number(/^HTTP\/\S+\s+(\d+)/.exec(statusLine)?.[1]), headers, body };
}

// get(path) returns the parsed JSON body. onRate({ remaining, reset }) sees every
// response's quota headers so a caller can back off before the quota runs out.
export function conditionalGet({ exec = execFileSync, onRate = () => {} } = {}) {
  const cache = new Map();
  return path => {
    const cached = cache.get(path);
    const args = ['api', '-i', ...(cached ? ['-H', `If-None-Match: ${cached.etag}`] : []), path];
    let text;
    // gh exits nonzero on a 304, with the response still on stdout.
    try { text = exec('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (error) {
      if (cached && /^HTTP\/\S+\s+304/.test(String(error.stdout ?? ''))) text = String(error.stdout);
      else throw error;
    }
    const response = parseResponse(text);
    if (response.headers['x-ratelimit-remaining'] !== undefined) onRate({ remaining: Number(response.headers['x-ratelimit-remaining']), reset: Number(response.headers['x-ratelimit-reset']) });
    if (response.status === 304) return cached.value;
    const value = response.body ? JSON.parse(response.body) : null;
    if (response.headers.etag) cache.set(path, { etag: response.headers.etag, value });
    return value;
  };
}

// How long to wait before the next poll: the usual interval, or until the quota
// resets when fewer than `floor` requests remain.
export function nextPollDelay({ interval, rate, now = Date.now(), floor = 200 }) {
  if (!rate || !(rate.remaining < floor) || !rate.reset) return interval;
  return Math.max(interval, rate.reset * 1000 - now + 1000);
}
