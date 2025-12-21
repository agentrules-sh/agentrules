import type { PlatformId, RuleType } from "../platform";

/** Normalized platform entry - always object form */
export type PlatformEntry = { platform: PlatformId; path?: string };

/** Raw platform entry - string shorthand or object with optional path */
export type RawPlatformEntry = PlatformId | PlatformEntry;

/** Normalize a raw platform entry to the object form */
export function normalizePlatformEntry(entry: RawPlatformEntry): PlatformEntry {
  if (typeof entry === "string") {
    return { platform: entry };
  }
  return entry;
}

/**
 * Raw rule configuration - what users write in agentrules.json.
 *
 * Uses a unified `platforms` array that accepts either:
 * - Platform ID strings: `["opencode", "claude"]`
 * - Objects with optional path: `[{ platform: "opencode", path: "rules" }]`
 * - Mixed: `["opencode", { platform: "claude", path: "my-claude" }]`
 *
 * **Order matters**: The first platform in the array is used as the default
 * when viewing the rule on the registry without specifying a platform.
 */
export type RawRuleConfig = {
  $schema?: string;
  name: string;
  /**
   * Rule type - determines install path and constrains valid platforms.
   * Optional - defaults to "multi" (freeform file structure).
   */
  type?: RuleType;
  title: string;
  version?: number; // Optional major version. Registry assigns minor.
  description: string;
  tags?: string[];
  features?: string[];
  license: string; // Required SPDX license identifier
  /** Additional patterns to exclude from bundle (glob patterns) */
  ignore?: string[];
  /**
   * Target platforms with optional custom paths.
   * Order matters: the first platform is used as the default when viewing
   * the rule on the registry.
   */
  platforms: RawPlatformEntry[];
};

/**
 * Normalized rule configuration - used internally after loading.
 */
export type RuleConfig = Omit<RawRuleConfig, "platforms"> & {
  platforms: PlatformEntry[];
};

export type BundledFile = {
  path: string;
  /** File size in bytes */
  size: number;
  checksum: string;
  content: string;
};

/**
 * Per-platform variant input for publishing.
 * Contains files and optional metadata for a single platform.
 */
export type PublishVariantInput = {
  platform: PlatformId;
  files: BundledFile[];
  /** Optional per-platform README */
  readmeContent?: string;
  /** Optional per-platform LICENSE */
  licenseContent?: string;
  /** Optional per-platform install message */
  installMessage?: string;
};

/**
 * What clients send to publish a rule (multi-platform).
 *
 * One publish call creates ONE version with ALL platform variants.
 * Version is optional major version. Registry assigns full MAJOR.MINOR.
 *
 * Note: Clients send `name` (e.g., "my-rule"), and the registry defines the format of the slug.
 * For example, a namespaced slug could be returned as "username/my-rule"
 */
export type RulePublishInput = {
  name: string;
  /** Rule type - optional, defaults to freeform file structure */
  type?: RuleType;
  title: string;
  description: string;
  tags: string[];
  license: string; // Required SPDX license identifier
  features?: string[];
  /** Platform variants - each contains files for that platform */
  variants: PublishVariantInput[];
  /** Major version. Defaults to 1 if not specified. */
  version?: number;
};

/**
 * What registries store and return for a single platform bundle.
 * This is stored in R2 and fetched via bundleUrl.
 *
 * Note: This is per-platform, while RulePublishInput is multi-platform.
 */
export type RuleBundle = {
  name: string;
  /** Rule type - optional, defaults to freeform file structure */
  type?: RuleType;
  platform: PlatformId;
  title: string;
  description: string;
  tags: string[];
  license: string;
  features?: string[];
  files: BundledFile[];
  readmeContent?: string;
  licenseContent?: string;
  installMessage?: string;
  /** Full namespaced slug (e.g., "username/my-rule") */
  slug: string;
  /** Full version in MAJOR.MINOR format (e.g., "1.3", "2.1") */
  version: string;
};

export type RuleFileInput = {
  path: string;
  content: ArrayBuffer | ArrayBufferView | string;
};

/**
 * Files for a single platform variant
 */
export type PlatformFiles = {
  platform: PlatformId;
  files: RuleFileInput[];
  /** Optional per-platform install message */
  installMessage?: string;
  /** Optional per-platform README */
  readmeContent?: string;
  /** Optional per-platform LICENSE */
  licenseContent?: string;
};

/**
 * Rule input - what the CLI builds after loading files.
 * Always uses platformFiles array (works for single or multi-platform).
 */
export type RuleInput = {
  name: string;
  config: RuleConfig;
  /** Files for each platform */
  platformFiles: PlatformFiles[];
  /** Shared install message (fallback for platforms without their own) */
  installMessage?: string;
  /** Shared README (fallback for platforms without their own) */
  readmeContent?: string;
  /** Shared LICENSE (fallback for platforms without their own) */
  licenseContent?: string;
};
