import { ZodError } from "zod";
import { type RawRuleConfig, ruleConfigSchema } from "../rule";

export function cleanInstallMessage(value: unknown) {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validate raw rule config from JSON.
 * Returns the raw config shape (before normalization).
 */
export function validateConfig(config: unknown, slug: string): RawRuleConfig {
  try {
    return ruleConfigSchema.parse(config);
  } catch (e) {
    if (e instanceof ZodError) {
      const messages = e.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      });
      throw new Error(
        `Invalid rule config for ${slug}:\n  - ${messages.join("\n  - ")}`
      );
    }
    throw e;
  }
}
