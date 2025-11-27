import { z } from "zod";
import { PLATFORM_IDS } from "./platform";

// Date-based version: YYYY.MM.DD or YYYY.MM.DD.N for same-day releases
const DATE_VERSION_REGEX =
  /^\d{4}\.(0[1-9]|1[0-2])\.(0[1-9]|[12]\d|3[01])(\.\d+)?$/;

export const platformIdSchema = z.enum(PLATFORM_IDS);

export const authorSchema = z
  .object({
    name: z.string().trim().min(1),
    email: z.email().trim().optional(),
    url: z.url().trim().optional(),
  })
  .strict();

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
const versionSchema = z
  .string()
  .trim()
  .regex(
    DATE_VERSION_REGEX,
    "Version must be date-based (YYYY.MM.DD or YYYY.MM.DD.N)"
  );
const tagSchema = z.string().trim().min(1).max(48);
const tagsSchema = z.array(tagSchema).max(10);
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

export const platformPresetConfigSchema = z
  .object({
    path: pathSchema.optional(),
    features: featuresSchema.optional(),
    installMessage: installMessageSchema.optional(),
  })
  .strict();

// Build platforms schema dynamically from PLATFORM_IDS
const platformsObjectSchema = z
  .object(
    Object.fromEntries(
      PLATFORM_IDS.map((id) => [id, platformPresetConfigSchema.optional()])
    ) as Record<string, z.ZodOptional<typeof platformPresetConfigSchema>>
  )
  .refine((p) => Object.keys(p).length > 0, {
    message: "At least one platform must be configured",
  });

export const presetConfigSchema = z
  .object({
    $schema: z.string().optional(),
    name: slugSchema,
    title: titleSchema,
    version: versionSchema.optional(), // Version is auto-generated at build time
    description: descriptionSchema,
    tags: tagsSchema.optional(),
    author: authorSchema.optional(),
    license: licenseSchema, // Required SPDX license identifier
    platforms: platformsObjectSchema,
  })
  .strict();

export const bundledFileSchema = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  checksum: z.string().length(64),
  contents: z.string(),
});

export const registryBundleSchema = z.object({
  slug: z.string().trim().min(1),
  platform: platformIdSchema,
  title: titleSchema,
  version: versionSchema,
  description: descriptionSchema,
  tags: tagsSchema,
  author: authorSchema.optional(),
  license: licenseSchema, // Required SPDX license identifier
  licenseContent: contentSchema.optional(), // Bundled from LICENSE.md
  readmeContent: contentSchema.optional(), // Bundled from README.md
  features: featuresSchema.optional(),
  installMessage: installMessageSchema.optional(),
  files: z.array(bundledFileSchema).min(1),
});

export const registryEntrySchema = registryBundleSchema
  .omit({ files: true, readmeContent: true, licenseContent: true })
  .extend({
    name: z.string().trim().min(1),
    bundlePath: z.string().trim().min(1),
    fileCount: z.number().int().nonnegative(),
    totalSize: z.number().int().nonnegative(),
    hasReadmeContent: z.boolean().optional(),
    hasLicenseContent: z.boolean().optional(),
  });

export const registryIndexSchema = z.record(z.string(), registryEntrySchema);
