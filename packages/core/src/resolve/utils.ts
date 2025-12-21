/**
 * Helper utilities for working with resolved items.
 */

import type { PlatformId } from "../platform";
import type { ResolvedRule, RuleVariant, RuleVersion } from "./types";

/**
 * Type guard for rule variant with bundleUrl
 */
export function hasBundle(
  variant: RuleVariant
): variant is RuleVariant & { bundleUrl: string } {
  return "bundleUrl" in variant;
}

/**
 * Type guard for rule variant with inline content
 */
export function hasInlineContent(
  variant: RuleVariant
): variant is RuleVariant & { content: string } {
  return "content" in variant;
}

/**
 * Get the latest version from a resolved rule
 */
export function getLatestVersion(item: ResolvedRule): RuleVersion | undefined {
  return item.versions.find((v) => v.isLatest);
}

/**
 * Get a specific version from a resolved rule
 */
export function getVersion(
  item: ResolvedRule,
  version: string
): RuleVersion | undefined {
  return item.versions.find((v) => v.version === version);
}

/**
 * Get a specific platform variant from a rule version
 */
export function getVariant(
  version: RuleVersion,
  platform: PlatformId
): RuleVariant | undefined {
  return version.variants.find((v) => v.platform === platform);
}

/**
 * Get all available platforms for a rule version
 */
export function getPlatforms(version: RuleVersion): PlatformId[] {
  return version.variants.map((v) => v.platform);
}

/**
 * Check if a platform is available in any version of a rule
 */
export function hasPlatform(item: ResolvedRule, platform: PlatformId): boolean {
  return item.versions.some((v) =>
    v.variants.some((variant) => variant.platform === platform)
  );
}
