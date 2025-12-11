import { ZodError } from "zod";
import { presetConfigSchema, type RawPresetConfig } from "../preset";

export function cleanInstallMessage(value: unknown) {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validate raw preset config from JSON.
 * Returns the raw config shape (before normalization).
 */
export function validatePresetConfig(
  config: unknown,
  slug: string
): RawPresetConfig {
  try {
    return presetConfigSchema.parse(config);
  } catch (e) {
    if (e instanceof ZodError) {
      const messages = e.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      });
      throw new Error(
        `Invalid preset config for ${slug}:\n  - ${messages.join("\n  - ")}`
      );
    }
    throw e;
  }
}
