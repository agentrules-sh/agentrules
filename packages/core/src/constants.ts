/**
 * Shared constants for agentrules presets and registry.
 */

/** Filename for preset configuration */
export const PRESET_CONFIG_FILENAME = "agentrules.json";

/** JSON Schema URL for preset configuration */
export const PRESET_SCHEMA_URL =
  "https://agentrules.directory/schema/agentrules.json";

/** API root path segment */
const API_PATH = "api";

/**
 * API endpoint paths (relative to registry base URL).
 */
export const API_ENDPOINTS = {
  /** Preset endpoints */
  presets: {
    /** Base path for preset operations */
    base: `${API_PATH}/presets`,
    /** Get/publish preset entry */
    entry: (slug: string, platform: string) =>
      `${API_PATH}/presets/${slug}/${platform}`,
    /** Unpublish preset version */
    unpublish: (slug: string, platform: string, version: string) =>
      `${API_PATH}/presets/${encodeURIComponent(slug)}/${encodeURIComponent(platform)}/${encodeURIComponent(version)}`,
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
