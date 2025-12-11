/**
 * Types for the unified items endpoint.
 *
 * The items endpoint returns all versions and platform variants for a slug.
 * Use `kind` to discriminate between presets and rules.
 */

import type { PlatformId } from "../platform";

// =============================================================================
// Variants (per-platform content within a version)
// =============================================================================

/** Base fields for all variants */
type BaseVariant = {
  platform: PlatformId;
};

/** Preset variant with bundle URL (for larger presets) */
type PresetVariantBundle = BaseVariant & {
  bundleUrl: string;
  fileCount: number;
  totalSize: number;
};

/** Preset variant with inline content (for smaller presets) */
type PresetVariantInline = BaseVariant & {
  content: string;
  fileCount: number;
  totalSize: number;
};

/** Preset variant - registry decides bundleUrl vs inline content */
export type PresetVariant = PresetVariantBundle | PresetVariantInline;

/** Rule variant - always inline (rules are small text files) */
export type RuleVariant = BaseVariant & {
  type: string; // "instruction", "agent", "command", etc.
  content: string;
};

// =============================================================================
// Versions (contains variants for all platforms)
// =============================================================================

export type PresetVersion = {
  version: string; // "1.0", "2.3", etc.
  isLatest: boolean;
  publishedAt?: string; // ISO timestamp
  variants: PresetVariant[];
};

export type RuleVersion = {
  version: string;
  isLatest: boolean;
  publishedAt?: string;
  variants: RuleVariant[];
};

// =============================================================================
// Top-level resolved items
// =============================================================================

export type ResolvedPreset = {
  kind: "preset";
  slug: string;
  name: string;
  title: string;
  description: string;
  tags: string[];
  license: string;
  features: string[];
  versions: PresetVersion[];
};

export type ResolvedRule = {
  kind: "rule";
  slug: string;
  name: string;
  title: string;
  description: string;
  tags: string[];
  versions: RuleVersion[];
};

/** Discriminated union for items endpoint response */
export type ResolveResponse = ResolvedPreset | ResolvedRule;
