/**
 * Normalise a NestJS HTTP error body to one displayable line: `message` is a
 * string for most errors (400/401/404) but a string[] for DTO validation
 * failures.
 */
export function extractErrorMessage(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const inner = (error as { error?: { message?: unknown } }).error;
    if (inner && typeof inner.message === 'string') return inner.message;
    if (inner && Array.isArray(inner.message)) return inner.message[0] ?? null;
  }
  return null;
}
