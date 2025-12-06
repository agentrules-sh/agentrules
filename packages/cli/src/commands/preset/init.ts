import {
  getPlatformFromDir,
  isSupportedPlatform,
  PLATFORM_IDS,
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
  /** Platform directory path (e.g., ".opencode" or "/path/to/.claude") */
  directory?: string;
  name?: string;
  title?: string;
  description?: string;
  platform?: string;
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
  cursor: [".cursor"],
  codex: [".codex"],
};

/** Default preset name when none specified */
const DEFAULT_PRESET_NAME = "my-preset";

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

/**
 * Initialize a preset in a platform directory.
 *
 * Structure:
 * - platformDir/agentrules.json - preset config
 * - platformDir/* - platform files (added by user)
 * - platformDir/.agentrules/ - optional metadata folder (README, LICENSE, etc.)
 */
export async function initPreset(options: InitOptions): Promise<InitResult> {
  const platformDir = options.directory ?? process.cwd();

  log.debug(`Initializing preset in: ${platformDir}`);

  // Infer platform from directory name if not provided
  const inferredPlatform = getPlatformFromDir(basename(platformDir));
  const platform = normalizePlatform(
    options.platform ?? inferredPlatform ?? "opencode"
  );

  // Validate/normalize inputs
  const name = normalizeName(options.name ?? DEFAULT_PRESET_NAME);
  const title = options.title ?? toTitleCase(name);
  const description = options.description ?? `${title} preset`;
  const license = options.license ?? "MIT";

  log.debug(`Preset name: ${name}, platform: ${platform}`);

  const configPath = join(platformDir, PRESET_CONFIG_FILENAME);

  // Check if config already exists
  if (!options.force && (await fileExists(configPath))) {
    throw new Error(
      `${PRESET_CONFIG_FILENAME} already exists. Use --force to overwrite.`
    );
  }

  const preset: PresetConfig = {
    $schema: PRESET_SCHEMA_URL,
    name,
    title,
    version: 1,
    description,
    license,
    platform,
  };

  // Create platform directory if needed
  let createdDir: string | undefined;
  if (await directoryExists(platformDir)) {
    log.debug(`Platform directory exists: ${platformDir}`);
  } else {
    await mkdir(platformDir, { recursive: true });
    createdDir = platformDir;
    log.debug(`Created platform directory: ${platformDir}`);
  }

  // Write config
  const content = `${JSON.stringify(preset, null, 2)}\n`;
  await writeFile(configPath, content, "utf8");
  log.debug(`Wrote config file: ${configPath}`);

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
