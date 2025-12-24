import {
  getInstallDir,
  getInstallPath,
  normalizePlatformEntry,
  normalizePlatformInput,
  normalizeSkillFiles,
  PLATFORMS,
  type PlatformFiles,
  RULE_CONFIG_FILENAME,
  type RuleConfig,
  type RuleInput,
  validateConfig,
} from "@agentrules/core";
import { readdir, readFile, stat } from "fs/promises";
import { dirname, join, relative } from "path";
import { directoryExists, fileExists } from "./fs";
import { log } from "./log";

// Re-export types for consumers
export type { RuleConfig } from "@agentrules/core";

export const SKILL_FILENAME = "SKILL.md";

export type SkillFrontmatter = {
  name?: string;
  license?: string;
};

/**
 * Parse SKILL.md frontmatter for name and license.
 * Only extracts simple key: value pairs we need for quick publish defaults.
 */
export function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return {};

  const frontmatter = match[1];
  const result: SkillFrontmatter = {};

  // Extract name: value (handles quoted and unquoted values)
  const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (nameMatch?.[1]) {
    result.name = nameMatch[1].trim();
  }

  // Extract license: value
  const licenseMatch = frontmatter.match(
    /^license:\s*["']?([^"'\n]+)["']?\s*$/m
  );
  if (licenseMatch?.[1]) {
    result.license = licenseMatch[1].trim();
  }

  return result;
}

const METADATA_FILES = {
  install: ["INSTALL.txt"],
  readme: ["README.md"],
  license: ["LICENSE.md", "LICENSE.txt"],
} as const;

/**
 * Files/directories that are always excluded from rules.
 * These are never useful in a rule bundle.
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
 * Normalize a string to a valid rule slug (lowercase kebab-case)
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
    return join(process.cwd(), RULE_CONFIG_FILENAME);
  }

  const stats = await stat(inputPath).catch(() => null);

  if (stats?.isDirectory()) {
    return join(inputPath, RULE_CONFIG_FILENAME);
  }

  return inputPath;
}

/**
 * Result of loading a rule config file.
 */
export type LoadConfigResult = {
  /** Resolved path to the config file */
  configPath: string;
  config: RuleConfig;
  /** Directory containing the config file */
  configDir: string;
};

export type LoadConfigOverrides = {
  name?: string;
  type?: string;
  title?: string;
  description?: string;
  tags?: string[];
  license?: string;
  /** When set, selects platform entry/entries from "platforms" */
  platform?: string | string[];
};

export function parsePlatformSelection(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : [input];
  const platforms = parts
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (platforms.length === 0) {
    throw new Error("--platform must include at least one platform");
  }

  return Array.from(new Set(platforms));
}

/**
 * Load and normalize a rule config file.
 *
 * @throws Error if config file is missing, invalid JSON, or fails validation
 */
export async function loadConfig(
  inputPath?: string,
  overrides?: LoadConfigOverrides
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
      `Invalid JSON in ${configPath}: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  const configObj =
    typeof configJson === "object" && configJson !== null
      ? (configJson as Record<string, unknown>)
      : null;

  if (overrides && configObj) {
    if (overrides.name !== undefined) configObj.name = overrides.name;
    if (overrides.type !== undefined) configObj.type = overrides.type;
    if (overrides.title !== undefined) configObj.title = overrides.title;
    if (overrides.description !== undefined) {
      configObj.description = overrides.description;
    }
    if (overrides.license !== undefined) configObj.license = overrides.license;
    if (overrides.tags !== undefined) configObj.tags = overrides.tags;

    if (overrides.platform !== undefined) {
      const rawPlatforms = configObj.platforms;
      if (!Array.isArray(rawPlatforms)) {
        throw new Error(
          'Config "platforms" must be an array to use --platform.'
        );
      }

      const selectedPlatforms = parsePlatformSelection(overrides.platform).map(
        normalizePlatformInput
      );

      const filtered = rawPlatforms.filter((entry) => {
        if (typeof entry === "string") {
          return selectedPlatforms.includes(
            entry as (typeof selectedPlatforms)[number]
          );
        }
        if (typeof entry === "object" && entry !== null) {
          const obj = entry as Record<string, unknown>;
          return selectedPlatforms.includes(
            String(obj.platform ?? "") as (typeof selectedPlatforms)[number]
          );
        }
        return false;
      });

      if (filtered.length === 0) {
        throw new Error(
          `None of the selected platforms (${selectedPlatforms.join(
            ", "
          )}) were found in config "platforms".`
        );
      }

      configObj.platforms = filtered;
    }
  }

  const identifier =
    typeof configObj?.name === "string" ? configObj.name : configPath;

  const rawConfig = validateConfig(configJson, identifier);

  // Normalize platforms: expand string entries to { platform, path? } objects
  const platforms = rawConfig.platforms.map(normalizePlatformEntry);

  if (platforms.length === 0) {
    throw new Error(
      `Config must have at least one platform in the "platforms" array.`
    );
  }

  // Build normalized config
  const config: RuleConfig = {
    $schema: rawConfig.$schema,
    name: rawConfig.name,
    type: rawConfig.type,
    title: rawConfig.title,
    description: rawConfig.description,
    license: rawConfig.license,
    version: rawConfig.version,
    tags: rawConfig.tags,
    features: rawConfig.features,
    ignore: rawConfig.ignore,
    platforms,
  };

  const configDir = dirname(configPath);

  const platformNames = platforms.map((p) => p.platform).join(", ");
  log.debug(`Loaded config: ${config.name}, platforms: ${platformNames}`);

  return {
    configPath,
    config,
    configDir,
  };
}

/**
 * Load a rule from a directory containing agentrules.json.
 *
 * Always returns normalized RuleInput format with platformFiles array.
 *
 * File collection:
 * - For each platform entry, files are read from (platformEntry.path ?? ".")
 *   relative to the config directory.
 * - Bundle paths are normalized to canonical install-relative paths:
 *   - instruction files (AGENTS.md / CLAUDE.md) stay root-level
 *   - everything else is prefixed with the platform's platformDir
 */
export async function loadRule(
  ruleDir: string,
  overrides?: LoadConfigOverrides
): Promise<RuleInput> {
  const loaded = await loadConfig(
    join(ruleDir, RULE_CONFIG_FILENAME),
    overrides
  );

  const metadata = await collectMetadata(loaded);
  const platformFiles = await collectPlatformFiles(loaded);

  return {
    name: loaded.config.name,
    config: loaded.config,
    platformFiles,
    ...metadata,
  };
}

export type RuleMetadata = {
  installMessage?: string;
  readmeContent?: string;
  licenseContent?: string;
};

export async function collectMetadata(
  loaded: LoadConfigResult
): Promise<RuleMetadata> {
  const { configDir } = loaded;

  const installMessage = await readFirstMatch(
    configDir,
    METADATA_FILES.install
  );
  const readmeContent = await readFirstMatch(configDir, METADATA_FILES.readme);
  const licenseContent = await readFirstMatch(
    configDir,
    METADATA_FILES.license
  );

  return { installMessage, readmeContent, licenseContent };
}

export async function collectPlatformFiles(
  loaded: LoadConfigResult
): Promise<PlatformFiles[]> {
  const { config, configDir } = loaded;
  const { platforms } = config;

  // Build ignore patterns: defaults + custom from config
  const ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...(config.ignore ?? [])];

  // Collect files for each platform
  const platformFiles: PlatformFiles[] = [];

  for (const entry of platforms) {
    const { platform, path: sourcePath } = entry;
    const platformDir = PLATFORMS[platform].platformDir;

    const resolvedSourcePath = sourcePath ?? ".";
    const filesDir = join(configDir, resolvedSourcePath);

    log.debug(
      `Files for ${platform}: source=${resolvedSourcePath}, dir=${filesDir}`
    );

    const filesDirExists = await directoryExists(filesDir);

    const rootExclude: string[] = [RULE_CONFIG_FILENAME];

    // Config directory is the default metadata location.
    if (filesDir === configDir) {
      rootExclude.push(
        ...METADATA_FILES.readme,
        ...METADATA_FILES.license,
        ...METADATA_FILES.install
      );
    }

    const collectedFiles = filesDirExists
      ? await collectFiles(filesDir, rootExclude, ignorePatterns)
      : [];

    if (collectedFiles.length === 0) {
      if (!filesDirExists) {
        throw new Error(
          `Files directory not found: ${filesDir}. Create the directory or set "path" in the platform entry.`
        );
      }

      throw new Error(
        `No files found in ${filesDir}. Rules must include at least one file.`
      );
    }

    // Handle skill type: use SKILL.md anchor-based normalization
    if (config.type === "skill") {
      const installDir = getInstallDir({
        platform,
        type: "skill",
        name: config.name,
      });

      if (!installDir) {
        throw new Error(`Platform "${platform}" does not support skill type.`);
      }

      const normalizedFiles = normalizeSkillFiles({
        files: collectedFiles,
        installDir,
      });

      platformFiles.push({
        platform,
        files: normalizedFiles.map((f) => ({
          path: f.path,
          content:
            typeof f.content === "string"
              ? f.content
              : new TextDecoder().decode(f.content),
        })),
      });
      continue;
    }

    // Handle instruction type: keep instruction file at root
    const treatInstructionAsRoot =
      config.type === undefined || config.type === "instruction";

    const instructionProjectPath = treatInstructionAsRoot
      ? getInstallPath({
          platform,
          type: "instruction",
          scope: "project",
        })
      : null;

    const instructionContent = instructionProjectPath
      ? await readFileIfExists(join(configDir, instructionProjectPath))
      : undefined;

    const publishFiles: Array<{ path: string; content: string }> = [];
    const seenPublishPaths = new Set<string>();

    for (const file of collectedFiles) {
      const relPath = file.path;

      const publishPath =
        instructionProjectPath && relPath === instructionProjectPath
          ? instructionProjectPath
          : join(platformDir, relPath);

      if (seenPublishPaths.has(publishPath)) continue;
      seenPublishPaths.add(publishPath);
      publishFiles.push({ ...file, path: publishPath });
    }

    if (
      instructionProjectPath &&
      instructionContent !== undefined &&
      !seenPublishPaths.has(instructionProjectPath)
    ) {
      seenPublishPaths.add(instructionProjectPath);
      publishFiles.push({
        path: instructionProjectPath,
        content: instructionContent,
      });
    }

    if (publishFiles.length === 0) {
      throw new Error(
        `No files found in ${filesDir}. Rules must include at least one file.`
      );
    }

    platformFiles.push({ platform, files: publishFiles });
  }

  return platformFiles;
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

/**
 * Try reading files from a list of candidates, return first match.
 */
async function readFirstMatch(
  dir: string,
  filenames: readonly string[]
): Promise<string | undefined> {
  for (const filename of filenames) {
    const content = await readFileIfExists(join(dir, filename));
    if (content !== undefined) {
      return content;
    }
  }
  return;
}
