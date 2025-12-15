import {
  getPlatformFromDir,
  isSupportedPlatform,
  PLATFORM_IDS,
  PLATFORMS,
  type PlatformId,
  PRESET_CONFIG_FILENAME,
  PRESET_SCHEMA_URL,
  type RawPresetConfig,
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
  tags?: string[];
  force?: boolean;
};

export type InitResult = {
  configPath: string;
  preset: RawPresetConfig;
  createdDir?: string;
};

export type DetectedPlatform = {
  id: PlatformId;
  path: string;
};

export type ResolvePlatformResult = {
  /** The resolved platform directory path */
  platformDir: string;
  /** The detected/inferred platform ID */
  platform: PlatformId;
  /** Whether the target directory itself is a platform directory */
  isTargetPlatformDir: boolean;
  /** Detected platform directories inside target (empty if target is a platform dir) */
  detected: DetectedPlatform[];
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
 * Resolve the target platform directory for initialization.
 *
 * Detection order (deterministic):
 * 1. If targetDir itself is a platform directory (e.g., ".claude"), use it directly
 * 2. Otherwise, detect platform directories inside targetDir
 *
 * @param targetDir - The target directory (cwd or user-provided path)
 * @param platformOverride - Optional platform to use instead of detecting/inferring
 */
export async function resolvePlatformDirectory(
  targetDir: string,
  platformOverride?: string
): Promise<ResolvePlatformResult> {
  const targetDirName = basename(targetDir);

  // Step 1: Check if targetDir itself is a platform directory
  const targetPlatform = getPlatformFromDir(targetDirName);

  if (targetPlatform) {
    // Target is a platform directory - use it directly
    const platform = platformOverride
      ? normalizePlatform(platformOverride)
      : targetPlatform;

    return {
      platformDir: targetDir,
      platform,
      isTargetPlatformDir: true,
      detected: [],
    };
  }

  // Step 2: Detect platform directories inside targetDir
  const detected = await detectPlatforms(targetDir);

  // Determine which platform to use
  let platform: PlatformId;
  let platformDir: string;

  if (platformOverride) {
    // User specified a platform - use it
    platform = normalizePlatform(platformOverride);
    const detectedPath = detected.find((d) => d.id === platform)?.path;
    platformDir = detectedPath
      ? join(targetDir, detectedPath)
      : join(targetDir, PLATFORMS[platform].platformDir);
  } else if (detected.length > 0) {
    // Use first detected platform
    platform = detected[0].id;
    platformDir = join(targetDir, detected[0].path);
  } else {
    // No detection, default to opencode
    platform = "opencode";
    platformDir = join(targetDir, PLATFORMS.opencode.platformDir);
  }

  return {
    platformDir,
    platform,
    isTargetPlatformDir: false,
    detected,
  };
}

export type PlatformFlagCheck =
  | { required: false }
  | { required: true; reason: "no_platforms" }
  | { required: true; reason: "multiple_platforms"; platforms: string[] };

/**
 * Check if --platform flag is required for non-interactive mode.
 * Returns the reason if required, so CLI can show appropriate error.
 */
export function requiresPlatformFlag(
  resolved: ResolvePlatformResult
): PlatformFlagCheck {
  if (resolved.isTargetPlatformDir) {
    return { required: false };
  }

  if (resolved.detected.length === 0) {
    return { required: true, reason: "no_platforms" };
  }

  if (resolved.detected.length > 1) {
    return {
      required: true,
      reason: "multiple_platforms",
      platforms: resolved.detected.map((d) => d.id),
    };
  }

  return { required: false };
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

  const preset: RawPresetConfig = {
    $schema: PRESET_SCHEMA_URL,
    name,
    title,
    version: 1,
    description,
    tags: options.tags ?? [],
    license,
    platforms: [platform],
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
