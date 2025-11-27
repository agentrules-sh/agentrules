import {
  isSupportedPlatform,
  PLATFORM_IDS,
  type PlatformId,
  type PresetConfig,
} from "@agentrules/core";
import { mkdir, stat, writeFile } from "fs/promises";
import { basename, join } from "path";
import { log } from "@/lib/log";

export type InitOptions = {
  directory?: string;
  name?: string;
  title?: string;
  description?: string;
  platforms?: string[];
  author?: string;
  license?: string;
  force?: boolean;
};

export type InitResult = {
  configPath: string;
  preset: PresetConfig;
  createdDirs: string[];
};

const CONFIG_FILENAME = "agentrules.json";
const SCHEMA_URL = "https://agentrules.directory/schema/agentrules.json";

const DEFAULT_PLATFORM_PATHS: Record<PlatformId, string> = {
  opencode: "opencode/files/.opencode",
  claude: "claude/files/.claude",
  cursor: "cursor/files/.cursor",
  codex: "codex/files/.codex",
};

export async function initPreset(options: InitOptions): Promise<InitResult> {
  const directory = options.directory ?? process.cwd();
  const dirName = basename(directory);

  log.debug(`Initializing preset in: ${directory}`);

  // Validate/normalize inputs
  const name = normalizeName(options.name ?? dirName);
  const title = options.title ?? toTitleCase(name);
  const description = options.description ?? `${title} preset`;
  const platforms = normalizePlatforms(options.platforms ?? ["opencode"]);
  const author = options.author ? { name: options.author } : undefined;
  const license = options.license ?? "MIT"; // Default to MIT if not specified

  log.debug(`Preset name: ${name}, platforms: ${platforms.join(", ")}`);

  const configPath = join(directory, CONFIG_FILENAME);

  // Check if config already exists
  if (!options.force && (await fileExists(configPath))) {
    throw new Error(
      `${CONFIG_FILENAME} already exists. Use --force to overwrite.`
    );
  }

  // Build platform configs
  const platformConfigs: PresetConfig["platforms"] = {};
  for (const platform of platforms) {
    platformConfigs[platform] = {
      path: DEFAULT_PLATFORM_PATHS[platform],
      features: [],
    };
  }

  const preset: PresetConfig = {
    $schema: SCHEMA_URL,
    name,
    title,
    version: "1.0.0",
    description,
    license, // Required field
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

  // Create platform directories
  const createdDirs: string[] = [];
  for (const platform of platforms) {
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

async function fileExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
