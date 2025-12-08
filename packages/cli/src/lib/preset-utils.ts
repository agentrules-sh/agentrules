import {
  AGENT_RULES_DIR,
  isPlatformDir,
  PLATFORMS,
  PRESET_CONFIG_FILENAME,
  type PresetInput,
  validatePresetConfig,
} from "@agentrules/core";
import { readdir, readFile, stat } from "fs/promises";
import { basename, join, relative } from "path";
import { directoryExists, fileExists } from "./fs";
import { log } from "./log";

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
 * Load a preset from a directory containing agentrules.json.
 *
 * Config in platform dir (e.g., .claude/agentrules.json):
 *   - Preset files: siblings of config
 *   - Metadata: .agentrules/ subfolder
 *
 * Config at repo root:
 *   - Preset files: in .claude/ (or `path` from config)
 *   - Metadata: .agentrules/ subfolder
 */
export async function loadPreset(presetDir: string): Promise<PresetInput> {
  const configPath = join(presetDir, PRESET_CONFIG_FILENAME);

  if (!(await fileExists(configPath))) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configRaw = await readFile(configPath, "utf8");

  let configJson: unknown;
  try {
    configJson = JSON.parse(configRaw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }

  // Use name from config if available, otherwise show path for clarity
  const configObj = configJson as Record<string, unknown> | null;
  const identifier =
    typeof configObj?.name === "string" ? configObj.name : configPath;

  const config = validatePresetConfig(configJson, identifier);
  const name = config.name;

  // Determine layout based on whether config is inside a platform directory
  const dirName = basename(presetDir);
  const isConfigInPlatformDir = isPlatformDir(dirName);

  let filesDir: string;
  let metadataDir: string;

  if (isConfigInPlatformDir) {
    // Config in platform dir: files are siblings, metadata in .agentrules/
    filesDir = presetDir;
    metadataDir = join(presetDir, AGENT_RULES_DIR);

    log.debug(
      `Config in platform dir: files in ${filesDir}, metadata in ${metadataDir}`
    );
  } else {
    // Config at repo root: files in platform subdir (or custom path)
    const platformDir = config.path ?? PLATFORMS[config.platform].projectDir;
    filesDir = join(presetDir, platformDir);
    metadataDir = join(presetDir, AGENT_RULES_DIR);

    log.debug(
      `Config at repo root: files in ${filesDir}, metadata in ${metadataDir}`
    );

    if (!(await directoryExists(filesDir))) {
      throw new Error(
        `Files directory not found: ${filesDir}. Create the directory or set "path" in ${PRESET_CONFIG_FILENAME}.`
      );
    }
  }

  // Read metadata from .agentrules/ directory
  let installMessage: string | undefined;
  let readmeContent: string | undefined;
  let licenseContent: string | undefined;

  if (await directoryExists(metadataDir)) {
    installMessage = await readFileIfExists(
      join(metadataDir, INSTALL_FILENAME)
    );
    readmeContent = await readFileIfExists(join(metadataDir, README_FILENAME));
    licenseContent = await readFileIfExists(
      join(metadataDir, LICENSE_FILENAME)
    );
  }

  // Build ignore patterns: defaults + custom from config
  const ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...(config.ignore ?? [])];

  // Collect files, excluding config, metadata dir, and ignored patterns
  const rootExclude = [PRESET_CONFIG_FILENAME, AGENT_RULES_DIR];
  const files = await collectFiles(filesDir, rootExclude, ignorePatterns);

  if (files.length === 0) {
    throw new Error(
      `No files found in ${filesDir}. Presets must include at least one file.`
    );
  }

  return { name, config, files, installMessage, readmeContent, licenseContent };
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
): Promise<Array<{ path: string; contents: string }>> {
  const configRoot = root ?? dir;
  const isRoot = configRoot === dir;
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{ path: string; contents: string }> = [];

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
      const contents = await readFile(fullPath, "utf8");
      const relativePath = relative(configRoot, fullPath);
      files.push({ path: relativePath, contents });
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
