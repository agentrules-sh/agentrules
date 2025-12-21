import {
  type RuleConfig,
  validateRule as validateRuleConfig,
} from "@agentrules/core";
import { log } from "@/lib/log";
import { type LoadConfigOverrides, loadConfig } from "@/lib/rule-utils";

export type ValidateOptions = {
  path?: string;
  overrides?: LoadConfigOverrides;
};

export type ValidateResult = {
  valid: boolean;
  configPath: string;
  rule: RuleConfig | null;
  errors: string[];
  warnings: string[];
};

export async function validateRule(
  options: ValidateOptions
): Promise<ValidateResult> {
  try {
    const loaded = await loadConfig(options.path, options.overrides);
    log.debug("Config loaded and normalized successfully");

    const result = validateRuleConfig(loaded.config);

    return {
      valid: result.valid,
      configPath: loaded.configPath,
      rule: result.valid ? loaded.config : null,
      errors: result.errors,
      warnings: result.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallbackPath = options.path ?? "agentrules.json";

    log.debug(`Config load failed: ${message}`);

    return {
      valid: false,
      configPath: fallbackPath,
      rule: null,
      errors: [message],
      warnings: [],
    };
  }
}
