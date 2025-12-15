/**
 * Platform configuration data.
 *
 * When adding a new platform or type:
 * 1. Add to PLATFORM_ID_TUPLE in types.ts
 * 2. Add entry to PLATFORMS below
 * 3. Update PlatformRuleType in types.ts to include new types
 *
 * Path templates support:
 * - {platformDir} - platform's project directory (e.g., ".claude")
 * - {globalDir} - platform's global directory (e.g., "~/.claude")
 * - {name} - preset/rule name
 * - Trailing / indicates directory type (e.g., skills)
 */

import type { PlatformConfig, PlatformId, TypeConfig } from "./types";
import { PLATFORM_ID_TUPLE } from "./types";

export const PLATFORM_IDS = PLATFORM_ID_TUPLE as unknown as [
  PlatformId,
  ...PlatformId[],
];

/**
 * Platform configuration including supported types and install paths.
 */
export const PLATFORMS = {
  opencode: {
    label: "OpenCode",
    platformDir: ".opencode",
    globalDir: "~/.config/opencode",
    types: {
      instruction: {
        description: "Project instructions",
        project: "AGENTS.md",
        global: "{globalDir}/AGENTS.md",
      },
      agent: {
        description: "Specialized AI agent",
        project: "{platformDir}/agent/{name}.md",
        global: "{globalDir}/agent/{name}.md",
      },
      command: {
        description: "Custom slash command",
        project: "{platformDir}/command/{name}.md",
        global: "{globalDir}/command/{name}.md",
      },
      tool: {
        description: "Custom tool",
        project: "{platformDir}/tool/{name}.ts",
        global: "{globalDir}/tool/{name}.ts",
      },
    },
  },
  claude: {
    label: "Claude Code",
    platformDir: ".claude",
    globalDir: "~/.claude",
    types: {
      instruction: {
        description: "Project instructions",
        project: "CLAUDE.md",
        global: "{globalDir}/CLAUDE.md",
      },
      rule: {
        description: "Project rule",
        project: "{platformDir}/rules/{name}.md",
        global: "{globalDir}/rules/{name}.md",
      },
      command: {
        description: "Custom slash command",
        project: "{platformDir}/commands/{name}.md",
        global: "{globalDir}/commands/{name}.md",
      },
      skill: {
        description: "Custom skill",
        project: "{platformDir}/skills/{name}/",
        global: "{globalDir}/skills/{name}/",
      },
    },
  },
  cursor: {
    label: "Cursor",
    platformDir: ".cursor",
    globalDir: "~/.cursor",
    types: {
      instruction: {
        description: "Project instructions",
        project: "AGENTS.md",
        global: null,
      },
      rule: {
        description: "Custom rule",
        project: "{platformDir}/rules/{name}.mdc",
        global: null,
      },
      command: {
        description: "Custom slash command",
        project: "{platformDir}/commands/{name}.md",
        global: "{globalDir}/commands/{name}.md",
      },
    },
  },
  codex: {
    label: "Codex",
    platformDir: ".codex",
    globalDir: "~/.codex",
    types: {
      instruction: {
        description: "Project instructions",
        project: "AGENTS.md",
        global: "{globalDir}/AGENTS.md",
      },
      command: {
        description: "Custom prompt",
        project: null,
        global: "{globalDir}/prompts/{name}.md",
      },
    },
  },
} as const satisfies Record<PlatformId, PlatformConfig>;

/** Get valid types for a specific platform */
export function getValidTypes(platform: PlatformId): string[] {
  return Object.keys(PLATFORMS[platform].types);
}

/** Check if a type is valid for a given platform */
export function isValidType(platform: PlatformId, type: string): boolean {
  return type in PLATFORMS[platform].types;
}

/** Get the configuration for a specific platform + type combination */
export function getTypeConfig(
  platform: PlatformId,
  type: string
): TypeConfig | undefined {
  const platformConfig = PLATFORMS[platform];
  return platformConfig.types[type as keyof typeof platformConfig.types];
}

/** Check if a type is a directory type (trailing /) */
export function isDirectoryType(platform: PlatformId, type: string): boolean {
  const config = getTypeConfig(platform, type);
  if (!config?.project) return false;
  return config.project.endsWith("/");
}

/** Get the install path for a type, resolving all placeholders */
export function getInstallPath(
  platform: PlatformId,
  type: string,
  name: string,
  scope: "project" | "global" = "project"
): string | null {
  const platformConfig = PLATFORMS[platform];
  const typeConfig = getTypeConfig(platform, type);
  if (!typeConfig) return null;

  const template = scope === "project" ? typeConfig.project : typeConfig.global;
  if (!template) return null;

  return template
    .replace("{platformDir}", platformConfig.platformDir)
    .replace("{globalDir}", platformConfig.globalDir)
    .replace("{name}", name);
}

/** Get platform configuration */
export function getPlatformConfig(platform: PlatformId): PlatformConfig {
  return PLATFORMS[platform];
}

/**
 * Platform-specific type tuples for zod schema validation.
 * Must be kept in sync with PLATFORMS types above.
 */
export const PLATFORM_RULE_TYPES = {
  opencode: ["instruction", "agent", "command", "tool"] as const,
  claude: ["instruction", "rule", "command", "skill"] as const,
  cursor: ["instruction", "rule", "command"] as const,
  codex: ["instruction", "command"] as const,
} as const satisfies Record<PlatformId, readonly string[]>;
