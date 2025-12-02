import {
  isSupportedPlatform,
  PLATFORM_IDS,
  PLATFORMS,
  PRESET_CONFIG_FILENAME,
  type PresetConfig,
  validatePresetConfig,
} from "@agentrules/core";
import { readFile, stat } from "fs/promises";
import { basename, dirname, join } from "path";
import { directoryExists } from "@/lib/fs";
import { log } from "@/lib/log";

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

  const slug = basename(dirname(configPath));
  log.debug(`Preset slug: ${slug}`);

  let preset: PresetConfig;
  try {
    preset = validatePresetConfig(configJson, slug);
    log.debug("Preset config validation passed");
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    log.debug(
      `Preset config validation failed: ${e instanceof Error ? e.message : String(e)}`
    );
    return { valid: false, configPath, preset: null, errors, warnings };
  }

  // Check slug matches name
  if (preset.name !== slug) {
    warnings.push(
      `Preset name "${preset.name}" doesn't match directory name "${slug}". ` +
        "The directory name will be used as the slug."
    );
  }

  // Check platform
  const presetDir = dirname(configPath);
  const platform = preset.platform;

  log.debug(`Checking platform: ${platform}`);

  if (isSupportedPlatform(platform)) {
    // Default to platform's standard projectDir if path not specified
    const filesPath = preset.path ?? PLATFORMS[platform].projectDir;
    const filesDir = join(presetDir, filesPath);
    const filesExists = await directoryExists(filesDir);

    log.debug(
      `Files directory check: ${filesDir} - ${filesExists ? "exists" : "not found"}`
    );

    if (!filesExists) {
      errors.push(`Files directory not found: ${filesPath}`);
    }
  } else {
    errors.push(
      `Unknown platform "${platform}". Supported: ${PLATFORM_IDS.join(", ")}`
    );
    log.debug(`Platform "${platform}" is not supported`);
  }

  // Check optional fields
  if (!preset.tags || preset.tags.length === 0) {
    warnings.push("No tags specified. Tags help with discoverability.");
    log.debug("No tags specified");
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

async function resolveConfigPath(inputPath?: string): Promise<string> {
  if (!inputPath) {
    return join(process.cwd(), PRESET_CONFIG_FILENAME);
  }

  const stats = await stat(inputPath).catch(() => null);

  if (stats?.isDirectory()) {
    return join(inputPath, PRESET_CONFIG_FILENAME);
  }

  return inputPath;
}
