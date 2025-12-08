import {
  isPlatformDir,
  isSupportedPlatform,
  PLATFORM_IDS,
  PLATFORMS,
  type PresetConfig,
  validatePresetConfig,
} from "@agentrules/core";
import { readFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { directoryExists } from "@/lib/fs";
import { log } from "@/lib/log";
import { resolveConfigPath } from "@/lib/preset-utils";

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
  const configPath = await resolveConfigPath(options.path);
  log.debug(`Resolved config path: ${configPath}`);
  const errors: string[] = [];
  const warnings: string[] = [];

  const configRaw = await readFile(configPath, "utf8").catch(() => null);
  if (configRaw === null) {
    errors.push(`Config file not found: ${configPath}`);
    log.debug("Config file read failed");
    return { valid: false, configPath, preset: null, errors, warnings };
  }

  log.debug("Config file read successfully");
  let configJson: unknown;
  try {
    configJson = JSON.parse(configRaw);
    log.debug("JSON parsed successfully");
  } catch (e) {
    errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    log.debug(
      `JSON parse error: ${e instanceof Error ? e.message : String(e)}`
    );
    return { valid: false, configPath, preset: null, errors, warnings };
  }

  let preset: PresetConfig;
  try {
    preset = validatePresetConfig(configJson, configPath);
    log.debug("Preset config validation passed");
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    log.debug(
      `Preset config validation failed: ${e instanceof Error ? e.message : String(e)}`
    );
    return { valid: false, configPath, preset: null, errors, warnings };
  }

  log.debug(`Preset name: ${preset.name}`);

  // Check platform
  const presetDir = dirname(configPath);
  const platform = preset.platform;

  log.debug(`Checking platform: ${platform}`);

  if (isSupportedPlatform(platform)) {
    // Determine mode based on whether config is inside a platform directory
    const dirName = basename(presetDir);
    const isInProjectMode = isPlatformDir(dirName);

    if (isInProjectMode) {
      // In-project mode: files are siblings of config
      // No additional directory check needed - files are in same dir as config
      log.debug(`In-project mode: files expected in ${presetDir}`);
    } else {
      // Standalone mode: files are in config.path or platform's default projectDir
      const filesPath = preset.path ?? PLATFORMS[platform].projectDir;
      const filesDir = join(presetDir, filesPath);
      const filesExists = await directoryExists(filesDir);

      log.debug(
        `Standalone mode: files directory check: ${filesDir} - ${filesExists ? "exists" : "not found"}`
      );

      if (!filesExists) {
        errors.push(`Files directory not found: ${filesPath}`);
      }
    }
  } else {
    errors.push(
      `Unknown platform "${platform}". Supported: ${PLATFORM_IDS.join(", ")}`
    );
    log.debug(`Platform "${platform}" is not supported`);
  }

  // Check for placeholder comments (from init template)
  const hasPlaceholderTags = preset.tags?.some((t) => t.startsWith("//"));
  const hasPlaceholderFeatures = preset.features?.some((f) =>
    f.startsWith("//")
  );

  // Tags are required
  if (hasPlaceholderTags) {
    errors.push("Replace placeholder comments in tags before publishing.");
    log.debug("Found placeholder comments in tags");
  } else if (!preset.tags || preset.tags.length === 0) {
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
    preset: isValid ? preset : null,
    errors,
    warnings,
  };
}
