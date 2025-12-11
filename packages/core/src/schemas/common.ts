/**
 * Common schemas shared across presets and rules.
 */

import { z } from "zod";
import { PLATFORM_IDS } from "../platform";

// Set of platform IDs for fast lookup in tag validation
const PLATFORM_ID_SET = new Set<string>(PLATFORM_IDS);

// =============================================================================
// Tags
// =============================================================================

// Tags: lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens
const TAG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG_ERROR = "Must be lowercase alphanumeric with hyphens (e.g., my-tag)";

/**
 * Schema for a single tag.
 * - Max 35 characters
 * - Lowercase alphanumeric with hyphens
 * - Platform names blocked (redundant with platform field)
 */
export const tagSchema = z
  .string()
  .trim()
  .min(1, "Tag cannot be empty")
  .max(35, "Tag must be 35 characters or less")
  .regex(TAG_REGEX, TAG_ERROR)
  .refine((tag) => !PLATFORM_ID_SET.has(tag), {
    message:
      "Platform names cannot be used as tags (redundant with platform field)",
  });

/**
 * Schema for tags array.
 * - 1-10 tags required
 */
export const tagsSchema = z
  .array(tagSchema)
  .min(1, "At least one tag is required")
  .max(10, "Maximum 10 tags allowed");

// =============================================================================
// Name
// =============================================================================

// Name: lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens
const NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME_ERROR =
  "Must be lowercase alphanumeric with hyphens (e.g., my-preset)";

/**
 * Schema for preset/rule name.
 * - Max 64 characters
 * - Lowercase alphanumeric with hyphens
 */
export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(64, "Name must be 64 characters or less")
  .regex(NAME_REGEX, NAME_ERROR);

// =============================================================================
// Title & Description
// =============================================================================

/**
 * Schema for display title.
 * - Max 80 characters
 */
export const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(80, "Title must be 80 characters or less");

/**
 * Schema for description.
 * - Max 500 characters
 */
export const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Description must be 500 characters or less");
