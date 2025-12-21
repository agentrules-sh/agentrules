/**
 * Platform and rule type definitions.
 */

export const PLATFORM_ID_TUPLE = [
  "opencode",
  "codex",
  "claude",
  "cursor",
] as const;

/** Union type of supported platform IDs */
export type PlatformId = (typeof PLATFORM_ID_TUPLE)[number];

/** Configuration for a single type */
export type TypeConfig = {
  /** Human-readable description */
  description: string;
  /**
   * Install path template for project install.
   * Supports: {platformDir}, {name}
   * null if project install not supported.
   */

  project: string | null;
  /**
   * Install path template for global install.
   * Supports: {platformDir}, {name}
   * null if global install not supported.
   */

  global: string | null;
};

/** Platform configuration with all its rule types */
export type PlatformConfig = {
  /** Human-readable platform name */
  label: string;
  /** Platform's project directory (e.g., ".claude") */
  platformDir: string;
  /** Platform's global config directory (e.g., "~/.claude") */
  globalDir: string;
  /** Types supported by this platform */
  types: Record<string, TypeConfig>;
};

/**
 * Discriminated union of valid platform + type combinations.
 * Must be kept in sync with PLATFORMS in config.ts.
 */
export type PlatformRuleType =
  | { platform: "opencode"; type: "instruction" | "agent" | "command" | "tool" }
  | { platform: "claude"; type: "instruction" | "command" | "skill" | "rule" }
  | { platform: "cursor"; type: "instruction" | "command" | "rule" }
  | { platform: "codex"; type: "instruction" | "command" };

/** Extract rule type for a specific platform */
export type RuleTypeForPlatform<P extends PlatformId> = Extract<
  PlatformRuleType,
  { platform: P }
>["type"];

/**
 * All valid rule types.
 * When type is omitted, freeform file structure is used.
 */
export type RuleType = PlatformRuleType["type"];

/** Tuple of all rule types for schema validation */
export const RULE_TYPE_TUPLE = [
  "instruction",
  "rule",
  "command",
  "skill",
  "agent",
  "tool",
] as const;
