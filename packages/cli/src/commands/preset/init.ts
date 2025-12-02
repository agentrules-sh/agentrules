import {
  isSupportedPlatform,
  PLATFORM_IDS,
  PLATFORMS,
  type PlatformId,
  PRESET_CONFIG_FILENAME,
  PRESET_SCHEMA_URL,
  type PresetConfig,
} from "@agentrules/core";
import { mkdir, writeFile } from "fs/promises";
import { basename, join } from "path";
import { directoryExists, fileExists } from "@/lib/fs";
import { log } from "@/lib/log";
import { normalizeName, toTitleCase } from "@/lib/preset-utils";

export type InitOptions = {
  directory?: string;
  name?: string;
  title?: string;
  description?: string;
  platform?: string;
  /** Detected path for the platform (e.g., ".opencode") */
  detectedPath?: string;
  license?: string;
  force?: boolean;
};

export type InitResult = {
  configPath: string;
  preset: PresetConfig;
  createdDir?: string;
};

export type DetectedPlatform = {
  id: PlatformId;
  path: string;
};

/** Paths to check for existing platform configs (in order of preference) */
const PLATFORM_DETECTION_PATHS: Record<PlatformId, string[]> = {
  opencode: [".opencode"],
  claude: [".claude"],
  cursor: [".cursor", ".cursorrules"],
  codex: [".codex"],
};

/** Default path for new preset authoring */
const DEFAULT_FILES_PATH = "files";

/**
 * Detect existing platform config directories in a directory
 */
export async function detectPlatforms(
  directory: string
): Promise<DetectedPlatform[]> {
  const detected: DetectedPlatform[] = [];

  for (const platformId of PLATFORM_IDS) {
    const pathsToCheck = PLATFORM_DETECTION_PATHS[platformId];

    for (const pathToCheck of pathsToCheck) {
      const fullPath = join(directory, pathToCheck);
      if (await directoryExists(fullPath)) {
        detected.push({ id: platformId, path: pathToCheck });
        break; // Found one, don't check other paths for this platform
      }
    }
  }

  return detected;
}

export async function initPreset(options: InitOptions): Promise<InitResult> {
  const directory = options.directory ?? process.cwd();
  const dirName = basename(directory);

  log.debug(`Initializing preset in: ${directory}`);

  // Validate/normalize inputs
  const name = normalizeName(options.name ?? dirName);
  const title = options.title ?? toTitleCase(name);
  const description = options.description ?? `${title} preset`;
  const platform = normalizePlatform(options.platform ?? "opencode");
  const detectedPath = options.detectedPath;
  const license = options.license ?? "MIT"; // Default to MIT if not specified

  log.debug(`Preset name: ${name}, platform: ${platform}`);

  const configPath = join(directory, PRESET_CONFIG_FILENAME);

  // Check if config already exists
  if (!options.force && (await fileExists(configPath))) {
    throw new Error(
      `${PRESET_CONFIG_FILENAME} already exists. Use --force to overwrite.`
    );
  }

  // Determine the files path
  // Use detected path if provided, otherwise use default
  const defaultPath = PLATFORMS[platform].projectDir;
  const effectivePath = detectedPath ?? DEFAULT_FILES_PATH;

  const preset: PresetConfig = {
    $schema: PRESET_SCHEMA_URL,
    name,
    title,
    description,
    license,
    platform,
  };

  // Only include path in config if it's not the platform's default projectDir
  if (effectivePath !== defaultPath) {
    preset.path = effectivePath;
  }

  // Create directory if needed
  await mkdir(directory, { recursive: true });
  log.debug(`Created/verified directory: ${directory}`);

  // Write config
  const content = `${JSON.stringify(preset, null, 2)}\n`;
  await writeFile(configPath, content, "utf8");
  log.debug(`Wrote config file: ${configPath}`);

  // Create files directory (only if not using detected path)
  let createdDir: string | undefined;
  if (detectedPath) {
    log.debug(`Using detected platform directory: ${detectedPath}`);
  } else {
    const filesPath = effectivePath;
    const fullPath = join(directory, filesPath);

    if (await directoryExists(fullPath)) {
      log.debug(`Files directory already exists: ${filesPath}`);
    } else {
      await mkdir(fullPath, { recursive: true });
      createdDir = filesPath;
      log.debug(`Created files directory: ${filesPath}`);
    }
  }

  log.debug("Preset initialization complete.");
  return { configPath, preset, createdDir };
}

function normalizePlatform(input: string): PlatformId {
  const normalized = input.toLowerCase();
  if (!isSupportedPlatform(normalized)) {
    throw new Error(
      `Unknown platform "${input}". Supported: ${PLATFORM_IDS.join(", ")}`
    );
  }
  return normalized;
}
