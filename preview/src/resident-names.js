import { isJevicaAccount } from './jevica-accounts.js';

// Resident display names. A signed-in resident is shown by their GitHub
// username. Only an admin account may use a custom name, and that name is
// Jevica. Nobody else may be shown as Jevica under any spelling: different
// case, accents, lookalike letters or digits, other scripts, spacing,
// punctuation, invisible characters, or Jevica inside a longer name.

export const ADMIN_NAME = 'Jevica';
const RESERVED = 'jevica';

// GitHub usernames are ASCII letters, digits and single hyphens. Enterprise
// managed users add an _shortcode suffix.
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9_]|-(?=[A-Za-z0-9_])){0,49}$/;
export const validGitHubLogin = login => typeof login === 'string' && GITHUB_LOGIN.test(login);
export const validGitHubId = id => typeof id === 'string' && /^[1-9][0-9]{0,19}$/.test(id);

// Characters that render like a letter of "jevica" after compatibility
// decomposition and lowercasing: digits and symbols, Cyrillic, Greek, small
// capitals and other Latin variants.
const LOOKALIKES = new Map(Object.entries({
  0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'b', 7: 't', 8: 'b', 9: 'g',
  '!': 'i', '|': 'i', '¡': 'i', l: 'i', 'ı': 'i', 'ɩ': 'i', 'ɪ': 'i', 'ι': 'i', 'і': 'i', 'ї': 'i', 'ӏ': 'i',
  '@': 'a', 'а': 'a', 'ɑ': 'a', 'α': 'a', 'ᴀ': 'a', 'ά': 'a',
  'с': 'c', 'ϲ': 'c', 'ᴄ': 'c', 'ⅽ': 'c', '¢': 'c', '(': 'c',
  'е': 'e', 'ё': 'e', 'є': 'e', 'ε': 'e', 'ᴇ': 'e', 'ɛ': 'e', '€': 'e',
  'ј': 'j', 'ϳ': 'j', 'ʝ': 'j', 'ᴊ': 'j', 'ɉ': 'j',
  'ѵ': 'v', 'ν': 'v', 'ᴠ': 'v', 'ⅴ': 'v', 'ʋ': 'v',
  'о': 'o', 'ο': 'o', 'ᴏ': 'o',
  // Cherokee capitals, which lowercase to unrelated letters.
  'Ꭻ': 'j', 'Ꭼ': 'e', 'Ꮩ': 'v', 'Ꭵ': 'i', 'Ꮯ': 'c', 'Ꭺ': 'a',
}));

// The letters a name reads as, with case, accents, spacing, punctuation and
// invisible characters removed and lookalikes replaced.
export function nameSkeleton(name) {
  if (typeof name !== 'string') return '';
  let out = '';
  for (const char of name.normalize('NFKD').replace(/\p{M}/gu, '')) {
    const lower = char.toLowerCase();
    const plain = LOOKALIKES.get(char) ?? LOOKALIKES.get(lower) ?? lower;
    if (/^[a-z]$/.test(plain)) out += plain;
  }
  return out;
}

export const reservedName = name => nameSkeleton(name).includes(RESERVED);

// The name every other resident sees. `login` and `githubId` come from the
// server's GitHub lookup, never from the client.
export function residentName({ admin = false, login = null, githubId = null } = {}) {
  if (admin) return ADMIN_NAME;
  if (validGitHubLogin(login) && !reservedName(login)) return login;
  if (validGitHubId(githubId)) return `github-${githubId}`;
  return 'resident';
}

// For a name already stored with a record: the admin is always Jevica, and a
// stored name that reads as Jevica for anyone else is replaced.
export function shownName(name, admin = false) {
  if (admin) return ADMIN_NAME;
  return typeof name === 'string' && name.trim() && !reservedName(name) ? name : 'resident';
}

// shownName for a record that carries its account ID.
export const accountName = (userId, name) => shownName(name, isJevicaAccount(userId));
