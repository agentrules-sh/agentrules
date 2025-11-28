import type {
  PlatformId,
  RegistryBundle,
  RegistryEntry,
} from "@agentrules/core";
import {
  CONFIG_DIR_NAME,
  createDiffPreview,
  decodeBundledFile,
  fetchRegistryBundle,
  fetchRegistryIndex,
  isLikelyText,
  normalizeBundlePath,
  PLATFORMS,
  resolveRegistryEntry,
  toUtf8String,
  verifyBundledFileChecksum,
} from "@agentrules/core";
import chalk from "chalk";
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, relative, resolve, sep } from "path";
import { type Config as AgentrulesConfig, saveConfig } from "@/lib/config";
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
  global?: boolean;
  directory?: string;
  force?: boolean;
  dryRun?: boolean;
  skipConflicts?: boolean;
};

export type FileResult = {
  path: string;
  status: FileWriteStatus;
};

export type AddPresetResult = {
  entry: RegistryEntry;
  bundle: RegistryBundle;
  files: FileResult[];
  conflicts: ConflictDetail[];
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

type WriteBundleStats = {
  files: FileResult[];
  conflicts: ConflictDetail[];
};

export { normalizePlatformInput } from "@agentrules/core";

export async function addPreset(
  options: AddPresetOptions
): Promise<AddPresetResult> {
  const ctx = useAppContext();
  if (!ctx) {
    throw new Error("App context not initialized");
  }

  const { alias: registryAlias, url: registryUrl } = ctx.registry;
  const { config } = ctx;
  const dryRun = Boolean(options.dryRun);

  log.debug(`Fetching registry index from ${registryUrl}`);
  const registryIndex = await fetchRegistryIndex(registryUrl);

  const entry = resolveRegistryEntry(
    registryIndex,
    options.preset,
    options.platform
  );

  log.debug(`Downloading bundle: ${entry.bundlePath}`);
  const { bundle } = await fetchRegistryBundle(registryUrl, entry.bundlePath);

  if (bundle.slug !== entry.slug || bundle.platform !== entry.platform) {
    throw new Error(
      `Registry bundle metadata mismatch for "${entry.name}". Expected slug "${entry.slug}" (${entry.platform}).`
    );
  }

  const target = resolveInstallTarget(bundle.platform, options);

  log.debug(`Writing ${bundle.files.length} files to ${target.root}`);
  const writeStats = await writeBundleFiles(bundle, target, {
    force: Boolean(options.force),
    skipConflicts: Boolean(options.skipConflicts),
    dryRun,
  });

  if (!dryRun) {
    await updateRegistryMetadata(config, registryAlias);
  }

  return {
    entry,
    bundle,
    files: writeStats.files,
    conflicts: writeStats.conflicts,
    targetRoot: target.root,
    targetLabel: target.label,
    registryAlias,
    dryRun,
  };
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
  bundle: RegistryBundle,
  target: InstallTarget,
  behavior: { force: boolean; skipConflicts: boolean; dryRun: boolean }
): Promise<WriteBundleStats> {
  const files: FileResult[] = [];
  const conflicts: ConflictDetail[] = [];

  if (!behavior.dryRun) {
    await mkdir(target.root, { recursive: true });
  }

  for (const file of bundle.files) {
    const decoded = decodeBundledFile(file);
    const data = Buffer.from(decoded);
    await verifyBundledFileChecksum(file, data);

    const destResult = computeDestinationPath(file.path, target);

    // Skip root files for global installs
    if (destResult.skipped) {
      files.push({ path: file.path, status: "skipped" });
      log.debug(`Skipped (root file): ${file.path}`);
      continue;
    }

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

  return { files, conflicts };
}

type DestinationResult =
  | { skipped: false; path: string }
  | { skipped: true; path: null };

function computeDestinationPath(
  pathInput: string,
  target: InstallTarget
): DestinationResult {
  const normalized = normalizeBundlePath(pathInput);
  const configPrefix = `${CONFIG_DIR_NAME}/`;
  const isConfigFile = normalized.startsWith(configPrefix);

  // For global installs, skip root files (files not under config/)
  if (target.mode === "global" && !isConfigFile) {
    return { skipped: true, path: null };
  }

  let relativePath: string;

  if (isConfigFile) {
    // Map config/foo → .{platform}/foo (project/custom) or foo (global)
    const withoutConfigPrefix = normalized.slice(configPrefix.length);

    if (target.mode === "global") {
      // Global: config/agent.md → agent.md
      relativePath = withoutConfigPrefix;
    } else {
      // Project/custom: config/agent.md → {projectDir}/agent.md
      // Uses configured project dir (e.g., .opencode) or platform default
      relativePath = `${target.projectDir}/${withoutConfigPrefix}`;
    }
  } else {
    // Root file: install as-is (only for project/custom mode)
    relativePath = normalized;
  }

  if (!relativePath) {
    throw new Error(
      `Unable to derive destination for ${pathInput}. The computed relative path is empty.`
    );
  }

  const destination = resolve(target.root, relativePath);
  ensureWithinRoot(destination, target.root);
  return { skipped: false, path: destination };
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

async function updateRegistryMetadata(config: AgentrulesConfig, alias: string) {
  const registrySettings = config.registries[alias];
  if (!registrySettings) {
    return;
  }

  registrySettings.lastSyncedAt = new Date().toISOString();
  await saveConfig(config);
}
