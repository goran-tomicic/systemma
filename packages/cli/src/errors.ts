// A mistake in how the command was called. Reported with a hint to read the help.
export class UsageError extends Error {}

// A problem with an input: a file that is missing, unreadable, not a token file, or a config that is invalid.
// Reported as it is, with exit code 2.
export class InputError extends Error {
  constructor(readonly messages: string[]) {
    super(messages.join('\n'));
  }
}
