/**
 * Types for the unified items endpoint.
 *
 * The items endpoint returns all versions and platform variants for a slug.
 */

import type { PlatformId, RuleType } from "../platform";

// =============================================================================
// Variants (per-platform content within a version)
// =============================================================================

/** Base fields for all variants */
type BaseVariant = {
  platform: PlatformId;
};

/** Rule variant with bundle URL (for larger rules) */
type RuleVariantBundle = BaseVariant & {
  bundleUrl: string;
  fileCount: number;
  totalSize: number;
};

/** Rule variant with inline content (for smaller rules) */
type RuleVariantInline = BaseVariant & {
  content: string;
  fileCount: number;
  totalSize: number;
};

/** Rule variant - registry decides bundleUrl vs inline content */
export type RuleVariant = RuleVariantBundle | RuleVariantInline;

// =============================================================================
// Versions (contains variants for all platforms)
// =============================================================================

export type RuleVersion = {
  version: string; // "1.0", "2.3", etc.
  isLatest: boolean;
  publishedAt?: string; // ISO timestamp
  variants: RuleVariant[];
};

// =============================================================================
// Top-level resolved items
// =============================================================================

export type ResolvedRule = {
  slug: string;
  name: string;
  /** Rule type - optional, defaults to freeform file structure */
  type?: RuleType;
  title: string;
  description: string;
  tags: string[];
  license: string;
  features: string[];
  versions: RuleVersion[];
};

/** Response from items endpoint */
export type ResolveResponse = ResolvedRule;
