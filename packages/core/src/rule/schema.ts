import { z } from "zod";
import { PLATFORM_IDS } from "../platform";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ruleSlugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(64, "Slug must be 64 characters or less")
  .regex(SLUG_REGEX, "Must be lowercase alphanumeric with hyphens");

export const ruleTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(80, "Title must be 80 characters or less");

export const ruleDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Description must be 500 characters or less");

export const rulePlatformSchema = z.enum(PLATFORM_IDS);

export const ruleTypeSchema = z.string().trim().min(1).max(32);

export const ruleContentSchema = z
  .string()
  .min(1, "Content is required")
  .max(100_000, "Content must be 100KB or less");

export const ruleTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Tags must be lowercase alphanumeric with single hyphens between words"
  );

export const ruleTagsSchema = z
  .array(ruleTagSchema)
  .min(1, "At least 1 tag is required")
  .max(10, "Maximum 10 tags allowed");

export const ruleCreateInputSchema = z.object({
  slug: ruleSlugSchema,
  platform: rulePlatformSchema,
  type: ruleTypeSchema,
  title: ruleTitleSchema,
  description: ruleDescriptionSchema.optional(),
  content: ruleContentSchema,
  tags: ruleTagsSchema,
});

export const ruleUpdateInputSchema = z.object({
  title: ruleTitleSchema.optional(),
  description: ruleDescriptionSchema.optional(),
  content: ruleContentSchema.optional(),
  tags: ruleTagsSchema.optional(),
});

export type RuleCreateInput = z.infer<typeof ruleCreateInputSchema>;
export type RuleUpdateInput = z.infer<typeof ruleUpdateInputSchema>;
