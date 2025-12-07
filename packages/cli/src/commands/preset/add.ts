import type { PlatformId, PresetBundle } from "@agentrules/core";
import {
  createDiffPreview,
  decodeBundledFile,
  fetchBundle,
  isLikelyText,
  isSupportedPlatform,
  normalizeBundlePath,
  PLATFORMS,
  type ResolvedPreset,
  resolvePreset,
  toUtf8String,
  verifyBundledFileChecksum,
} from "@agentrules/core";
import chalk from "chalk";
import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, relative, resolve, sep } from "path";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";

export type FileWriteStatus =
  | "created"
  | "overwritten"
  | "unchanged"
  | "conflict"
  | "skipped";

export type AddPresetOptions = {
  preset: string;
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
};

export type AddPresetResult = {
  preset: ResolvedPreset["preset"];
  bundle: PresetBundle;
  files: FileResult[];
  conflicts: ConflictDetail[];
  backups: BackupDetail[];
  targetRoot: string;
  targetLabel: string;
  registryAlias: string;
  dryRun: boolean;
};

type InstallTarget = {
  root: string;
  mode: "project" | "global" | "custom";
  platform: PlatformId;
  projectDir: string;
  label: string;
};

type ConflictDetail = {
  path: string;
  diff: string | null;
};

type BackupDetail = {
  originalPath: string;
  backupPath: string;
};

type WriteBundleStats = {
  files: FileResult[];
  conflicts: ConflictDetail[];
  backups: BackupDetail[];
};

export { normalizePlatformInput } from "@agentrules/core";

export async function addPreset(
  options: AddPresetOptions
): Promise<AddPresetResult> {
  const ctx = useAppContext();
  const { alias: registryAlias, url: registryUrl } = ctx.registry;
  const dryRun = Boolean(options.dryRun);

  // Parse slug, platform, and version from input
  const { slug, platform, version } = parsePresetInput(
    options.preset,
    options.platform,
    options.version
  );

  log.debug(
    `Resolving preset ${slug} for platform ${platform}${version ? ` (version ${version})` : ""}`
  );
  const { preset, bundleUrl } = await resolvePreset(
    registryUrl,
    slug,
    platform,
    version
  );

  log.debug(`Downloading bundle from ${bundleUrl}`);
  const bundle = await fetchBundle(bundleUrl);

  if (bundle.slug !== preset.slug || bundle.platform !== preset.platform) {
    throw new Error(
      `Preset bundle metadata mismatch for "${preset.name}". Expected slug "${preset.slug}" (${preset.platform}).`
    );
  }

  const target = resolveInstallTarget(bundle.platform, options);

  log.debug(`Writing ${bundle.files.length} files to ${target.root}`);
  const writeStats = await writeBundleFiles(bundle, target, {
    force: Boolean(options.force),
    skipConflicts: Boolean(options.skipConflicts),
    noBackup: Boolean(options.noBackup),
    dryRun,
  });

  return {
    preset,
    bundle,
    files: writeStats.files,
    conflicts: writeStats.conflicts,
    backups: writeStats.backups,
    targetRoot: target.root,
    targetLabel: target.label,
    registryAlias,
    dryRun,
  };
}

/**
 * Parses preset input to extract slug, platform, and version.
 * Supports formats:
 * - "my-preset" (requires explicit platform)
 * - "my-preset.claude" (platform inferred from suffix)
 * - "my-preset@1.0" (with version)
 * - "my-preset.claude@1.0" (platform and version)
 *
 * Version can also be provided via --version flag (takes precedence).
 */
function parsePresetInput(
  input: string,
  explicitPlatform?: PlatformId,
  explicitVersion?: string
): { slug: string; platform: PlatformId; version?: string } {
  let normalized = input.toLowerCase().trim();

  // Extract version from @version suffix (e.g., "my-preset@1.0" or "my-preset.claude@1.0")
  let parsedVersion: string | undefined;
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex > 0) {
    parsedVersion = normalized.slice(atIndex + 1);
    normalized = normalized.slice(0, atIndex);
  }

  // Explicit version flag takes precedence over @version in input
  const version = explicitVersion ?? parsedVersion;

  // If explicit platform provided, use it
  if (explicitPlatform) {
    // Remove platform suffix if present to get clean slug
    const parts = normalized.split(".");
    const maybePlatform = parts.at(-1);
    if (maybePlatform && isSupportedPlatform(maybePlatform)) {
      return {
        slug: parts.slice(0, -1).join("."),
        platform: explicitPlatform,
        version,
      };
    }
    return { slug: normalized, platform: explicitPlatform, version };
  }

  // Try to infer platform from suffix (e.g., "my-preset.claude")
  const parts = normalized.split(".");
  const maybePlatform = parts.at(-1);
  if (maybePlatform && isSupportedPlatform(maybePlatform)) {
    return {
      slug: parts.slice(0, -1).join("."),
      platform: maybePlatform,
      version,
    };
  }

  throw new Error(
    `Platform not specified. Use --platform <platform> or specify as <slug>.<platform> (e.g., "${input}.claude").`
  );
}

function resolveInstallTarget(
  platform: PlatformId,
  options: AddPresetOptions
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

async function writeBundleFiles(
  bundle: PresetBundle,
  target: InstallTarget,
  behavior: {
    force: boolean;
    skipConflicts: boolean;
    noBackup: boolean;
    dryRun: boolean;
  }
): Promise<WriteBundleStats> {
  const files: FileResult[] = [];
  const conflicts: ConflictDetail[] = [];
  const backups: BackupDetail[] = [];

  if (!behavior.dryRun) {
    await mkdir(target.root, { recursive: true });
  }

  for (const file of bundle.files) {
    const decoded = decodeBundledFile(file);
    const data = Buffer.from(decoded);
    await verifyBundledFileChecksum(file, data);

    const destResult = computeDestinationPath(file.path, target);
    const destination = destResult.path;

    if (!behavior.dryRun) {
      await mkdir(dirname(destination), { recursive: true });
    }

    const existing = await readExistingFile(destination);
    const relativePath = relativize(destination, target.root);

    if (!existing) {
      if (!behavior.dryRun) {
        await writeFile(destination, data);
      }
      files.push({ path: relativePath, status: "created" });
      log.debug(`Created: ${relativePath}`);
      continue;
    }

    if (existing.equals(data)) {
      files.push({ path: relativePath, status: "unchanged" });
      log.debug(`Unchanged: ${relativePath}`);
      continue;
    }

    if (behavior.force) {
      // Backup existing file before overwriting (unless --no-backup)
      if (!behavior.noBackup) {
        const backupPath = `${destination}.bak`;
        const relativeBackupPath = `${relativePath}.bak`;
        if (!behavior.dryRun) {
          await copyFile(destination, backupPath);
        }
        backups.push({
          originalPath: relativePath,
          backupPath: relativeBackupPath,
        });
        log.debug(`Backed up: ${relativePath} → ${relativeBackupPath}`);
      }

      if (!behavior.dryRun) {
        await writeFile(destination, data);
      }
      files.push({ path: relativePath, status: "overwritten" });
      log.debug(`Overwritten: ${relativePath}`);
      continue;
    }

    // Conflict
    conflicts.push({
      path: relativePath,
      diff: renderDiffPreview(relativePath, existing, data),
    });
    files.push({ path: relativePath, status: "conflict" });
    log.debug(`Conflict: ${relativePath}`);
  }

  // Note: conflicts are returned in the result for the CLI to handle display

  return { files, conflicts, backups };
}

type DestinationResult = { path: string };

/**
 * Compute destination path for a bundled file.
 *
 * Bundle files are stored with paths relative to the platform directory
 * (e.g., "AGENTS.md", "commands/test.md") and installed to:
 * - Project/custom: <root>/<projectDir>/<path> (e.g., .opencode/AGENTS.md)
 * - Global: <root>/<path> (e.g., ~/.config/opencode/AGENTS.md)
 */
function computeDestinationPath(
  pathInput: string,
  target: InstallTarget
): DestinationResult {
  const normalized = normalizeBundlePath(pathInput);

  if (!normalized) {
    throw new Error(
      `Unable to derive destination for ${pathInput}. The computed relative path is empty.`
    );
  }

  let relativePath: string;

  if (target.mode === "global") {
    // Global: AGENTS.md → AGENTS.md (goes directly into global dir)
    relativePath = normalized;
  } else {
    // Project/custom: AGENTS.md → .opencode/AGENTS.md
    relativePath = `${target.projectDir}/${normalized}`;
  }

  const destination = resolve(target.root, relativePath);
  ensureWithinRoot(destination, target.root);
  return { path: destination };
}

async function readExistingFile(pathname: string) {
  try {
    return await readFile(pathname);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function renderDiffPreview(path: string, existing: Buffer, incoming: Buffer) {
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

function expandHome(value: string) {
  if (value.startsWith("~")) {
    const remainder = value.slice(1);
    if (!remainder) {
      return homedir();
    }
    if (remainder.startsWith("/") || remainder.startsWith("\\")) {
      return `${homedir()}${remainder}`;
    }
    return `${homedir()}/${remainder}`;
  }
  return value;
}
