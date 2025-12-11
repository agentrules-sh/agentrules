/**
 * Platform configuration data.
 *
 * When adding a new platform or rule type:
 * 1. Add to PLATFORM_ID_TUPLE in types.ts
 * 2. Add entry to PLATFORMS below
 * 3. Update PlatformRuleType in types.ts to include new types
 * 4. Update PLATFORM_RULE_TYPES below
 */

import type { PlatformId, PlatformRuleConfig, RuleTypeConfig } from "./types";
import { PLATFORM_ID_TUPLE } from "./types";

export const PLATFORM_IDS = PLATFORM_ID_TUPLE as unknown as [
  PlatformId,
  ...PlatformId[],
];

/**
 * Platform configuration including supported rule types and install paths.
 */
export const PLATFORMS = {
  opencode: {
    label: "OpenCode",
    projectDir: ".opencode",
    globalDir: "~/.config/opencode",
    types: {
      instruction: {
        description: "Project instructions",
        format: "markdown",
        extension: "md",
        projectPath: "AGENTS.md",
        globalPath: "~/.config/opencode/AGENTS.md",
      },
      agent: {
        description: "Specialized AI agent",
        format: "markdown",
        extension: "md",
        projectPath: ".opencode/agent/{name}.md",
        globalPath: "~/.config/opencode/agent/{name}.md",
      },
      command: {
        description: "Custom slash command",
        format: "markdown",
        extension: "md",
        projectPath: ".opencode/command/{name}.md",
        globalPath: "~/.config/opencode/command/{name}.md",
      },
      tool: {
        description: "Custom tool",
        format: "typescript",
        extension: "ts",
        projectPath: ".opencode/tool/{name}.ts",
        globalPath: "~/.config/opencode/tool/{name}.ts",
      },
    },
  },
  claude: {
    label: "Claude Code",
    projectDir: ".claude",
    globalDir: "~/.claude",
    types: {
      instruction: {
        description: "Project instructions",
        format: "markdown",
        extension: "md",
        projectPath: "CLAUDE.md",
        globalPath: "~/.claude/CLAUDE.md",
      },
      command: {
        description: "Custom slash command",
        format: "markdown",
        extension: "md",
        projectPath: ".claude/commands/{name}.md",
        globalPath: "~/.claude/commands/{name}.md",
      },
      skill: {
        description: "Custom skill",
        format: "markdown",
        extension: "md",
        projectPath: ".claude/skills/{name}/SKILL.md",
        globalPath: "~/.claude/skills/{name}/SKILL.md",
      },
    },
  },
  cursor: {
    label: "Cursor",
    projectDir: ".cursor",
    globalDir: "~/.cursor",
    types: {
      instruction: {
        description: "Project instructions",
        format: "markdown",
        extension: "md",
        projectPath: "AGENTS.md",
        globalPath: null,
      },
      rule: {
        description: "Custom rule",
        format: "mdc",
        extension: "mdc",
        projectPath: ".cursor/rules/{name}.mdc",
        globalPath: null,
      },
      command: {
        description: "Custom slash command",
        format: "markdown",
        extension: "md",
        projectPath: ".cursor/commands/{name}.md",
        globalPath: "~/.cursor/commands/{name}.md",
      },
    },
  },
  codex: {
    label: "Codex",
    projectDir: ".codex",
    globalDir: "~/.codex",
    types: {
      instruction: {
        description: "Project instructions",
        format: "markdown",
        extension: "md",
        projectPath: "AGENTS.md",
        globalPath: "~/.codex/AGENTS.md",
      },
      command: {
        description: "Custom prompt",
        format: "markdown",
        extension: "md",
        projectPath: null,
        globalPath: "~/.codex/prompts/{name}.md",
      },
    },
  },
} as const satisfies Record<PlatformId, PlatformRuleConfig>;

/** Valid rule types for each platform. Must be kept in sync with PLATFORMS. */
export const PLATFORM_RULE_TYPES = {
  opencode: ["instruction", "command", "agent", "tool"],
  claude: ["instruction", "command", "skill"],
  codex: ["instruction", "command"],
  cursor: ["instruction", "command", "rule"],
} as const satisfies Record<PlatformId, readonly string[]>;

/** Get valid rule types for a specific platform */
export function getValidRuleTypes(platform: PlatformId): readonly string[] {
  return PLATFORM_RULE_TYPES[platform];
}

/** Check if a type is valid for a given platform */
export function isValidRuleType(platform: PlatformId, type: string): boolean {
  return (PLATFORM_RULE_TYPES[platform] as readonly string[]).includes(type);
}

/** Get the configuration for a specific platform + type combination */
export function getRuleTypeConfig(
  platform: PlatformId,
  type: string
): RuleTypeConfig | undefined {
  const platformConfig = PLATFORMS[platform];
  return platformConfig.types[type as keyof typeof platformConfig.types];
}

/** Get the install path for a rule, replacing {name} placeholder */
export function getInstallPath(
  platform: PlatformId,
  type: string,
  name: string,
  location: "project" | "global" = "project"
): string | null {
  const config = getRuleTypeConfig(platform, type);
  if (!config) return null;

  const pathTemplate =
    location === "project" ? config.projectPath : config.globalPath;
  if (!pathTemplate) return null;

  return pathTemplate.replace("{name}", name);
}

/** Get platform configuration */
export function getPlatformConfig(platform: PlatformId): PlatformRuleConfig {
  return PLATFORMS[platform];
}
