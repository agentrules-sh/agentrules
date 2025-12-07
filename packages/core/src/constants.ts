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
 */
export const API_ENDPOINTS = {
  /** Preset endpoints */
  presets: {
    /** Base path for preset operations */
    base: `${API_PATH}/preset`,
    /** Get preset by slug, platform, and version (defaults to "latest") */
    get: (slug: string, platform: string, version: string = LATEST_VERSION) =>
      `${API_PATH}/preset/${encodeURIComponent(slug)}/${encodeURIComponent(platform)}/${encodeURIComponent(version)}`,
    /** Unpublish preset version */
    unpublish: (slug: string, platform: string, version: string) =>
      `${API_PATH}/preset/${encodeURIComponent(slug)}/${encodeURIComponent(platform)}/${encodeURIComponent(version)}`,
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
  /** Rule endpoints */
  rule: {
    /** Base path for rule operations */
    base: `${API_PATH}/rule`,
    /** Get or update rule by slug */
    get: (slug: string) => `${API_PATH}/rule/${encodeURIComponent(slug)}`,
  },
} as const;
