/**
 * Zod schemas for validating items endpoint responses.
 */

import { z } from "zod";
import { platformIdSchema } from "../rule/schema";

// Version format: MAJOR.MINOR (e.g., "1.0", "2.15")
const VERSION_REGEX = /^[1-9]\d*\.\d+$/;

// =============================================================================
// Variant Schemas
// =============================================================================

const ruleVariantBundleSchema = z.object({
  platform: platformIdSchema,
  bundleUrl: z.string().min(1),
  fileCount: z.number().int().nonnegative(),
  totalSize: z.number().int().nonnegative(),
});

const ruleVariantInlineSchema = z.object({
  platform: platformIdSchema,
  content: z.string().min(1),
  fileCount: z.number().int().nonnegative(),
  totalSize: z.number().int().nonnegative(),
});

export const ruleVariantSchema = z.union([
  ruleVariantBundleSchema,
  ruleVariantInlineSchema,
]);

// =============================================================================
// Version Schemas
// =============================================================================

export const ruleVersionSchema = z.object({
  version: z
    .string()
    .regex(VERSION_REGEX, "Version must be MAJOR.MINOR format"),
  isLatest: z.boolean(),
  publishedAt: z.string().datetime().optional(),
  variants: z.array(ruleVariantSchema).min(1),
});

// =============================================================================
// Top-level Schemas
// =============================================================================

export const resolvedRuleSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()),
  license: z.string(),
  features: z.array(z.string()),
  versions: z.array(ruleVersionSchema).min(1),
});

export const resolveResponseSchema = resolvedRuleSchema;
