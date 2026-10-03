// WorkOS user IDs for Jevica's owner account in staging and production.
// The appearance a visitor chooses never grants these permissions.
export const JEVICA_ADMIN_USER_IDS = Object.freeze([
  'user_01M40Y914S1H4EJCEHH91DKTAY',
  'user_01M402HKJYDTH1QJM5NAQDZ4HH',
]);

export const isJevicaAdmin = userId => JEVICA_ADMIN_USER_IDS.includes(userId);
