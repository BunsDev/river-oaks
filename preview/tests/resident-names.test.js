import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_NAME, nameSkeleton, reservedName, residentName, shownName, validGitHubLogin } from '../src/resident-names.js';

// Every way a non-admin could make a name read as Jevica.
const IMPERSONATIONS = [
  'Jevica', 'jevica', 'JEVICA', 'JeViCa', ' Jevica ', 'Jevica\n',
  'Jévica', 'Jevíca', 'Ĵevica', 'Jëvïcä', 'J́evica',
  'J e v i c a', 'J.e.v.i.c.a', 'J-e-v-i-c-a', 'J_e_v_i_c_a', 'Je\tvica',
  'Je​vica', 'Je‌vica', 'Je‍vica', 'Je⁠vica', '﻿Jevica', 'Je­vica', 'Jevica‎',
  'Jev1ca', 'Jevlca', 'JevIca', 'Jev!ca', 'Jev|ca', 'J3vica', 'Jevic4', 'Jevic@', 'J3v1c4',
  'Jеvica', 'Јevica', 'Jevicа', 'Jeviсa', 'Jevіca', 'Jeνica', 'Jεvica', 'Jevicα', 'ЈЕVІСА',
  'Ｊｅｖｉｃａ', '𝐉𝐞𝐯𝐢𝐜𝐚', '𝙹𝚎𝚟𝚒𝚌𝚊', 'ᴊᴇᴠɪᴄᴀ', 'ʲᵉᵛⁱᶜᵃ', 'Ⓙⓔⓥⓘⓒⓐ', 'Ꭻevica',
  'realjevica', 'jevica-official', 'The Jevica', 'Jevica (dev)', 'Jevica_acme', 'xX_Jevica_Xx', 'Jevica2', 'iamJEVICA',
];
const ORDINARY = ['octocat', 'BunsDev', 'Jev', 'Prince Jev', 'Jevi', 'jevic', 'evica', 'Jessica', 'Veronica', 'Juniper',
  'jev-ica-not'.replace('-ica', '-xca'), 'github-12345', 'resident', 'Val Dev'];

test('every spelling, script and disguise of Jevica is reserved', () => {
  for (const name of IMPERSONATIONS) assert.equal(reservedName(name), true, `${JSON.stringify(name)} reads as ${nameSkeleton(name)}`);
});

test('ordinary names, including near misses, are not reserved', () => {
  for (const name of ORDINARY) assert.equal(reservedName(name), false, JSON.stringify(name));
  for (const value of [null, undefined, 42, {}, [], '']) assert.equal(reservedName(value), false);
});

test('a resident is their GitHub username; only the admin is Jevica', () => {
  assert.equal(ADMIN_NAME, 'Jevica');
  assert.equal(residentName({ admin: true, login: 'BunsDev', githubId: '1' }), 'Jevica');
  assert.equal(residentName({ admin: true }), 'Jevica', 'the admin is Jevica even before GitHub answers');
  assert.equal(residentName({ login: 'octocat', githubId: '583231' }), 'octocat');
  assert.equal(residentName({ login: 'Octo-Cat', githubId: '583231' }), 'Octo-Cat', 'GitHub capitalisation is kept');
  assert.equal(residentName({ login: 'octocat_acme', githubId: '9' }), 'octocat_acme', 'enterprise managed users');
});

test('a non-admin whose GitHub username reads as Jevica is shown by GitHub account number', () => {
  for (const login of ['jevica', 'Jevica', 'JEVICA', 'jev1ca', 'jevlca', 'jevica-official', 'real-jevica', 'je-vica'])
    assert.equal(residentName({ login, githubId: '424242' }), 'github-424242', login);
});

test('an unknown or malformed GitHub username never becomes a name', () => {
  for (const login of [null, undefined, '', ' octocat', 'octo cat', 'octo--cat', '-octocat', 'octocat-', 'Jevica Admin', '<b>x</b>', 'a'.repeat(51), 'Jеvica', 42])
    assert.notEqual(residentName({ login, githubId: '77' }), login);
  assert.equal(residentName({ login: 'octo cat', githubId: '77' }), 'github-77');
  assert.equal(residentName({ login: null, githubId: null }), 'resident');
  assert.equal(residentName({ login: null, githubId: '0123' }), 'resident', 'a malformed GitHub ID is not shown');
  assert.equal(validGitHubLogin('a'), true);
  assert.equal(validGitHubLogin('a'.repeat(39)), true);
});

test('a stored name is checked again when shown: the admin is Jevica and nobody else is', () => {
  assert.equal(shownName('octocat'), 'octocat');
  assert.equal(shownName('octocat', true), 'Jevica');
  for (const name of IMPERSONATIONS) assert.equal(shownName(name), 'resident', JSON.stringify(name));
  for (const name of ['', '   ', null, undefined, 7]) assert.equal(shownName(name), 'resident');
});
