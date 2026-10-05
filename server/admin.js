// Jevica's owner accounts administer the town. The list is shared with the
// browser (preview/src/jevica-accounts.js), which also limits the Jevica
// appearance and name to them. The appearance a visitor chooses never grants
// these permissions.
import { JEVICA_ACCOUNT_IDS, isJevicaAccount } from '../preview/src/jevica-accounts.js';

export const JEVICA_ADMIN_USER_IDS = JEVICA_ACCOUNT_IDS;
export const isJevicaAdmin = isJevicaAccount;
