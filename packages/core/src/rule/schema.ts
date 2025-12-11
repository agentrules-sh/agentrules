import { z } from "zod";
import { PLATFORM_IDS, PLATFORM_RULE_TYPES } from "../platform";
import {
  descriptionSchema,
  nameSchema,
  tagSchema,
  tagsSchema,
  titleSchema,
} from "../schemas";

/**
 * Rule-specific schema aliases.
 * All use shared schemas for consistency with presets:
 * - name: max 64 chars, lowercase kebab-case
 * - title: max 80 chars
 * - description: max 500 chars (optional for rules)
 * - tags: max 35 chars each, 1-10 required, platform names blocked
 */
export const ruleNameSchema = nameSchema;
export const ruleTitleSchema = titleSchema;
export const ruleDescriptionSchema = descriptionSchema;
export const ruleTagSchema = tagSchema;
export const ruleTagsSchema = tagsSchema;

export const rulePlatformSchema = z.enum(PLATFORM_IDS);

export const ruleTypeSchema = z.string().trim().min(1).max(32);

export const ruleContentSchema = z
  .string()
  .min(1, "Content is required")
  .max(100_000, "Content must be 100KB or less");

/** Common fields shared across all platform-type combinations */
const ruleCommonFields = {
  name: ruleNameSchema,
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

export type RuleCreateInput = z.infer<typeof ruleCreateInputSchema>;

/** Re-export platform-rule types for convenience */
export { getValidRuleTypes, PLATFORM_RULE_TYPES } from "../platform/config";
export type { PlatformRuleType, RuleTypeForPlatform } from "../platform/types";
