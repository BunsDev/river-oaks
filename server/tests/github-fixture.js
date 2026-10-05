// A stand-in for api.github.com: user lookups by numeric ID and by token.
// Tests pass `fetcher` as githubFetch, so no test reaches the real GitHub.
export function createGitHubFixture(accounts = {}) {
  const calls = [], tokens = new Map();
  const fixture = {
    accounts, tokens, calls, down: false,
    async fetcher(url, options = {}) {
      const target = new URL(url), auth = options.headers?.Authorization ?? null;
      calls.push({ path: target.pathname, auth });
      if (target.origin !== 'https://api.github.com') throw new Error(`Unexpected GitHub request to ${target.origin}`);
      if (fixture.down) return new Response('{"message":"unavailable"}', { status: 503 });
      const id = target.pathname === '/user' ? tokens.get(auth?.replace(/^Bearer /, '')) : /^\/user\/(\d+)$/.exec(target.pathname)?.[1];
      if (!id || !(id in accounts)) return new Response('{"message":"Not Found"}', { status: 404 });
      return Response.json({ id: Number(id), login: accounts[id], type: 'User', name: 'Display Name Is Ignored' });
    },
  };
  return fixture;
}

// WorkOS user ID to GitHub numeric ID, as getUserIdentities reports it.
export const githubIdentities = map => async userId => (map[userId] ? [{ idpId: map[userId], type: 'OAuth', provider: 'GitHubOAuth' }] : []);
