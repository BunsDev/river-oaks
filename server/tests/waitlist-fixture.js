export const approvedWaitlist = {
  async request(identity) { return { userId: identity.userId, name: identity.name, status: 'approved' }; },
  async isApproved() { return true; },
  async list() { return []; },
  async decide() { return null; },
  async setUsername() { return { ok: false, reason: 'locked' }; },
  async usernameOf() { return null; },
};
