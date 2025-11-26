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

const titleSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().min(1).max(500);
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
const licenseSchema = z.string().trim().min(1).max(80);
const contentSchema = z.string(); // For readmeContent and licenseContent (no length limit)

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Name must be lowercase kebab-case");

const pathSchema = z.string().trim().min(1);

export const platformPresetConfigSchema = z
  .object({
    path: pathSchema,
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
