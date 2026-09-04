/** Domain-level errors that bubble up to the channel as friendly messages. */
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'UNAUTHORIZED_STUDENT'
      | 'STUDENT_NOT_FOUND'
      | 'NO_AVAILABILITY'
      | 'PROVIDER_ERROR'
      | 'UNKNOWN_INTENT',
  ) {
    super(message);
    this.name = 'AgentError';
  }
}
