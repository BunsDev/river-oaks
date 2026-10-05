import { validGitHubId, validGitHubLogin } from '../preview/src/resident-names.js';

const RETRY_AFTER = 10 * 60_000;

/**
 * Finds a WorkOS user's GitHub username. WorkOS records the GitHub account ID
 * for the user's GitHub sign-in; GitHub's API maps that ID to the current
 * username. The user's own GitHub token is used when WorkOS returns one
 * ("Return GitHub OAuth tokens" in the WorkOS dashboard), then GITHUB_TOKEN if
 * configured, then an unauthenticated request. The last good answer is kept
 * per user, so a GitHub outage never changes a known name.
 *
 * `store` holds { githubId, login, checkedAt } per WorkOS user ID.
 */
export function createGitHubNames({ userManagement, store, fetcher = fetch, token = null, now = Date.now, timeoutMs = 5000 }) {
  const pending = new Map();

  async function githubIdFor(userId) {
    const identities = await userManagement.getUserIdentities(userId);
    const github = Array.isArray(identities) ? identities.find(item => item?.provider === 'GitHubOAuth') : null;
    const id = github ? String(github.idpId) : null;
    return validGitHubId(id) ? id : null;
  }

  async function githubUser(url, bearer) {
    const response = await fetcher(url, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'river-oaks',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const id = body && typeof body === 'object' ? String(body.id) : null;
    return validGitHubId(id) && validGitHubLogin(body.login) ? { githubId: id, login: body.login } : null;
  }

  async function lookUp(userId, oauthAccessToken) {
    const known = await store.get(userId).catch(() => null);
    let githubId = await githubIdFor(userId).catch(() => null) ?? (validGitHubId(known?.githubId) ? known.githubId : null);
    let found = null;
    if (typeof oauthAccessToken === 'string' && oauthAccessToken) {
      found = await githubUser('https://api.github.com/user', oauthAccessToken).catch(() => null);
      // The token belongs to this sign-in; it must name the same GitHub account.
      if (found && githubId && found.githubId !== githubId) found = null;
    }
    if (!found && githubId) {
      for (const bearer of token ? [token, null] : [null]) {
        found = await githubUser(`https://api.github.com/user/${githubId}`, bearer).catch(() => null);
        if (found) break;
      }
      if (found && found.githubId !== githubId) found = null;
    }
    if (found) {
      githubId = found.githubId;
      await store.set(userId, { githubId, login: found.login, checkedAt: now() }).catch(() => {});
      return { githubId, login: found.login };
    }
    const login = known?.githubId === githubId && validGitHubLogin(known?.login) ? known.login : null;
    await store.set(userId, { githubId, login, checkedAt: now() }).catch(() => {});
    return { githubId, login };
  }

  return {
    /** Looks the username up now, for a sign-in. */
    resolve({ userId, oauthAccessToken = null }) {
      if (!pending.has(userId)) pending.set(userId, lookUp(userId, oauthAccessToken).finally(() => pending.delete(userId)));
      return pending.get(userId);
    },
    /** The stored answer, looked up again only when missing or failed a while ago. */
    async known(userId) {
      const stored = await store.get(userId).catch(() => null);
      if (stored && (validGitHubLogin(stored.login) || now() - stored.checkedAt < RETRY_AFTER))
        return { githubId: validGitHubId(stored.githubId) ? stored.githubId : null, login: validGitHubLogin(stored.login) ? stored.login : null };
      return this.resolve({ userId });
    },
  };
}

export function createMemoryGitHubNameStore() {
  const values = new Map();
  return {
    async get(userId) { return values.get(userId) ?? null; },
    async set(userId, value) {
      if (!values.has(userId) && values.size >= 50_000) values.delete(values.keys().next().value);
      values.set(userId, value);
    },
  };
}

export function createRedisGitHubNameStore({ redis, key }) {
  return {
    async get(userId) {
      const raw = await redis.hget(key, userId);
      try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    async set(userId, value) { await redis.hset(key, userId, JSON.stringify(value)); },
  };
}
