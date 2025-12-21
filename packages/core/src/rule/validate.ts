import { isValidType, PLATFORM_IDS } from "../platform/config";
import { isSupportedPlatform } from "../platform/utils";
import type { RuleConfig } from "./types";

export type RuleValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export function validateRule(config: RuleConfig): RuleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.platforms || config.platforms.length === 0) {
    errors.push("At least one platform is required.");
  }

  for (const entry of config.platforms) {
    if (!isSupportedPlatform(entry.platform)) {
      errors.push(
        `Unknown platform "${entry.platform}". Supported: ${PLATFORM_IDS.join(", ")}`
      );
    }
  }

  if (config.type) {
    for (const entry of config.platforms) {
      if (!isSupportedPlatform(entry.platform)) continue;
      if (!isValidType(entry.platform, config.type)) {
        errors.push(
          `Platform "${entry.platform}" does not support type "${config.type}". ` +
            `Rule "${config.name}" cannot target this platform with type "${config.type}".`
        );
      }
    }
  }

  const hasPlaceholderFeatures = config.features?.some((feature) =>
    feature.trim().startsWith("//")
  );

  if (hasPlaceholderFeatures) {
    errors.push("Replace placeholder comments in features before publishing.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
