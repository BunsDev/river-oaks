import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import defaults from '../config/content-filter.json' with { type: 'json' };

// Content filter for user-generated text (#292, App Review guideline 1.2). Every field a
// resident writes for others (town chat, direct messages, groups, public events, profiles
// and usernames) is screened on the server before it is stored; see docs/app-review-292.md.
//
// A term is a word or short phrase from config/content-filter.json. Text is folded the
// same way as the terms (case, accents, look-alike digits and symbols), then matched on
// whole words only, so nothing inside a longer, unrelated word matches. Two evasions are
// folded too: letters spaced out one by one ("k i l l") and a phrase run together
// ("killyourself"). What the list holds, and whether a field is refused or masked, is the
// operator's content policy (Decision 1); this module only applies it.

export const FIELDS = ['chat', 'message', 'group', 'event', 'profile', 'username'];
export const FILTERED = 'filtered';
const MESSAGES = {
  chat: 'That message can’t be sent here.',
  message: 'That message can’t be sent here.',
  group: 'That text can’t be used here.',
  event: 'That text can’t be used here.',
  profile: 'That text can’t be used here.',
  username: 'That name can’t be used here.',
};
const MAX_TERMS = 2000, MAX_TERM_LENGTH = 80, MAX_TEXT = 4000;

// Digits and symbols that read like a letter inside a word ("k1ll", "$hit", "f@g").
const LOOKALIKES = new Map(Object.entries({
  0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g',
  '@': 'a', $: 's', '€': 'e', '£': 'l', '¢': 'c',
  'ı': 'i', 'ɪ': 'i', 'ɑ': 'a', 'ß': 'ss', 'æ': 'ae', 'ø': 'o', 'œ': 'oe',
  // Cyrillic and Greek letters that render like Latin ones.
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's',
  'к': 'k', 'т': 't', 'н': 'h', 'в': 'b', 'м': 'm',
  'α': 'a', 'ε': 'e', 'ο': 'o', 'ρ': 'p', 'ν': 'v', 'ι': 'i', 'κ': 'k', 'τ': 't', 'χ': 'x', 'υ': 'y',
}));

// A character read as the letters it looks like. Digits stay digits here: they only
// read as letters inside a word that has letters (lettersOf), so a number stays a number.
const fold = char => {
  const lower = char.toLowerCase();
  if (/^[0-9]$/.test(char)) return char;
  return LOOKALIKES.get(char) ?? LOOKALIKES.get(lower) ?? lower;
};
// Apostrophes inside a word are dropped ("i'll" reads "ill"); every other non-letter ends a word.
const APOSTROPHE = /^['’ʼ]$/u;

// The words a text reads as, each with the index range it came from in the original
// string, so a masked copy can be made without moving anything else. Each code point is
// decomposed on its own ("é" to "e", "ﬁ" to "fi"), so ranges stay those of the original.
function words(text) {
  const out = [];
  let current = null;
  let index = 0;
  for (const char of text) {
    const source = index; index += char.length;
    if (APOSTROPHE.test(char)) { if (current) current.end = source + char.length; continue; }
    for (const piece of char.normalize('NFKD')) {
      if (/\p{M}/u.test(piece)) continue;
      const plain = fold(piece);
      if (!/^[a-z0-9]+$/.test(plain)) { current = null; continue; }
      if (!current) { current = { folded: '', end: source, start: source }; out.push(current); }
      current.folded += plain; current.end = source + char.length;
    }
  }
  return out;
}
// Digits inside a word that also has letters read as letters ("k1ll"); a number stays a number.
const lettersOf = folded => /[a-z]/.test(folded) ? [...folded].map(char => /[0-9]/.test(char) ? LOOKALIKES.get(char) ?? char : char).join('') : folded;

// Normalised tokens: spaced-out single letters become one word, and every word keeps
// the original range it covers.
function tokens(text) {
  const list = words(text).map(word => ({ ...word, letters: lettersOf(word.folded) }));
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].letters.length === 1 && /[a-z]/.test(list[i].letters) && i + 1 < list.length && list[i + 1].letters.length === 1 && /[a-z]/.test(list[i + 1].letters)) {
      const joined = { letters: '', start: list[i].start, end: list[i].end };
      while (i < list.length && list[i].letters.length === 1 && /[a-z]/.test(list[i].letters)) { joined.letters += list[i].letters; joined.end = list[i].end; i++; }
      i--; out.push(joined);
    } else out.push(list[i]);
  }
  return out;
}

const termWords = term => tokens(term).map(token => token.letters).filter(Boolean);

function compile(list) {
  if (!Array.isArray(list) || list.length > MAX_TERMS) throw new Error('Invalid content filter terms');
  const terms = [];
  for (const entry of list) {
    if (typeof entry !== 'string' || !entry.trim() || entry.length > MAX_TERM_LENGTH) throw new Error('Invalid content filter term');
    const parts = termWords(entry);
    if (!parts.length) throw new Error('Invalid content filter term');
    terms.push({ term: entry, parts, joined: parts.join('') });
  }
  // Longest phrase first, so a match covers the whole phrase it belongs to.
  return terms.sort((a, b) => b.parts.length - a.parts.length || b.joined.length - a.joined.length);
}

const same = (word, part) => word === part || word === `${part}s` || word === `${part}es`;

// Every match in `text`: {term, start, end, ranges} in the original string's indexes,
// `ranges` being each matched word.
export function findFiltered(text, terms) {
  if (typeof text !== 'string' || !text || text.length > MAX_TEXT) return [];
  const list = tokens(text), found = [];
  const taken = new Set();
  for (const term of terms) {
    for (let i = 0; i < list.length; i++) {
      if (taken.has(i)) continue;
      let end = -1;
      if (term.parts.length > 1 && list[i].letters === term.joined) end = i;
      else if (term.parts.every((part, offset) => i + offset < list.length && !taken.has(i + offset) && same(list[i + offset].letters, part))) end = i + term.parts.length - 1;
      if (end < 0) continue;
      const ranges = [];
      for (let k = i; k <= end; k++) { taken.add(k); ranges.push([list[k].start, list[k].end]); }
      found.push({ term: term.term, start: list[i].start, end: list[end].end, ranges });
      i = end;
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

// Each matched word is replaced by as many asterisks as it has characters; the spaces
// and punctuation around and between them stay where they were.
export function maskFiltered(text, matches) {
  let out = '', cursor = 0;
  for (const [start, end] of matches.flatMap(match => match.ranges ?? [[match.start, match.end]])) {
    out += text.slice(cursor, start) + '∗'.repeat([...text.slice(start, end)].length);
    cursor = end;
  }
  return out + text.slice(cursor);
}

function policy(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid content filter configuration');
  const mask = config.mask ?? [];
  if (!Array.isArray(mask) || mask.some(field => !FIELDS.includes(field) || field === 'username')) throw new Error('Invalid content filter mask fields');
  return { terms: compile(config.refuse ?? []), mask: new Set(mask) };
}

/**
 * The filter every text seam calls. `screen(field, text)` answers `{ ok: true, text }`
 * with the text to store (masked where the field's policy says so), or
 * `{ ok: false, reason: 'filtered', message, term }` when the text is refused. A field
 * outside FIELDS, or text that isn't a string, is left to the caller's own validation.
 */
export function createContentFilter(config = defaults) {
  const { terms, mask } = policy(config);
  const check = text => findFiltered(text, terms);
  return {
    enabled: true,
    terms: terms.map(term => term.term),
    check,
    screen(field, text) {
      if (!FIELDS.includes(field) || typeof text !== 'string') return { ok: true, text };
      const matches = check(text);
      if (!matches.length) return { ok: true, text };
      if (mask.has(field)) return { ok: true, text: maskFiltered(text, matches), masked: true };
      return { ok: false, reason: FILTERED, message: MESSAGES[field], term: matches[0].term };
    },
  };
}

let shared = null;
/** The default filter, from config/content-filter.json. */
export function defaultContentFilter() {
  if (!shared) shared = createContentFilter(defaults);
  return shared;
}

/**
 * The filter an environment configures: null when RIVER_OAKS_CONTENT_FILTER is `off`,
 * the file RIVER_OAKS_CONTENT_FILTER_FILE names when set, otherwise the default list.
 * A file that can't be read or is malformed throws: a server that was meant to filter
 * never starts without one.
 */
export function contentFilterFromEnv(env = {}, { cwd = process.cwd() } = {}) {
  if (env.RIVER_OAKS_CONTENT_FILTER === 'off') return null;
  if (env.RIVER_OAKS_CONTENT_FILTER_FILE) return createContentFilter(JSON.parse(readFileSync(resolve(cwd, env.RIVER_OAKS_CONTENT_FILTER_FILE), 'utf8')));
  return defaultContentFilter();
}

// Apply a filter that may be absent: `{ ok: true, text }` when there is none.
export const screenText = (filter, field, text) => filter ? filter.screen(field, text) : { ok: true, text };
