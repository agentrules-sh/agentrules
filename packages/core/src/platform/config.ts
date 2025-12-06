import type { PlatformConfig, PlatformId } from "./types";
import { PLATFORM_ID_TUPLE } from "./types";

/** List of supported platform IDs as a readonly tuple */
export const PLATFORM_IDS = PLATFORM_ID_TUPLE;

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
