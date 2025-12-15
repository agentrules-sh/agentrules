import type { PlatformId } from "../platform";

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
 * Raw preset configuration - what users write in agentrules.json.
 *
 * Uses a unified `platforms` array that accepts either:
 * - Platform ID strings: `["opencode", "claude"]`
 * - Objects with optional path: `[{ platform: "opencode", path: "rules" }]`
 * - Mixed: `["opencode", { platform: "claude", path: "my-claude" }]`
 *
 * **Order matters**: The first platform in the array is used as the default
 * when viewing the preset on the registry without specifying a platform.
 */
export type RawPresetConfig = {
  $schema?: string;
  name: string;
  title: string;
  version?: number; // Optional major version. Registry assigns minor.
  description: string;
  tags?: string[];
  features?: string[];
  license: string; // Required SPDX license identifier
  /** Additional patterns to exclude from bundle (glob patterns) */
  ignore?: string[];
  /**
   * Directory containing metadata files (README.md, LICENSE.md, INSTALL.txt).
   * Defaults to ".agentrules". Use "." to read metadata from the project root.
   */
  agentrulesDir?: string;
  /**
   * Target platforms with optional custom paths.
   * Order matters: the first platform is used as the default when viewing
   * the preset on the registry.
   */
  platforms: RawPlatformEntry[];
};

/**
 * Normalized preset configuration - used internally after loading.
 */
export type PresetConfig = Omit<RawPresetConfig, "platforms"> & {
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
 * What clients send to publish a preset (multi-platform).
 *
 * One publish call creates ONE version with ALL platform variants.
 * Version is optional major version. Registry assigns full MAJOR.MINOR.
 *
 * Note: Clients send `name` (e.g., "my-preset"), and the registry defines the format of the slug.
 * For example, a namespaced slug could be returned as "username/my-preset"
 */
export type PresetPublishInput = {
  name: string;
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
 * Note: This is per-platform, while PresetPublishInput is multi-platform.
 */
export type PresetBundle = {
  name: string;
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
  /** Full namespaced slug (e.g., "username/my-preset") */
  slug: string;
  /** Full version in MAJOR.MINOR format (e.g., "1.3", "2.1") */
  version: string;
};

export type PresetFileInput = {
  path: string;
  content: ArrayBuffer | ArrayBufferView | string;
};

/**
 * Files for a single platform variant
 */
export type PlatformFiles = {
  platform: PlatformId;
  files: PresetFileInput[];
  /** Optional per-platform install message */
  installMessage?: string;
  /** Optional per-platform README */
  readmeContent?: string;
  /** Optional per-platform LICENSE */
  licenseContent?: string;
};

/**
 * Preset input - what the CLI builds after loading files.
 * Always uses platformFiles array (works for single or multi-platform).
 */
export type PresetInput = {
  name: string;
  config: PresetConfig;
  /** Files for each platform */
  platformFiles: PlatformFiles[];
  /** Shared install message (fallback for platforms without their own) */
  installMessage?: string;
  /** Shared README (fallback for platforms without their own) */
  readmeContent?: string;
  /** Shared LICENSE (fallback for platforms without their own) */
  licenseContent?: string;
};
