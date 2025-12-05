import { z } from "zod";
import { PLATFORM_IDS } from "../platform";

// Set of platform IDs for fast lookup in tag validation
const PLATFORM_ID_SET = new Set<string>(PLATFORM_IDS);

// Version format: MAJOR.MINOR (e.g., "1.0", "2.15")
// MAJOR: set by publisher
// MINOR: auto-incremented by registry
const VERSION_REGEX = /^[1-9]\d*\.\d+$/;

export const platformIdSchema = z.enum(PLATFORM_IDS);

export const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(80, "Title must be 80 characters or less");

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, "Description is required")
  .max(500, "Description must be 500 characters or less");

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
// Tags: lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens
const TAG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG_ERROR = "Must be lowercase alphanumeric with hyphens (e.g., my-tag)";

const tagSchema = z
  .string()
  .trim()
  .min(1, "Tag cannot be empty")
  .max(35, "Tag must be 35 characters or less")
  .regex(TAG_REGEX, TAG_ERROR)
  .refine((tag) => !PLATFORM_ID_SET.has(tag), {
    message:
      "Platform names cannot be used as tags (redundant with platform field)",
  });

const tagsSchema = z
  .array(tagSchema)
  .min(1, "At least one tag is required")
  .max(10, "Maximum 10 tags allowed");

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

// Slug: lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_ERROR =
  "Must be lowercase alphanumeric with hyphens (e.g., my-preset)";

export const slugSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(64, "Name must be 64 characters or less")
  .regex(SLUG_REGEX, SLUG_ERROR);

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
export const presetPublishInputSchema = z.object({
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
export const presetBundleSchema = presetPublishInputSchema
  .omit({ version: true })
  .extend({
    /** Full version in MAJOR.MINOR format (e.g., "1.3", "2.1") */
    version: versionSchema,
  });

export const presetSchema = presetBundleSchema
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

export const presetIndexSchema = z.record(z.string(), presetSchema);
