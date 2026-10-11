// Messages the desktop hosts write for people. Only these cross IPC to the page;
// anything else (a parse error quoting model output, a file-system error with a
// path containing the account name) is replaced by a fixed message.
export class HostError extends Error {
  constructor(message) { super(message); this.name = 'HostError'; }
}

export const publicError = (error, fallback) => new Error(error instanceof HostError ? error.message : fallback);
