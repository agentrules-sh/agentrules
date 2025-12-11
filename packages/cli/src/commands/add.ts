/**
 * Unified Add Command
 *
 * Resolves a slug from the registry and installs the content,
 * whether it's a preset or a rule.
 */

import type {
  PlatformId,
  PresetBundle,
  PresetVariant,
  PresetVersion,
  ResolvedPreset,
  ResolvedRule,
  RuleVariant,
  RuleVersion,
} from "@agentrules/core";
import {
  createDiffPreview,
  decodeBundledFile,
  fetchBundle,
  getInstallPath,
  getLatestPresetVersion,
  getLatestRuleVersion,
  getPresetVariant,
  getPresetVersion,
  getRuleVariant,
  getRuleVersion,
  hasBundle,
  isLikelyText,
  normalizeBundlePath,
  PLATFORMS,
  resolveSlug,
  toUtf8String,
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

// Preset result
export type AddPresetResult = {
  kind: "preset";
  resolved: ResolvedPreset;
  version: PresetVersion;
  variant: PresetVariant;
  bundle: PresetBundle;
  files: FileResult[];
  backups: BackupDetail[];
  targetRoot: string;
  targetLabel: string;
  registryAlias: string;
  dryRun: boolean;
};

// Rule result
export type AddRuleResult = {
  kind: "rule";
  resolved: ResolvedRule;
  version: RuleVersion;
  variant: RuleVariant;
  files: FileResult[];
  backups: BackupDetail[];
  targetRoot: string;
  targetLabel: string;
  registryAlias: string;
  dryRun: boolean;
};

export type AddResult = AddPresetResult | AddRuleResult;

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

  // Handle based on content kind
  if (resolved.kind === "preset") {
    // Select version and variant
    const { selectedVersion: presetVersion, selectedVariant: presetVariant } =
      selectPresetVariant(resolved, version, platform);

    return addPreset(resolved, presetVersion, presetVariant, {
      ...options,
      registryAlias,
      dryRun,
    });
  }

  // Rule
  const { selectedVersion: ruleVersion, selectedVariant: ruleVariant } =
    selectRuleVariant(resolved, version, platform);

  return addRule(resolved, ruleVersion, ruleVariant, {
    ...options,
    registryAlias,
    dryRun,
  });
}

// =============================================================================
// Variant Selection
// =============================================================================

function selectPresetVariant(
  resolved: ResolvedPreset,
  requestedVersion: string | undefined,
  platform: PlatformId | undefined
): { selectedVersion: PresetVersion; selectedVariant: PresetVariant } {
  // Get the requested version or latest
  const selectedVersion = requestedVersion
    ? getPresetVersion(resolved, requestedVersion)
    : getLatestPresetVersion(resolved);

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
    ? getPresetVariant(selectedVersion, platform)
    : selectedVersion.variants[0];

  if (!selectedVariant) {
    throw new Error(
      `Platform "${platform}" not found for "${resolved.slug}" v${selectedVersion.version}.`
    );
  }

  return { selectedVersion, selectedVariant };
}

function selectRuleVariant(
  resolved: ResolvedRule,
  requestedVersion: string | undefined,
  platform: PlatformId | undefined
): { selectedVersion: RuleVersion; selectedVariant: RuleVariant } {
  // Get the requested version or latest
  const selectedVersion = requestedVersion
    ? getRuleVersion(resolved, requestedVersion)
    : getLatestRuleVersion(resolved);

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
    ? getRuleVariant(selectedVersion, platform)
    : selectedVersion.variants[0];

  if (!selectedVariant) {
    throw new Error(
      `Platform "${platform}" not found for "${resolved.slug}" v${selectedVersion.version}.`
    );
  }

  return { selectedVersion, selectedVariant };
}

// =============================================================================
// Preset Installation
// =============================================================================

type InstallOptions = AddOptions & {
  registryAlias: string;
  dryRun: boolean;
};

async function addPreset(
  resolved: ResolvedPreset,
  version: PresetVersion,
  variant: PresetVariant,
  options: InstallOptions
): Promise<AddPresetResult> {
  log.debug(`Installing preset: ${variant.platform} v${version.version}`);

  // Get bundle content
  let bundle: PresetBundle;

  if (hasBundle(variant)) {
    log.debug(`Downloading bundle from ${variant.bundleUrl}`);
    bundle = await fetchBundle(variant.bundleUrl);
  } else {
    // Inline content
    log.debug("Using inline bundle content");
    bundle = JSON.parse(variant.content) as PresetBundle;
  }

  if (bundle.slug !== resolved.slug || bundle.platform !== variant.platform) {
    throw new Error(
      `Bundle metadata mismatch for "${resolved.slug}". ` +
        `Expected slug "${resolved.slug}" (${variant.platform}).`
    );
  }

  const target = resolveInstallTarget(variant.platform, options);

  log.debug(`Writing ${bundle.files.length} files to ${target.root}`);

  // Prepare files to write
  const filesToWrite: Array<{ path: string; content: Buffer }> = [];
  for (const file of bundle.files) {
    const decoded = decodeBundledFile(file);
    const data = Buffer.from(decoded);
    await verifyBundledFileChecksum(file, data);

    const destPath = computePresetDestinationPath(file.path, target);
    filesToWrite.push({ path: destPath, content: data });
  }

  const writeStats = await writeFiles(filesToWrite, target.root, {
    force: Boolean(options.force),
    skipConflicts: Boolean(options.skipConflicts),
    noBackup: Boolean(options.noBackup),
    dryRun: options.dryRun,
  });

  return {
    kind: "preset",
    resolved,
    version,
    variant,
    bundle,
    files: writeStats.files,
    backups: writeStats.backups,
    targetRoot: target.root,
    targetLabel: target.label,
    registryAlias: options.registryAlias,
    dryRun: options.dryRun,
  };
}

// =============================================================================
// Rule Installation
// =============================================================================

async function addRule(
  resolved: ResolvedRule,
  version: RuleVersion,
  variant: RuleVariant,
  options: InstallOptions
): Promise<AddRuleResult> {
  log.debug(`Installing rule: ${variant.platform} v${version.version}`);

  // Determine target path and root
  const { targetPath, targetRoot, targetLabel } = resolveRuleTarget(
    variant.platform,
    variant.type,
    resolved.name,
    options
  );

  log.debug(`Target path: ${targetPath}`);

  // Write single file using shared logic
  const writeStats = await writeFiles(
    [{ path: targetPath, content: Buffer.from(variant.content, "utf-8") }],
    targetRoot,
    {
      force: Boolean(options.force),
      skipConflicts: false, // Single file, no skip
      noBackup: Boolean(options.noBackup),
      dryRun: options.dryRun,
    }
  );

  return {
    kind: "rule",
    resolved,
    version,
    variant,
    files: writeStats.files,
    backups: writeStats.backups,
    targetRoot,
    targetLabel,
    registryAlias: options.registryAlias,
    dryRun: options.dryRun,
  };
}

// =============================================================================
// Shared File Writing Logic
// =============================================================================

type WriteOptions = {
  force: boolean;
  skipConflicts: boolean;
  noBackup: boolean;
  dryRun: boolean;
};

/**
 * Write files with conflict detection, backup support, and diff preview.
 * Used by both preset and rule installation.
 */
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
// Shared Helpers
// =============================================================================

/**
 * Parse input to extract slug and version.
 * Platform must be specified via --platform flag.
 */
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

// =============================================================================
// Preset Path Resolution
// =============================================================================

type InstallTarget = {
  root: string;
  mode: "project" | "global" | "custom";
  platform: PlatformId;
  projectDir: string;
  label: string;
};

function resolveInstallTarget(
  platform: PlatformId,
  options: AddOptions
): InstallTarget {
  const { projectDir, globalDir } = PLATFORMS[platform];

  if (options.directory) {
    const customRoot = resolve(expandHome(options.directory));
    return {
      root: customRoot,
      mode: "custom",
      platform,
      projectDir,
      label: `custom directory ${customRoot}`,
    };
  }

  if (options.global) {
    if (!globalDir) {
      throw new Error(
        `Platform "${platform}" does not support global installation`
      );
    }
    const globalRoot = resolve(expandHome(globalDir));
    return {
      root: globalRoot,
      mode: "global",
      platform,
      projectDir,
      label: `global path ${globalRoot}`,
    };
  }

  const projectRoot = process.cwd();
  return {
    root: projectRoot,
    mode: "project",
    platform,
    projectDir,
    label: `project root ${projectRoot}`,
  };
}

function computePresetDestinationPath(
  pathInput: string,
  target: InstallTarget
): string {
  const normalized = normalizeBundlePath(pathInput);

  if (!normalized) {
    throw new Error(
      `Unable to derive destination for ${pathInput}. The computed relative path is empty.`
    );
  }

  let relativePath: string;

  if (target.mode === "global") {
    relativePath = normalized;
  } else {
    relativePath = `${target.projectDir}/${normalized}`;
  }

  const destination = resolve(target.root, relativePath);
  ensureWithinRoot(destination, target.root);
  return destination;
}

// =============================================================================
// Rule Path Resolution
// =============================================================================

function resolveRuleTarget(
  platform: PlatformId,
  type: string,
  name: string,
  options: { global?: boolean; directory?: string }
): { targetPath: string; targetRoot: string; targetLabel: string } {
  const location = options.global ? "global" : "project";
  const pathTemplate = getInstallPath(platform, type, name, location);

  if (!pathTemplate) {
    const locationLabel = options.global ? "globally" : "to a project";
    throw new Error(
      `Rule type "${type}" cannot be installed ${locationLabel} for platform "${platform}"`
    );
  }

  if (options.directory) {
    const customRoot = resolve(expandHome(options.directory));
    const filename = pathTemplate.split("/").pop() ?? `${name}.md`;
    const targetPath = resolve(customRoot, filename);
    ensureWithinRoot(targetPath, customRoot);
    return {
      targetPath,
      targetRoot: customRoot,
      targetLabel: `custom directory ${customRoot}`,
    };
  }

  const expanded = expandHome(pathTemplate);
  const targetPath = expanded.startsWith("/")
    ? expanded
    : resolve(process.cwd(), expanded);

  const targetRoot = options.global ? dirname(targetPath) : process.cwd();
  ensureWithinRoot(targetPath, targetRoot);

  const targetLabel = options.global
    ? `global path ${targetRoot}`
    : `project root ${targetRoot}`;

  return { targetPath, targetRoot, targetLabel };
}

// =============================================================================
// Common Utilities
// =============================================================================

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
 * Expands ~ to the user's home directory.
 *
 * Uses process.env.HOME (Unix) or process.env.USERPROFILE (Windows) first,
 * falling back to os.homedir(). This matches shell behavior and allows
 * tests to override the home directory via environment variables.
 */
function expandHome(value: string) {
  if (value.startsWith("~")) {
    const remainder = value.slice(1);
    // Use env vars first (matches shell/Go behavior, enables test isolation)
    const home = process.env.HOME || process.env.USERPROFILE || homedir();
    if (!remainder) {
      return home;
    }
    if (remainder.startsWith("/") || remainder.startsWith("\\")) {
      return `${home}${remainder}`;
    }
    return `${home}/${remainder}`;
  }
  return value;
}

export { normalizePlatformInput } from "@agentrules/core";
