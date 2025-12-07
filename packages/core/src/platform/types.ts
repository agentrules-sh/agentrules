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

/** File format for a rule type */
export type RuleFileFormat = "markdown" | "typescript" | "mdc";

/** Configuration for a single rule type */
export type RuleTypeConfig = {
  /** Human-readable description */
  description: string;
  /** File format */
  format: RuleFileFormat;
  /** File extension (without dot) */
  extension: string;
  /**
   * Install path pattern relative to project root.
   * Use {name} as placeholder for the rule slug/filename.
   * null if project install not supported.
   */
  projectPath: string | null;
  /**
   * Install path pattern for global/user install.
   * Use ~ for home directory.
   * null if global install not supported.
   */
  globalPath: string | null;
};

/** Platform configuration with all its rule types */
export type PlatformRuleConfig = {
  /** Human-readable platform name */
  label: string;
  /** Platform's project directory (e.g., ".opencode") */
  projectDir: string;
  /** Platform's global config directory (null if not supported) */
  globalDir: string | null;
  /** Rule types supported by this platform */
  types: Record<string, RuleTypeConfig>;
};

/**
 * Discriminated union of valid platform + type combinations.
 * Must be kept in sync with PLATFORMS in config.ts.
 */
export type PlatformRuleType =
  | { platform: "opencode"; type: "instruction" | "agent" | "command" | "tool" }
  | { platform: "claude"; type: "instruction" | "command" | "skill" }
  | { platform: "cursor"; type: "rule" }
  | { platform: "codex"; type: "instruction" | "command" };

/** Extract rule type for a specific platform */
export type RuleTypeForPlatform<P extends PlatformId> = Extract<
  PlatformRuleType,
  { platform: P }
>["type"];

/** Union of all valid rule types across all platforms */
export type RuleType = PlatformRuleType["type"];
