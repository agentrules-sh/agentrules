/**
 * Add Command
 *
 * Resolves a slug from the registry and installs the content.
 */

import type {
  PlatformId,
  ResolvedRule,
  RuleBundle,
  RuleVariant,
  RuleVersion,
} from "@agentrules/core";
import {
  createDiffPreview,
  decodeBundledFile,
  fetchBundle,
  getLatestVersion,
  getRelativeInstallPath,
  getVariant,
  getVersion,
  hasBundle,
  isLikelyText,
  normalizeBundlePath,
  PLATFORMS,
  resolveSlug,
  toUtf8String,
  USER_HOME_DIR_PLACEHOLDER,
  verifyBundledFileChecksum,
} from "@agentrules/core";
import chalk from "chalk";
import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, relative, resolve, sep } from "path";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";

// =============================================================================
// Types
// =============================================================================

export type FileWriteStatus =
  | "created"
  | "overwritten"
  | "unchanged"
  | "conflict"
  | "skipped";

export type AddOptions = {
  slug: string;
  platform?: PlatformId;
  version?: string;
  global?: boolean;
  directory?: string;
  force?: boolean;
  dryRun?: boolean;
  skipConflicts?: boolean;
  noBackup?: boolean;
};

export type FileResult = {
  path: string;
  status: FileWriteStatus;
  diff?: string | null;
};

type BackupDetail = {
  originalPath: string;
  backupPath: string;
};

type WriteStats = {
  files: FileResult[];
  backups: BackupDetail[];
};

export type AddResult = {
  resolved: ResolvedRule;
  version: RuleVersion;
  variant: RuleVariant;
  bundle: RuleBundle;
  files: FileResult[];
  backups: BackupDetail[];
  targetRoot: string;
  targetLabel: string;
  registryAlias: string;
  dryRun: boolean;
};

// Helper to get conflicts from files
export function getConflicts(files: FileResult[]): FileResult[] {
  return files.filter((f) => f.status === "conflict");
}

// =============================================================================
// Main Entry Point
// =============================================================================

export async function add(options: AddOptions): Promise<AddResult> {
  const ctx = useAppContext();
  const { alias: registryAlias, url: registryUrl } = ctx.registry;
  const dryRun = Boolean(options.dryRun);

  // Parse slug and optional platform/version from input
  const { slug, platform, version } = parseInput(
    options.slug,
    options.platform,
    options.version
  );

  log.debug(`Resolving ${slug}${version ? ` (version ${version})` : ""}`);

  // Resolve slug to get all versions and variants
  const resolved = await resolveSlug(registryUrl, slug, version);

  if (!resolved) {
    throw new Error(`"${slug}" was not found in the registry.`);
  }

  // Select version and variant
  const { selectedVersion, selectedVariant } = selectVariant(
    resolved,
    version,
    platform
  );

  return addRule(resolved, selectedVersion, selectedVariant, {
    ...options,
    registryAlias,
    dryRun,
  });
}

// =============================================================================
// Variant Selection
// =============================================================================

function selectVariant(
  resolved: ResolvedRule,
  requestedVersion: string | undefined,
  platform: PlatformId | undefined
): { selectedVersion: RuleVersion; selectedVariant: RuleVariant } {
  // Get the requested version or latest
  const selectedVersion = requestedVersion
    ? getVersion(resolved, requestedVersion)
    : getLatestVersion(resolved);

  if (!selectedVersion) {
    const versionLabel = requestedVersion ?? "latest";
    throw new Error(
      `Version "${versionLabel}" not found for "${resolved.slug}".`
    );
  }

  // Check if platform is needed
  if (selectedVersion.variants.length === 0) {
    throw new Error(`No platform variants found for "${resolved.slug}".`);
  }

  if (selectedVersion.variants.length > 1 && !platform) {
    const platforms = selectedVersion.variants
      .map((v) => v.platform)
      .join(", ");
    throw new Error(
      `"${resolved.slug}" is available for multiple platforms: ${platforms}. ` +
        "Use --platform <platform> to specify which one."
    );
  }

  // Select variant (auto-selects if only one variant)
  const selectedVariant = platform
    ? getVariant(selectedVersion, platform)
    : selectedVersion.variants[0];

  if (!selectedVariant) {
    throw new Error(
      `Platform "${platform}" not found for "${resolved.slug}" v${selectedVersion.version}.`
    );
  }

  return { selectedVersion, selectedVariant };
}

// =============================================================================
// Installation
// =============================================================================

type InstallOptions = AddOptions & {
  registryAlias: string;
  dryRun: boolean;
};

async function addRule(
  resolved: ResolvedRule,
  version: RuleVersion,
  variant: RuleVariant,
  options: InstallOptions
): Promise<AddResult> {
  log.debug(`Installing rule: ${variant.platform} v${version.version}`);

  // Get bundle content
  let bundle: RuleBundle;

  if (hasBundle(variant)) {
    log.debug(`Downloading bundle from ${variant.bundleUrl}`);
    bundle = await fetchBundle(variant.bundleUrl);
  } else {
    // Inline content
    log.debug("Using inline bundle content");
    bundle = JSON.parse(variant.content) as RuleBundle;
  }

  if (bundle.slug !== resolved.slug || bundle.platform !== variant.platform) {
    throw new Error(
      `Bundle metadata mismatch for "${resolved.slug}". ` +
        `Expected slug "${resolved.slug}" (${variant.platform}).`
    );
  }

  const target = resolveInstallTarget(
    variant.platform,
    bundle.type,
    bundle.name,
    options
  );

  log.debug(`Writing ${bundle.files.length} files to ${target.root}`);

  // Prepare files to write, tracking skipped files
  const filesToWrite: Array<{ path: string; content: Buffer }> = [];
  const skippedFiles: FileResult[] = [];

  for (const file of bundle.files) {
    const decoded = decodeBundledFile(file);
    const data = Buffer.from(decoded);
    await verifyBundledFileChecksum(file, data);

    const destPath = computeDestinationPath(file.path, target);

    if (destPath === null) {
      // File skipped (e.g., multi type global install with non-platformDir path)
      const normalizedPath = normalizeBundlePath(file.path) ?? file.path;
      skippedFiles.push({
        path: normalizedPath,
        status: "skipped",
      });
      log.debug(
        `Skipped (not supported for ${target.mode}): ${normalizedPath}`
      );
      continue;
    }

    filesToWrite.push({ path: destPath, content: data });
  }

  const writeStats = await writeFiles(filesToWrite, target.root, {
    force: Boolean(options.force),
    skipConflicts: Boolean(options.skipConflicts),
    noBackup: Boolean(options.noBackup),
    dryRun: options.dryRun,
  });

  return {
    resolved,
    version,
    variant,
    bundle,
    files: [...writeStats.files, ...skippedFiles],
    backups: writeStats.backups,
    targetRoot: target.root,
    targetLabel: target.label,
    registryAlias: options.registryAlias,
    dryRun: options.dryRun,
  };
}

// =============================================================================
// File Writing
// =============================================================================

type WriteOptions = {
  force: boolean;
  skipConflicts: boolean;
  noBackup: boolean;
  dryRun: boolean;
};

async function writeFiles(
  filesToWrite: Array<{ path: string; content: Buffer }>,
  root: string,
  options: WriteOptions
): Promise<WriteStats> {
  const files: FileResult[] = [];
  const backups: BackupDetail[] = [];

  if (!options.dryRun) {
    await mkdir(root, { recursive: true });
  }

  for (const { path: destination, content } of filesToWrite) {
    if (!options.dryRun) {
      await mkdir(dirname(destination), { recursive: true });
    }

    const existing = await readExistingFile(destination);
    const relativePath = relativize(destination, root);

    // File doesn't exist - create it
    if (!existing) {
      if (!options.dryRun) {
        await writeFile(destination, content);
      }
      files.push({ path: relativePath, status: "created" });
      log.debug(`Created: ${relativePath}`);
      continue;
    }

    // File exists and content is the same - unchanged
    if (existing.equals(content)) {
      files.push({ path: relativePath, status: "unchanged" });
      log.debug(`Unchanged: ${relativePath}`);
      continue;
    }

    // Content differs - handle conflict
    const diff = renderDiffPreview(relativePath, existing, content);

    if (options.force) {
      // Backup before overwriting (unless --no-backup)
      if (!options.noBackup) {
        const backupPath = `${destination}.bak`;
        const relativeBackupPath = `${relativePath}.bak`;
        if (!options.dryRun) {
          await copyFile(destination, backupPath);
        }
        backups.push({
          originalPath: relativePath,
          backupPath: relativeBackupPath,
        });
        log.debug(`Backed up: ${relativePath} → ${relativeBackupPath}`);
      }

      if (!options.dryRun) {
        await writeFile(destination, content);
      }
      files.push({ path: relativePath, status: "overwritten" });
      log.debug(`Overwritten: ${relativePath}`);
      continue;
    }

    // Conflict - skip if requested, otherwise record
    if (options.skipConflicts) {
      files.push({ path: relativePath, status: "skipped", diff });
      log.debug(`Skipped: ${relativePath}`);
    } else {
      files.push({ path: relativePath, status: "conflict", diff });
      log.debug(`Conflict: ${relativePath}`);
    }
  }

  return { files, backups };
}

// =============================================================================
// Path Resolution
// =============================================================================

type InstallTarget = {
  root: string;
  mode: "project" | "global";
  platform: PlatformId;
  platformDir: string;
  globalDir: string;
  type?: string;
  name: string;
  label: string;
};

function resolveInstallTarget(
  platform: PlatformId,
  type: string | undefined,
  name: string,
  options: AddOptions
): InstallTarget {
  const { platformDir, globalDir } = PLATFORMS[platform];

  if (options.global) {
    if (!globalDir) {
      throw new Error(
        `Platform "${platform}" does not support global installation`
      );
    }
    const globalRoot = resolve(expandUserHomeDir(globalDir));
    return {
      root: globalRoot,
      mode: "global",
      platform,
      platformDir,
      globalDir: globalRoot,
      type,
      name,
      label: `global path ${globalRoot}`,
    };
  }

  // Project install: use custom directory or current working directory
  const projectRoot = options.directory
    ? resolve(expandUserHomeDir(options.directory))
    : process.cwd();
  const label = options.directory
    ? `directory ${projectRoot}`
    : `project root ${projectRoot}`;

  return {
    root: projectRoot,
    mode: "project",
    platform,
    platformDir,
    globalDir,
    type,
    name,
    label,
  };
}

/**
 * Resolve install path based on scope and type.
 *
 * - Project scope: use file.path directly
 * - Global scope:
 *   - If path starts with platformDir: strip prefix (target.root is already globalDir)
 *   - If typed bundle and root file: use type template to get relative path
 *   - If freeform bundle and root file: use path as-is (relative to globalDir)
 *
 * IMPORTANT: For global scope, this returns RELATIVE paths only.
 * The caller combines with target.root (which is the expanded globalDir).
 */
function resolvePath(filePath: string, target: InstallTarget): string | null {
  const { platform, platformDir, type, name, mode } = target;

  // Project scope: use bundle path directly
  if (mode === "project") {
    return filePath;
  }

  // Global scope - return RELATIVE paths only (target.root is already expanded globalDir)
  const platformDirPrefix = `${platformDir}/`;

  // If path starts with platformDir, strip it (target.root already points to globalDir)
  if (filePath.startsWith(platformDirPrefix)) {
    return filePath.slice(platformDirPrefix.length);
  }

  // Path doesn't start with platformDir - it's a root-level file
  if (!type) {
    // Freeform bundle: install root files relative to globalDir
    return filePath;
  }

  // Typed bundle: get relative path from type template
  return getRelativeInstallPath({
    platform,
    type,
    name,
    scope: "global",
  });
}

function computeDestinationPath(
  pathInput: string,
  target: InstallTarget
): string | null {
  const normalized = normalizeBundlePath(pathInput);

  if (!normalized) {
    throw new Error(
      `Unable to derive destination for ${pathInput}. The computed relative path is empty.`
    );
  }

  // Security: reject dangerous path patterns early
  validateBundlePath(normalized, pathInput);

  const resolvedPath = resolvePath(normalized, target);

  // null means file should be skipped (e.g., multi type global install)
  if (resolvedPath === null) {
    return null;
  }

  const destination = resolve(target.root, resolvedPath);
  ensureWithinRoot(destination, target.root);
  return destination;
}

/**
 * Validate bundle path for dangerous patterns.
 * Throws if path contains traversal or home directory references.
 */
function validateBundlePath(normalized: string, original: string): void {
  // Reject paths containing parent directory traversal
  if (normalized.includes("..")) {
    throw new Error(
      `Refusing to install file with path traversal: ${original}`
    );
  }

  // Reject paths starting with ~ (home directory reference)
  if (normalized.startsWith("~")) {
    throw new Error(
      `Refusing to install file with home directory reference: ${original}`
    );
  }

  // Reject paths containing ~ anywhere (could be malicious like "foo/~/bar")
  if (normalized.includes("/~/") || normalized.includes("\\~\\")) {
    throw new Error(
      `Refusing to install file with embedded home directory reference: ${original}`
    );
  }
}

// =============================================================================
// Helpers
// =============================================================================

function parseInput(
  input: string,
  explicitPlatform?: PlatformId,
  explicitVersion?: string
): { slug: string; platform?: PlatformId; version?: string } {
  let normalized = input.toLowerCase().trim();

  // Extract version from @version suffix
  let parsedVersion: string | undefined;
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex > 0) {
    parsedVersion = normalized.slice(atIndex + 1);
    normalized = normalized.slice(0, atIndex);
  }

  return {
    slug: normalized,
    platform: explicitPlatform,
    version: explicitVersion ?? parsedVersion,
  };
}

async function readExistingFile(pathname: string): Promise<Buffer | null> {
  try {
    return await readFile(pathname);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function renderDiffPreview(
  path: string,
  existing: Buffer,
  incoming: Buffer
): string | null {
  if (!(isLikelyText(existing) && isLikelyText(incoming))) {
    return "(binary file differs)";
  }

  const preview = createDiffPreview(
    path,
    toUtf8String(existing),
    toUtf8String(incoming)
  );

  return preview
    .split("\n")
    .map((line) => {
      if (line.startsWith("@@")) return chalk.blueBright.bold(line);
      if (
        line.startsWith("diff") ||
        line.startsWith("index") ||
        line.startsWith("+++") ||
        line.startsWith("---")
      ) {
        return chalk.yellow(line);
      }
      if (line.startsWith("+")) return chalk.green.bold(line);
      if (line.startsWith("-")) return chalk.red.bold(line);
      return line;
    })
    .join("\n");
}

function relativize(pathname: string, root: string) {
  const relativePath = relative(root, pathname);
  if (!relativePath || relativePath.startsWith("..")) {
    return pathname;
  }
  return relativePath;
}

function ensureWithinRoot(candidate: string, root: string) {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  if (candidate === root) {
    return;
  }
  if (!candidate.startsWith(normalizedRoot)) {
    throw new Error(
      `Refusing to write outside of ${root}. Derived path: ${candidate}`
    );
  }
}

/**
 * Expand home directory references in a path string.
 * Handles both {userHomeDir} placeholder and ~ prefix.
 */
function expandUserHomeDir(path: string): string {
  const home = process.env.HOME || homedir();

  if (path.includes(USER_HOME_DIR_PLACEHOLDER)) {
    return path.replace(USER_HOME_DIR_PLACEHOLDER, home);
  }

  // Handle ~ prefix (for user-provided paths like --dir ~/foo)
  if (path.startsWith("~")) {
    const remainder = path.slice(1);
    if (!remainder) return home;
    if (remainder.startsWith("/") || remainder.startsWith("\\")) {
      return `${home}${remainder}`;
    }
    return `${home}/${remainder}`;
  }

  return path;
}

export { normalizePlatformInput } from "@agentrules/core";
