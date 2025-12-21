/**
 * Shared constants for agentrules.
 */

/** Filename for rule configuration */
export const RULE_CONFIG_FILENAME = "agentrules.json";

/** JSON Schema URL for rule configuration */
export const RULE_SCHEMA_URL =
  "https://agentrules.directory/schema/agentrules.json";

/** API root path segment */
const API_PATH = "api";

/** Default version identifier for latest rule version */
export const LATEST_VERSION = "latest";

/**
 * API endpoint paths (relative to registry base URL).
 *
 * Note on slug handling:
 * - Slugs may contain slashes (e.g., "username/my-rule") which flow through as path segments
 * - The client is responsible for validating values before making requests
 */
export const API_ENDPOINTS = {
  /** Rule endpoints (for publishing) */
  rules: {
    /** Base path for rule operations (POST to publish) */
    base: `${API_PATH}/rules`,
    /** Get rule by slug (GET) */
    get: (slug: string) => `${API_PATH}/rules/${slug}`,
    /** Unpublish rule version (DELETE) */
    unpublish: (slug: string, version: string) =>
      `${API_PATH}/rules/${slug}/${version}`,
  },
  /** Auth endpoints */
  auth: {
    /** Get current session */
    session: `${API_PATH}/auth/get-session`,
    /** Device authorization code request */
    deviceCode: `${API_PATH}/auth/device/code`,
    /** Device token exchange */
    deviceToken: `${API_PATH}/auth/device/token`,
  },
} as const;
