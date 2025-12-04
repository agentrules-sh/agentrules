/**
 * Single source of truth for platform IDs.
 * Add new platforms here - types and config will follow.
 */
export const PLATFORM_ID_TUPLE = [
  "opencode",
  "codex",
  "claude",
  "cursor",
] as const;

/** Union type of supported platform IDs, derived from PLATFORM_ID_TUPLE */
export type PlatformId = (typeof PLATFORM_ID_TUPLE)[number];

/** Configuration for a platform's directory paths */
export type PlatformConfig = {
  /** Directory name for project installs (e.g., ".opencode") */
  projectDir: string;
  /** Path for global installs (e.g., "~/.config/opencode") */
  globalDir: string;
};
