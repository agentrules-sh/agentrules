import { z } from "zod";
import { PLATFORM_IDS } from "./platform";

// Version format: MAJOR.MINOR (e.g., "1.0", "2.15")
// MAJOR: set by publisher
// MINOR: auto-incremented by registry
const VERSION_REGEX = /^[1-9]\d*\.\d+$/;

export const platformIdSchema = z.enum(PLATFORM_IDS);

export const titleSchema = z.string().trim().min(1).max(120);
export const descriptionSchema = z.string().trim().min(1).max(500);

/** Validate a title string and return error message if invalid, undefined if valid */
export function validateTitle(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Title is required";
  if (trimmed.length > 120) return "Title must be 120 characters or less";
  return;
}

/** Validate a description string and return error message if invalid, undefined if valid */
export function validateDescription(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Description is required";
  if (trimmed.length > 500) return "Description must be 500 characters or less";
  return;
}
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
const tagSchema = z.string().trim().min(1).max(48);
const tagsSchema = z.array(tagSchema).min(1).max(10);
const featureSchema = z.string().trim().min(1).max(160);
const featuresSchema = z.array(featureSchema).max(10);
const installMessageSchema = z.string().trim().max(4000);
const contentSchema = z.string(); // For readmeContent and licenseContent (no length limit)

// Slug: lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_ERROR =
  "Must be lowercase alphanumeric with hyphens (e.g., my-preset)";

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(SLUG_REGEX, SLUG_ERROR);

/** Validate a slug string and return error message if invalid, undefined if valid */
export function validateSlug(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Name is required";
  if (trimmed.length > 64) return "Name must be 64 characters or less";
  if (!SLUG_REGEX.test(trimmed)) return SLUG_ERROR;
  return;
}

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
export const licenseSchema = z.string().trim().min(1).max(128);

/** Validate a license string and return error message if invalid, undefined if valid */
export function validateLicense(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "License is required";
  if (trimmed.length > 128) return "License must be 128 characters or less";
  return;
}

const pathSchema = z.string().trim().min(1);

export const presetConfigSchema = z
  .object({
    $schema: z.string().optional(),
    name: slugSchema,
    title: titleSchema,
    version: majorVersionSchema.optional(), // Major version. Registry assigns minor.
    description: descriptionSchema,
    tags: tagsSchema.optional(),
    features: featuresSchema.optional(),
    license: licenseSchema, // Required SPDX license identifier
    platform: platformIdSchema,
    path: pathSchema.optional(), // Path to config files, defaults to platform's projectDir
  })
  .strict();

export const bundledFileSchema = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  checksum: z.string().length(64),
  contents: z.string(),
});

/**
 * Schema for what clients send to publish a preset.
 * Version is optional major version. Registry assigns full MAJOR.MINOR.
 */
export const publishInputSchema = z.object({
  slug: z.string().trim().min(1),
  platform: platformIdSchema,
  title: titleSchema,
  description: descriptionSchema,
  tags: tagsSchema,
  license: licenseSchema, // Required SPDX license identifier
  licenseContent: contentSchema.optional(), // Bundled from LICENSE.md
  readmeContent: contentSchema.optional(), // Bundled from README.md
  features: featuresSchema.optional(),
  installMessage: installMessageSchema.optional(),
  files: z.array(bundledFileSchema).min(1),
  /** Major version. Defaults to 1 if not specified. */
  version: majorVersionSchema.optional(),
});

/**
 * Schema for what registries store and return.
 * Includes version (required) - full MAJOR.MINOR format assigned by registry.
 */
export const registryBundleSchema = publishInputSchema
  .omit({ version: true })
  .extend({
    /** Full version in MAJOR.MINOR format (e.g., "1.3", "2.1") */
    version: versionSchema,
  });

export const registryEntrySchema = registryBundleSchema
  .omit({
    files: true,
    readmeContent: true,
    licenseContent: true,
    installMessage: true,
  })
  .extend({
    name: z.string().trim().min(1),
    bundleUrl: z.string().trim().min(1),
    fileCount: z.number().int().nonnegative(),
    totalSize: z.number().int().nonnegative(),
  });

export const registryIndexSchema = z.record(z.string(), registryEntrySchema);
