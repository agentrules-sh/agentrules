import { z } from "zod";
import { PLATFORM_IDS, PLATFORM_RULE_TYPES } from "../platform";

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

/** Common fields shared across all platform-type combinations */
const ruleCommonFields = {
  slug: ruleSlugSchema,
  title: ruleTitleSchema,
  description: ruleDescriptionSchema.optional(),
  content: ruleContentSchema,
  tags: ruleTagsSchema,
};

/**
 * Discriminated union schema for platform + type combinations.
 * Each platform has its own set of valid types.
 */
export const rulePlatformTypeSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("opencode"),
    type: z.enum(PLATFORM_RULE_TYPES.opencode),
  }),
  z.object({
    platform: z.literal("claude"),
    type: z.enum(PLATFORM_RULE_TYPES.claude),
  }),
  z.object({
    platform: z.literal("cursor"),
    type: z.enum(PLATFORM_RULE_TYPES.cursor),
  }),
  z.object({
    platform: z.literal("codex"),
    type: z.enum(PLATFORM_RULE_TYPES.codex),
  }),
]);

/** Schema for rule creation with discriminated union for platform+type */
export const ruleCreateInputSchema = z
  .object(ruleCommonFields)
  .and(rulePlatformTypeSchema);

export const ruleUpdateInputSchema = z.object({
  title: ruleTitleSchema.optional(),
  description: ruleDescriptionSchema.optional(),
  content: ruleContentSchema.optional(),
  tags: ruleTagsSchema.optional(),
});

export type RuleCreateInput = z.infer<typeof ruleCreateInputSchema>;
export type RuleUpdateInput = z.infer<typeof ruleUpdateInputSchema>;

/** Re-export platform-rule types for convenience */
export { getValidRuleTypes, PLATFORM_RULE_TYPES } from "../platform/config";
export type { PlatformRuleType, RuleTypeForPlatform } from "../platform/types";
