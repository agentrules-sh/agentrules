import { isSupportedPlatform, PLATFORM_IDS, PLATFORMS } from "@agentrules/core";
import { join } from "path";
import { directoryExists } from "@/lib/fs";
import { log } from "@/lib/log";
import { loadConfig, type PresetConfig } from "@/lib/preset-utils";

export type ValidateOptions = {
  path?: string;
};

export type ValidateResult = {
  valid: boolean;
  configPath: string;
  preset: PresetConfig | null;
  errors: string[];
  warnings: string[];
};

export async function validatePreset(
  options: ValidateOptions
): Promise<ValidateResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Use loadConfig for reading and normalizing - single source of truth
  let configPath: string;
  let config: PresetConfig;
  let configDir: string;
  let isInProjectMode: boolean;

  try {
    const result = await loadConfig(options.path);
    configPath = result.configPath;
    config = result.config;
    configDir = result.configDir;
    isInProjectMode = result.isInProjectMode;
    log.debug("Config loaded and normalized successfully");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    errors.push(message);
    log.debug(`Config load failed: ${message}`);
    // Try to get config path for error reporting
    const fallbackPath = options.path ?? "agentrules.json";
    return {
      valid: false,
      configPath: fallbackPath,
      preset: null,
      errors,
      warnings,
    };
  }

  log.debug(`Preset name: ${config.name}`);

  // Validate each platform
  for (const entry of config.platforms) {
    const { platform, path: customPath } = entry;
    log.debug(`Checking platform: ${platform}`);

    if (!isSupportedPlatform(platform)) {
      errors.push(
        `Unknown platform "${platform}". Supported: ${PLATFORM_IDS.join(", ")}`
      );
      log.debug(`Platform "${platform}" is not supported`);
      continue;
    }

    if (isInProjectMode) {
      // In-project mode: files are siblings of config
      log.debug(`In-project mode: files expected in ${configDir}`);
    } else {
      // Standalone mode: files are in custom path or platform's default platformDir
      const filesPath = customPath ?? PLATFORMS[platform].platformDir;
      const filesDir = join(configDir, filesPath);
      const filesExists = await directoryExists(filesDir);

      log.debug(
        `Standalone mode: files directory check for ${platform}: ${filesDir} - ${filesExists ? "exists" : "not found"}`
      );

      if (!filesExists) {
        errors.push(`Files directory not found for ${platform}: ${filesPath}`);
      }
    }
  }

  // Check for placeholder comments (from init template)
  const hasPlaceholderTags = config.tags?.some((t) => t.startsWith("//"));
  const hasPlaceholderFeatures = config.features?.some((f) =>
    f.startsWith("//")
  );

  // Tags are required
  if (hasPlaceholderTags) {
    errors.push("Replace placeholder comments in tags before publishing.");
    log.debug("Found placeholder comments in tags");
  } else if (!config.tags || config.tags.length === 0) {
    errors.push("At least one tag is required.");
    log.debug("No tags specified");
  }

  // Features are optional but check for placeholders
  if (hasPlaceholderFeatures) {
    errors.push("Replace placeholder comments in features before publishing.");
    log.debug("Found placeholder comments in features");
  }

  const isValid = errors.length === 0;
  log.debug(
    `Validation complete: ${isValid ? "valid" : "invalid"} (${errors.length} errors, ${warnings.length} warnings)`
  );

  return {
    valid: isValid,
    configPath,
    preset: isValid ? config : null,
    errors,
    warnings,
  };
}
