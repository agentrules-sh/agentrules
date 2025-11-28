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

export type InitOptions = {
  directory?: string;
  name?: string;
  title?: string;
  description?: string;
  platforms?: string[];
  /** Map of platform to detected path (e.g., { opencode: ".opencode" }) */
  detectedPlatforms?: Partial<Record<PlatformId, string>>;
  author?: string;
  license?: string;
  force?: boolean;
};

export type InitResult = {
  configPath: string;
  preset: PresetConfig;
  createdDirs: string[];
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

/** Default paths for new preset authoring */
const DEFAULT_PLATFORM_PATHS: Record<PlatformId, string> = {
  opencode: "opencode/files/.opencode",
  claude: "claude/files/.claude",
  cursor: "cursor/files/.cursor",
  codex: "codex/files/.codex",
};

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
  const platforms = normalizePlatforms(options.platforms ?? ["opencode"]);
  const detectedPlatforms = options.detectedPlatforms ?? {};
  const author = options.author ? { name: options.author } : undefined;
  const license = options.license ?? "MIT"; // Default to MIT if not specified

  log.debug(`Preset name: ${name}, platforms: ${platforms.join(", ")}`);

  const configPath = join(directory, PRESET_CONFIG_FILENAME);

  // Check if config already exists
  if (!options.force && (await fileExists(configPath))) {
    throw new Error(
      `${PRESET_CONFIG_FILENAME} already exists. Use --force to overwrite.`
    );
  }

  // Build platform configs
  // Only include path if it differs from the platform's default projectDir
  const platformConfigs: PresetConfig["platforms"] = {};
  for (const platform of platforms) {
    const detectedPath = detectedPlatforms[platform];
    const defaultPath = PLATFORMS[platform].projectDir;
    const effectivePath = detectedPath ?? DEFAULT_PLATFORM_PATHS[platform];

    // Only include path in config if it's not the default
    if (effectivePath === defaultPath) {
      platformConfigs[platform] = {};
    } else {
      platformConfigs[platform] = { path: effectivePath };
    }
  }

  const preset: PresetConfig = {
    $schema: PRESET_SCHEMA_URL,
    name,
    title,
    description,
    license,
    platforms: platformConfigs,
  };

  if (author) {
    preset.author = author;
  }

  // Create directory if needed
  await mkdir(directory, { recursive: true });
  log.debug(`Created/verified directory: ${directory}`);

  // Write config
  const content = `${JSON.stringify(preset, null, 2)}\n`;
  await writeFile(configPath, content, "utf8");
  log.debug(`Wrote config file: ${configPath}`);

  // Create platform directories (only for non-detected platforms)
  const createdDirs: string[] = [];
  for (const platform of platforms) {
    // Skip if this platform was detected (directory already exists)
    if (detectedPlatforms[platform]) {
      log.debug(
        `Using detected platform directory: ${detectedPlatforms[platform]}`
      );
      continue;
    }

    const platformPath = DEFAULT_PLATFORM_PATHS[platform];
    const fullPath = join(directory, platformPath);

    if (await directoryExists(fullPath)) {
      log.debug(`Platform directory already exists: ${platformPath}`);
    } else {
      await mkdir(fullPath, { recursive: true });
      createdDirs.push(platformPath);
      log.debug(`Created platform directory: ${platformPath}`);
    }
  }

  log.debug(
    `Preset initialization complete. Created ${createdDirs.length} directories.`
  );
  return { configPath, preset, createdDirs };
}

function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toTitleCase(input: string): string {
  return input
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizePlatforms(input: string[]): PlatformId[] {
  const platforms: PlatformId[] = [];

  for (const value of input) {
    const normalized = value.toLowerCase();
    if (!isSupportedPlatform(normalized)) {
      throw new Error(
        `Unknown platform "${value}". Supported: ${PLATFORM_IDS.join(", ")}`
      );
    }
    if (!platforms.includes(normalized)) {
      platforms.push(normalized);
    }
  }

  return platforms;
}
