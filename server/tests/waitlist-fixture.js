export const approvedWaitlist = {
  async request(identity) { return { userId: identity.userId, name: identity.name, status: 'approved' }; },
  async isApproved() { return true; },
  async list() { return []; },
  async decide() { return null; },
};
