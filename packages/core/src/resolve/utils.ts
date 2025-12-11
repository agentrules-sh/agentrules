/**
 * Helper utilities for working with resolved items.
 */

import type { PlatformId } from "../platform";
import type {
  PresetVariant,
  PresetVersion,
  ResolvedPreset,
  ResolvedRule,
  ResolveResponse,
  RuleVariant,
  RuleVersion,
} from "./types";

/**
 * Type guard for preset
 */
export function isPreset(item: ResolveResponse): item is ResolvedPreset {
  return item.kind === "preset";
}

/**
 * Type guard for rule
 */
export function isRule(item: ResolveResponse): item is ResolvedRule {
  return item.kind === "rule";
}

/**
 * Type guard for preset variant with bundleUrl
 */
export function hasBundle(
  variant: PresetVariant
): variant is PresetVariant & { bundleUrl: string } {
  return "bundleUrl" in variant;
}

/**
 * Type guard for preset variant with inline content
 */
export function hasInlineContent(
  variant: PresetVariant
): variant is PresetVariant & { content: string } {
  return "content" in variant;
}

/**
 * Get the latest version from a resolved preset
 */
export function getLatestPresetVersion(
  item: ResolvedPreset
): PresetVersion | undefined {
  return item.versions.find((v) => v.isLatest);
}

/**
 * Get the latest version from a resolved rule
 */
export function getLatestRuleVersion(
  item: ResolvedRule
): RuleVersion | undefined {
  return item.versions.find((v) => v.isLatest);
}

/**
 * Get a specific version from a resolved preset
 */
export function getPresetVersion(
  item: ResolvedPreset,
  version: string
): PresetVersion | undefined {
  return item.versions.find((v) => v.version === version);
}

/**
 * Get a specific version from a resolved rule
 */
export function getRuleVersion(
  item: ResolvedRule,
  version: string
): RuleVersion | undefined {
  return item.versions.find((v) => v.version === version);
}

/**
 * Get a specific platform variant from a preset version
 */
export function getPresetVariant(
  version: PresetVersion,
  platform: PlatformId
): PresetVariant | undefined {
  return version.variants.find((v) => v.platform === platform);
}

/**
 * Get a specific platform variant from a rule version
 */
export function getRuleVariant(
  version: RuleVersion,
  platform: PlatformId
): RuleVariant | undefined {
  return version.variants.find((v) => v.platform === platform);
}

/**
 * Get all available platforms for a preset version
 */
export function getPresetPlatforms(version: PresetVersion): PlatformId[] {
  return version.variants.map((v) => v.platform);
}

/**
 * Get all available platforms for a rule version
 */
export function getRulePlatforms(version: RuleVersion): PlatformId[] {
  return version.variants.map((v) => v.platform);
}

/**
 * Check if a platform is available in any version of a preset
 */
export function presetHasPlatform(
  item: ResolvedPreset,
  platform: PlatformId
): boolean {
  return item.versions.some((v) =>
    v.variants.some((variant) => variant.platform === platform)
  );
}

/**
 * Check if a platform is available in any version of a rule
 */
export function ruleHasPlatform(
  item: ResolvedRule,
  platform: PlatformId
): boolean {
  return item.versions.some((v) =>
    v.variants.some((variant) => variant.platform === platform)
  );
}
