import {
  AGENT_RULES_DIR,
  isPlatformDir,
  normalizePlatformEntry,
  PLATFORMS,
  type PlatformFiles,
  PRESET_CONFIG_FILENAME,
  type PresetConfig,
  type PresetInput,
  validatePresetConfig,
} from "@agentrules/core";
import { readdir, readFile, stat } from "fs/promises";
import { basename, dirname, join, relative } from "path";
import { directoryExists, fileExists } from "./fs";
import { log } from "./log";

// Re-export types for consumers
export type { PresetConfig } from "@agentrules/core";

const INSTALL_FILENAME = "INSTALL.txt";
const README_FILENAME = "README.md";
const LICENSE_FILENAME = "LICENSE.md";

/**
 * Files/directories that are always excluded from presets.
 * These are never useful in a preset bundle.
 */
const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".DS_Store",
  "*.lock",
  "package-lock.json",
  "bun.lockb",
  "pnpm-lock.yaml",
];

/**
 * Normalize a string to a valid preset slug (lowercase kebab-case)
 */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Convert a kebab-case string to Title Case
 */
export function toTitleCase(input: string): string {
  return input
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Resolve path to agentrules.json config file.
 * If path is a directory, appends the config filename.
 * If path is omitted, uses current working directory.
 */
export async function resolveConfigPath(inputPath?: string): Promise<string> {
  if (!inputPath) {
    return join(process.cwd(), PRESET_CONFIG_FILENAME);
  }

  const stats = await stat(inputPath).catch(() => null);

  if (stats?.isDirectory()) {
    return join(inputPath, PRESET_CONFIG_FILENAME);
  }

  return inputPath;
}

/**
 * Result of loading a preset config file.
 */
export type LoadConfigResult = {
  /** Resolved path to the config file */
  configPath: string;
  config: PresetConfig;
  /** Directory containing the config file */
  configDir: string;
  /** Whether config is inside a platform directory (in-project mode) */
  isInProjectMode: boolean;
};

/**
 * Load and normalize a preset config file.
 *
 * @throws Error if config file is missing, invalid JSON, or fails validation
 */
export async function loadConfig(
  inputPath?: string
): Promise<LoadConfigResult> {
  const configPath = await resolveConfigPath(inputPath);
  log.debug(`Resolved config path: ${configPath}`);

  const configRaw = await readFile(configPath, "utf8").catch(() => null);
  if (configRaw === null) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  let configJson: unknown;
  try {
    configJson = JSON.parse(configRaw);
  } catch (e) {
    throw new Error(
      `Invalid JSON in ${configPath}: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // Use name from config if available for error messages
  const configObj = configJson as Record<string, unknown> | null;
  const identifier =
    typeof configObj?.name === "string" ? configObj.name : configPath;

  const rawConfig = validatePresetConfig(configJson, identifier);

  // Normalize platforms: expand string entries to { platform, path? } objects
  const platforms = rawConfig.platforms.map(normalizePlatformEntry);

  if (platforms.length === 0) {
    throw new Error(
      `Config must have at least one platform in the "platforms" array.`
    );
  }

  // Build normalized config
  const config: PresetConfig = {
    $schema: rawConfig.$schema,
    name: rawConfig.name,
    title: rawConfig.title,
    description: rawConfig.description,
    license: rawConfig.license,
    version: rawConfig.version,
    tags: rawConfig.tags,
    features: rawConfig.features,
    ignore: rawConfig.ignore,
    agentrulesDir: rawConfig.agentrulesDir,
    platforms,
  };

  const configDir = dirname(configPath);
  const dirName = basename(configDir);
  const isInProjectMode = isPlatformDir(dirName);

  // Multi-platform configs must be at project root
  if (isInProjectMode && platforms.length > 1) {
    throw new Error(
      `Multi-platform configs must be placed at project root, not inside a platform directory like "${dirName}".`
    );
  }

  const platformNames = platforms.map((p) => p.platform).join(", ");
  log.debug(
    `Loaded config: ${config.name}, platforms: ${platformNames}, mode: ${isInProjectMode ? "in-project" : "standalone"}`
  );

  return {
    configPath,
    config,
    configDir,
    isInProjectMode,
  };
}

/**
 * Load a preset from a directory containing agentrules.json.
 *
 * Always returns normalized PresetInput format with platformFiles array.
 *
 * Config in platform dir (e.g., .claude/agentrules.json):
 *   - Preset files: siblings of config
 *   - Extras (README, LICENSE, INSTALL): agentrulesDir subfolder (default: .agentrules/)
 *
 * Config at repo root:
 *   - Files in each platform's directory (or custom path if specified)
 *   - Extras (README, LICENSE, INSTALL): agentrulesDir subfolder (default: .agentrules/)
 *
 * Use agentrulesDir: "." to read extras from the config directory itself
 * (useful for dedicated preset repos where README.md should be at root).
 */
export async function loadPreset(presetDir: string): Promise<PresetInput> {
  // Use loadConfig for reading and normalizing the config
  const { config, configDir, isInProjectMode } = await loadConfig(
    join(presetDir, PRESET_CONFIG_FILENAME)
  );

  const { platforms } = config;

  // Determine agentrulesDir location
  // "." means config directory itself, otherwise a subdirectory (default: .agentrules)
  const agentrulesDir = config.agentrulesDir ?? AGENT_RULES_DIR;
  const isAgentrulesAtRoot = agentrulesDir === ".";
  const agentrulesPath = isAgentrulesAtRoot
    ? configDir
    : join(configDir, agentrulesDir);

  // Read shared metadata files from agentrulesDir
  let installMessage: string | undefined;
  let readmeContent: string | undefined;
  let licenseContent: string | undefined;

  if (isAgentrulesAtRoot || (await directoryExists(agentrulesPath))) {
    installMessage = await readFileIfExists(
      join(agentrulesPath, INSTALL_FILENAME)
    );
    readmeContent = await readFileIfExists(
      join(agentrulesPath, README_FILENAME)
    );
    licenseContent = await readFileIfExists(
      join(agentrulesPath, LICENSE_FILENAME)
    );
  }

  // Build ignore patterns: defaults + custom from config
  const ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...(config.ignore ?? [])];

  // Collect files for each platform
  const platformFiles: PlatformFiles[] = [];

  for (const entry of platforms) {
    const { platform, path: customPath } = entry;
    let filesDir: string;

    if (isInProjectMode) {
      // Config in platform dir: files are siblings of config
      filesDir = configDir;
      log.debug(`Config in platform dir: files for ${platform} in ${filesDir}`);
    } else {
      // Config at repo root: files in platform subdir
      // Use custom path if specified, otherwise use platform's default dir
      const platformDir = customPath ?? PLATFORMS[platform].platformDir;
      filesDir = join(configDir, platformDir);

      log.debug(`Config at repo root: files for ${platform} in ${filesDir}`);

      if (!(await directoryExists(filesDir))) {
        throw new Error(
          `Files directory not found: ${filesDir}. Create the directory or set "path" in the platform entry.`
        );
      }
    }

    // Determine what to exclude from bundle at root level:
    // - Always exclude config file
    // - If agentrulesDir is a subdirectory, exclude that directory
    // - If agentrulesDir is "." (root), exclude the individual metadata files
    const rootExclude = isAgentrulesAtRoot
      ? [
          PRESET_CONFIG_FILENAME,
          README_FILENAME,
          LICENSE_FILENAME,
          INSTALL_FILENAME,
        ]
      : [PRESET_CONFIG_FILENAME, agentrulesDir];

    const files = await collectFiles(filesDir, rootExclude, ignorePatterns);

    if (files.length === 0) {
      throw new Error(
        `No files found in ${filesDir}. Presets must include at least one file.`
      );
    }

    platformFiles.push({ platform, files });
  }

  // Return normalized PresetInput format
  return {
    name: config.name,
    config,
    platformFiles,
    installMessage,
    readmeContent,
    licenseContent,
  };
}

/**
 * Check if a filename matches an ignore pattern.
 * Supports:
 * - Exact match: "node_modules"
 * - Extension match: "*.lock"
 * - Prefix match: ".git*" (not implemented yet, keeping simple)
 */
function matchesPattern(name: string, pattern: string): boolean {
  // Extension pattern: *.ext
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1); // ".lock"
    return name.endsWith(ext);
  }

  // Exact match
  return name === pattern;
}

/**
 * Check if a filename should be ignored based on patterns.
 */
function shouldIgnore(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(name, pattern));
}

/**
 * Recursively collect all files from a directory.
 *
 * @param dir - Current directory being scanned
 * @param rootExclude - Entries to exclude at root level only (config, metadata dir)
 * @param ignorePatterns - Patterns to ignore at all levels
 * @param root - The root directory (for computing relative paths)
 */
async function collectFiles(
  dir: string,
  rootExclude: string[],
  ignorePatterns: string[],
  root?: string
): Promise<Array<{ path: string; content: string }>> {
  const configRoot = root ?? dir;
  const isRoot = configRoot === dir;
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{ path: string; content: string }> = [];

  for (const entry of entries) {
    // Skip config and metadata dir at root only
    if (isRoot && rootExclude.includes(entry.name)) {
      continue;
    }

    // Skip ignored patterns at all levels
    if (shouldIgnore(entry.name, ignorePatterns)) {
      log.debug(`Ignoring: ${entry.name}`);
      continue;
    }

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = await collectFiles(
        fullPath,
        rootExclude,
        ignorePatterns,
        configRoot
      );
      files.push(...nested);
    } else if (entry.isFile()) {
      const content = await readFile(fullPath, "utf8");
      const relativePath = relative(configRoot, fullPath);
      files.push({ path: relativePath, content });
    }
  }

  return files;
}

/**
 * Read a file if it exists, otherwise return undefined.
 */
async function readFileIfExists(path: string): Promise<string | undefined> {
  if (await fileExists(path)) {
    return await readFile(path, "utf8");
  }
  return;
}
