/**
 * URL Utilities
 */

/**
 * Builds a full URL from a base URL and path.
 * Handles trailing slashes correctly.
 *
 * @param base - Base URL (e.g., "https://example.com" or "https://example.com/")
 * @param path - Path to append (e.g., API_ENDPOINTS.auth.session)
 */
export function buildUrl(base: string, path: string): string {
  return new URL(path, base).toString();
}
