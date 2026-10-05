// The accounts that are Jevica: her owner account in each WorkOS environment
// (WorkOS assigns a separate user ID to the same account in each). Only these
// accounts may wear the Jevica appearance, administer the town, or be shown
// with the name Jevica. Server and browser read this one list.
export const JEVICA_ACCOUNT_IDS = Object.freeze([
  'user_01M40Y914S1H4EJCEHH91DKTAY', // Staging
  'user_01M402HKJYDTH1QJM5NAQDZ4HH', // Production
]);

export const isJevicaAccount = userId => JEVICA_ACCOUNT_IDS.includes(userId);
