/**
 * Shared constants for agentrules presets and registry.
 */

/** Filename for preset configuration */
export const PRESET_CONFIG_FILENAME = "agentrules.json";

/** Directory name for preset metadata (README, LICENSE, etc.) */
export const AGENT_RULES_DIR = ".agentrules";

/** JSON Schema URL for preset configuration */
export const PRESET_SCHEMA_URL =
  "https://agentrules.directory/schema/agentrules.json";

/** API root path segment */
const API_PATH = "api";

/** Default version identifier for latest preset version */
export const LATEST_VERSION = "latest";

/**
 * API endpoint paths (relative to registry base URL).
 *
 * Note on slug handling:
 * - Slugs may contain slashes (e.g., "username/my-preset") which flow through as path segments
 * - The client is responsible for validating values before making requests
 */
export const API_ENDPOINTS = {
  /** Preset endpoints (for publishing) */
  presets: {
    /** Base path for preset operations */
    base: `${API_PATH}/presets`,
    /** Unpublish preset version (unpublishes all platform variants for that version) */
    unpublish: (slug: string, version: string) =>
      `${API_PATH}/presets/${slug}/${version}`,
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
  /** Rule endpoints (for publishing) */
  rules: {
    /** Base path for rule operations (POST to create) */
    base: `${API_PATH}/rules`,
    /** Rule by slug (PUT to update, DELETE to remove) */
    bySlug: (slug: string) => `${API_PATH}/rules/${slug}`,
  },
  /** Items endpoint - unified content retrieval */
  items: {
    /**
     * Get all versions and variants for a slug.
     * Version filtering via query param is optional (server may ignore for static registries).
     * @param slug - Content slug (may contain slashes, e.g., "username/my-preset")
     */
    get: (slug: string) => `${API_PATH}/items/${slug}`,
  },
} as const;
