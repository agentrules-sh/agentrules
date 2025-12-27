/**
 * Platform configuration data.
 *
 * When adding a new platform or type:
 * 1. Add to PLATFORM_ID_TUPLE in types.ts
 * 2. Add entry to PLATFORMS below
 * 3. Update PlatformRuleType in types.ts to include new types
 *
 * Path templates support:
 * - {platformDir} - platform-specific directory (e.g., ".claude", ".cursor")
 * - {userHomeDir} - user's home directory (expanded at runtime)
 * - {name} - rule name
 */

import type { PlatformConfig, PlatformId, TypeConfig } from "./types";
import { PLATFORM_ID_TUPLE } from "./types";

/**
 * Placeholder for user's home directory in path templates.
 * Consumers (e.g., CLI) are responsible for expanding this at runtime.
 */
export const USER_HOME_DIR_PLACEHOLDER = "{userHomeDir}";

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
    globalDir: "{userHomeDir}/.config/opencode",
    types: {
      instruction: {
        description: "Project instructions",
        project: "AGENTS.md",
        global: "{platformDir}/AGENTS.md",
      },
      agent: {
        description: "Specialized AI agent",
        project: "{platformDir}/agent/{name}.md",
        global: "{platformDir}/agent/{name}.md",
      },
      command: {
        description: "Custom slash command",
        project: "{platformDir}/command/{name}.md",
        global: "{platformDir}/command/{name}.md",
      },
      tool: {
        description: "Custom tool",
        project: "{platformDir}/tool/{name}.ts",
        global: "{platformDir}/tool/{name}.ts",
      },
      skill: {
        description: "Agent skill",
        project: "{platformDir}/skill/{name}/SKILL.md",
        global: "{platformDir}/skill/{name}/SKILL.md",
      },
    },
  },
  claude: {
    label: "Claude Code",
    platformDir: ".claude",
    globalDir: "{userHomeDir}/.claude",
    types: {
      instruction: {
        description: "Project instructions",
        project: "CLAUDE.md",
        global: "{platformDir}/CLAUDE.md",
      },
      rule: {
        description: "Project rule",
        project: "{platformDir}/rules/{name}.md",
        global: "{platformDir}/rules/{name}.md",
      },
      command: {
        description: "Custom slash command",
        project: "{platformDir}/commands/{name}.md",
        global: "{platformDir}/commands/{name}.md",
      },
      skill: {
        description: "Custom skill",
        project: "{platformDir}/skills/{name}/SKILL.md",
        global: "{platformDir}/skills/{name}/SKILL.md",
      },
    },
  },
  cursor: {
    label: "Cursor",
    platformDir: ".cursor",
    globalDir: "{userHomeDir}/.cursor",
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
        global: "{platformDir}/commands/{name}.md",
      },
      skill: {
        description: "Agent skill",
        project: "{platformDir}/skills/{name}/SKILL.md",
        global: "{platformDir}/skills/{name}/SKILL.md",
      },
    },
  },
  codex: {
    label: "Codex",
    platformDir: ".codex",
    globalDir: "{userHomeDir}/.codex",
    types: {
      instruction: {
        description: "Project instructions",
        project: "AGENTS.md",
        global: "{platformDir}/AGENTS.md",
      },
      command: {
        description: "Custom prompt",
        project: null,
        global: "{platformDir}/prompts/{name}.md",
      },
      skill: {
        description: "Agent skill",
        project: "{platformDir}/skills/{name}/SKILL.md",
        global: "{platformDir}/skills/{name}/SKILL.md",
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

export type InstallScope = "project" | "global";

/** Get the configuration for a specific platform + type combination */
export function getTypeConfig(
  platform: PlatformId,
  type: string
): TypeConfig | undefined {
  const platformConfig = PLATFORMS[platform];
  return platformConfig.types[type as keyof typeof platformConfig.types];
}

export type SupportsInstallPathInput = {
  platform: PlatformId;
  type: string;
  scope?: InstallScope;
};

export function supportsInstallPath({
  platform,
  type,
  scope = "project",
}: SupportsInstallPathInput): boolean {
  const typeConfig = getTypeConfig(platform, type);
  if (!typeConfig) return false;

  const template = scope === "project" ? typeConfig.project : typeConfig.global;
  return template !== null;
}

/** Get the install path for a type, resolving all placeholders */
export type GetInstallPathInput = {
  platform: PlatformId;
  type: string;
  name?: string;
  scope?: InstallScope;
};

export function getInstallPath({
  platform,
  type,
  name,
  scope = "project",
}: GetInstallPathInput): string | null {
  const platformConfig = PLATFORMS[platform];
  const typeConfig = getTypeConfig(platform, type);
  if (!typeConfig) return null;

  const template = scope === "project" ? typeConfig.project : typeConfig.global;
  if (!template) return null;

  const rootDir =
    scope === "project" ? platformConfig.platformDir : platformConfig.globalDir;

  if (template.includes("{name}") && !name) {
    throw new Error(
      `Missing name for install path: platform="${platform}" type="${type}" scope="${scope}"`
    );
  }

  return template
    .replace("{platformDir}", rootDir)
    .replace("{name}", name ?? "");
}

/** Get platform configuration */
export function getPlatformConfig(platform: PlatformId): PlatformConfig {
  return PLATFORMS[platform];
}

/**
 * Get the relative install path for a type (without the root directory prefix).
 * Returns the path relative to the platform's root directory.
 *
 * Example: For codex instruction with scope="global", returns "AGENTS.md"
 * (not the full path with {userHomeDir})
 */
export function getRelativeInstallPath({
  platform,
  type,
  name,
  scope = "project",
}: GetInstallPathInput): string | null {
  const typeConfig = getTypeConfig(platform, type);
  if (!typeConfig) return null;

  const template = scope === "project" ? typeConfig.project : typeConfig.global;
  if (!template) return null;

  if (template.includes("{name}") && !name) {
    throw new Error(
      `Missing name for install path: platform="${platform}" type="${type}" scope="${scope}"`
    );
  }

  // Strip {platformDir}/ prefix and replace {name}
  return template
    .replace("{platformDir}/", "")
    .replace("{platformDir}", "")
    .replace("{name}", name ?? "");
}

/**
 * Platform-specific type tuples for zod schema validation.
 * Must be kept in sync with PLATFORMS types above.
 */
export const PLATFORM_RULE_TYPES = {
  opencode: ["instruction", "agent", "command", "tool", "skill"] as const,
  claude: ["instruction", "rule", "command", "skill"] as const,
  cursor: ["instruction", "rule", "command", "skill"] as const,
  codex: ["instruction", "command", "skill"] as const,
} as const satisfies Record<PlatformId, readonly string[]>;
