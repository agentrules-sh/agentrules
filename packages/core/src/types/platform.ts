/**
 * Single source of truth for platform IDs.
 * Add new platforms here - types and config will follow.
 */
const PLATFORM_ID_TUPLE = ["opencode", "codex", "claude", "cursor"] as const;

/** Union type of supported platform IDs, derived from PLATFORM_ID_TUPLE */
export type PlatformId = (typeof PLATFORM_ID_TUPLE)[number];

/** List of supported platform IDs as a readonly tuple */
export const PLATFORM_IDS = PLATFORM_ID_TUPLE;

type PlatformConfig = {
  /** Directory name for project installs (e.g., ".opencode") */
  projectDir: string;
  /** Path for global installs (e.g., "~/.config/opencode") */
  globalDir: string;
};

/**
 * Platform-specific configuration.
 * Single source of truth for all platform paths.
 */
export const PLATFORMS: Record<PlatformId, PlatformConfig> = {
  opencode: {
    projectDir: ".opencode",
    globalDir: "~/.config/opencode",
  },
  codex: {
    projectDir: ".codex",
    globalDir: "~/.codex",
  },
  claude: {
    projectDir: ".claude",
    globalDir: "~/.claude",
  },
  cursor: {
    projectDir: ".cursor",
    globalDir: "~/.cursor",
  },
};

/**
 * Convention: preset files under this directory map to the platform config directory.
 * e.g., `config/agent.md` → `.opencode/agent.md` (project) or `agent.md` (global)
 */
export const CONFIG_DIR_NAME = "config";

export function isSupportedPlatform(value: string): value is PlatformId {
  return (PLATFORM_ID_TUPLE as readonly string[]).includes(value);
}

export function normalizePlatformInput(value: string): PlatformId {
  const normalized = value.toLowerCase();
  if (isSupportedPlatform(normalized)) {
    return normalized;
  }
  throw new Error(
    `Unknown platform "${value}". Supported platforms: ${PLATFORM_IDS.join(", ")}.`
  );
}
