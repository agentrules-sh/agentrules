import { z } from "zod";
import { PLATFORM_IDS } from "../platform";
import {
  descriptionSchema as baseDescriptionSchema,
  nameSchema,
  tagsSchema,
  titleSchema,
} from "../schemas";

// Re-export shared schemas for convenience
export { nameSchema, tagSchema, tagsSchema, titleSchema } from "../schemas";

// Version format: MAJOR.MINOR (e.g., "1.0", "2.15")
// MAJOR: set by publisher
// MINOR: auto-incremented by registry
const VERSION_REGEX = /^[1-9]\d*\.\d+$/;

export const platformIdSchema = z.enum(PLATFORM_IDS);

/**
 * Schema for required description (presets require a description).
 * Extends base descriptionSchema with min(1) constraint.
 */
export const requiredDescriptionSchema = baseDescriptionSchema.min(
  1,
  "Description is required"
);

// Schema for stored versions (MAJOR.MINOR format)
const versionSchema = z
  .string()
  .trim()
  .regex(VERSION_REGEX, "Version must be in MAJOR.MINOR format (e.g., 1.3)");

// Schema for input major version (positive integer)
const majorVersionSchema = z
  .number()
  .int()
  .positive("Major version must be a positive integer");

const featureSchema = z
  .string()
  .trim()
  .min(1, "Feature cannot be empty")
  .max(100, "Feature must be 100 characters or less");

const featuresSchema = z
  .array(featureSchema)
  .max(5, "Maximum 5 features allowed");

const installMessageSchema = z
  .string()
  .trim()
  .max(2000, "Install message must be 2000 characters or less");
const contentSchema = z.string(); // For readmeContent and licenseContent (no length limit)

// Common SPDX license identifiers (for quick selection)
// See: https://spdx.org/licenses/
export const COMMON_LICENSES = [
  "MIT",
  "Apache-2.0",
  "GPL-3.0-only",
  "BSD-3-Clause",
  "ISC",
  "Unlicense",
] as const;

export type CommonLicense = (typeof COMMON_LICENSES)[number];

// License schema - just requires non-empty string, user is responsible for valid SPDX
export const licenseSchema = z
  .string()
  .trim()
  .min(1, "License is required")
  .max(128, "License must be 128 characters or less");

const pathSchema = z.string().trim().min(1);

const ignorePatternSchema = z
  .string()
  .trim()
  .min(1, "Ignore pattern cannot be empty");

const ignoreSchema = z
  .array(ignorePatternSchema)
  .max(50, "Maximum 50 ignore patterns allowed");

/**
 * Schema for agentrulesDir - directory containing metadata files (README, LICENSE, INSTALL).
 * Defaults to ".agentrules" if not specified.
 * Use "." to read metadata from the project root.
 */
const agentrulesPathSchema = z
  .string()
  .trim()
  .min(1, "agentrulesDir cannot be empty");

/**
 * Platform entry - either a platform ID string or an object with optional path.
 *
 * Examples:
 * - "opencode" (shorthand, uses default directory)
 * - { platform: "opencode", path: "rules" } (custom path)
 */
const platformEntryObjectSchema = z
  .object({
    platform: platformIdSchema,
    path: pathSchema.optional(),
  })
  .strict();

const platformEntrySchema = z.union([
  platformIdSchema,
  platformEntryObjectSchema,
]);

/**
 * Preset config schema.
 *
 * Uses a unified `platforms` array that accepts either:
 * - Platform ID strings: `["opencode", "claude"]`
 * - Objects with optional path: `[{ platform: "opencode", path: "rules" }]`
 * - Mixed: `["opencode", { platform: "claude", path: "my-claude" }]`
 */
export const presetConfigSchema = z
  .object({
    $schema: z.string().optional(),
    name: nameSchema,
    title: titleSchema,
    version: majorVersionSchema.optional(), // Major version. Registry assigns minor.
    description: requiredDescriptionSchema,
    tags: tagsSchema, // Required - at least one tag for discoverability
    features: featuresSchema.optional(),
    license: licenseSchema, // Required SPDX license identifier
    ignore: ignoreSchema.optional(), // Additional patterns to exclude from bundle
    /** Directory containing metadata files (README, LICENSE, INSTALL). Defaults to ".agentrules". Use "." for root. */
    agentrulesDir: agentrulesPathSchema.optional(),
    platforms: z
      .array(platformEntrySchema)
      .min(1, "At least one platform is required"),
  })
  .strict();

export const bundledFileSchema = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  checksum: z.string().length(64),
  content: z.string(),
});

/**
 * Schema for per-platform variant in publish input.
 */
export const publishVariantInputSchema = z.object({
  platform: platformIdSchema,
  files: z.array(bundledFileSchema).min(1),
  readmeContent: contentSchema.optional(),
  licenseContent: contentSchema.optional(),
  installMessage: installMessageSchema.optional(),
});

/**
 * Schema for what clients send to publish a preset (multi-platform).
 *
 * One publish call creates ONE version with ALL platform variants.
 * Version is optional major version. Registry assigns full MAJOR.MINOR.
 *
 * Note: Clients send `name` (e.g., "my-preset"), and the registry defines the format of the slug.
 * For example, a namespaced slug could be returned as "username/my-preset"
 */
export const presetPublishInputSchema = z.object({
  name: nameSchema, // Preset name (registry builds full slug)
  title: titleSchema,
  description: requiredDescriptionSchema,
  tags: tagsSchema,
  license: licenseSchema, // Required SPDX license identifier
  features: featuresSchema.optional(),
  /** Platform variants - each contains files for that platform */
  variants: z
    .array(publishVariantInputSchema)
    .min(1, "At least one platform variant is required"),
  /** Major version. Defaults to 1 if not specified. */
  version: majorVersionSchema.optional(),
});

/**
 * Schema for what registries store and return.
 * Includes full namespaced slug and version assigned by registry.
 */
export const presetBundleSchema = presetPublishInputSchema
  .omit({ name: true, version: true })
  .extend({
    /** Full namespaced slug (e.g., "username/my-preset") */
    slug: z.string().trim().min(1),
    /** Full version in MAJOR.MINOR format (e.g., "1.3", "2.1") */
    version: versionSchema,
  });
