/**
 * Error utilities
 */

/**
 * Safely extract an error message from any error type.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
