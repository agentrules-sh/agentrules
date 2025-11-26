import {
  isSupportedPlatform,
  PLATFORM_IDS,
  type PresetConfig,
  validatePresetConfig,
} from "@agentrules/core";
import { readFile, stat } from "fs/promises";
import { basename, dirname, join } from "path";

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

const CONFIG_FILENAME = "agentrules.json";

export async function validatePreset(
  options: ValidateOptions
): Promise<ValidateResult> {
  const configPath = await resolveConfigPath(options.path);
  const errors: string[] = [];
  const warnings: string[] = [];

  const configRaw = await readFile(configPath, "utf8").catch(() => null);
  if (configRaw === null) {
    errors.push(`Config file not found: ${configPath}`);
    return { valid: false, configPath, preset: null, errors, warnings };
  }

  let configJson: unknown;
  try {
    configJson = JSON.parse(configRaw);
  } catch (e) {
    errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return { valid: false, configPath, preset: null, errors, warnings };
  }

  const slug = basename(dirname(configPath));

  let preset: PresetConfig;
  try {
    preset = validatePresetConfig(configJson, slug);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { valid: false, configPath, preset: null, errors, warnings };
  }

  // Check slug matches name
  if (preset.name !== slug) {
    warnings.push(
      `Preset name "${preset.name}" doesn't match directory name "${slug}". ` +
        "The directory name will be used as the slug."
    );
  }

  // Check platforms
  const presetDir = dirname(configPath);
  const declaredPlatformKeys = Object.keys(preset.platforms);

  if (declaredPlatformKeys.length === 0) {
    errors.push("No platforms defined. At least one platform is required.");
  }

  for (const key of declaredPlatformKeys) {
    if (!isSupportedPlatform(key)) {
      errors.push(
        `Unknown platform "${key}". Supported: ${PLATFORM_IDS.join(", ")}`
      );
      continue;
    }

    // key is now narrowed to PlatformId
    const platformConfig = preset.platforms[key];
    if (!platformConfig?.path) {
      errors.push(`Platform "${key}" is missing a path.`);
      continue;
    }

    const platformDir = join(presetDir, platformConfig.path);
    const platformExists = await directoryExists(platformDir);

    if (!platformExists) {
      errors.push(
        `Platform directory not found: ${platformConfig.path} (for ${key})`
      );
    }
  }

  // Check optional fields
  if (!preset.author?.name) {
    warnings.push("No author name specified.");
  }

  if (!preset.tags || preset.tags.length === 0) {
    warnings.push("No tags specified. Tags help with discoverability.");
  }

  return {
    valid: errors.length === 0,
    configPath,
    preset: errors.length === 0 ? preset : null,
    errors,
    warnings,
  };
}

async function resolveConfigPath(inputPath?: string): Promise<string> {
  if (!inputPath) {
    return join(process.cwd(), CONFIG_FILENAME);
  }

  const stats = await stat(inputPath).catch(() => null);

  if (stats?.isDirectory()) {
    return join(inputPath, CONFIG_FILENAME);
  }

  return inputPath;
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
