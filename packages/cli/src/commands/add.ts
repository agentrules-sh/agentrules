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
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, relative, resolve, sep } from "path";
import { colorizeDiffLine } from "../lib/color";
import {
  type Config as AgentrulesConfig,
  loadConfig,
  saveConfig,
} from "../lib/config";
import { getActiveRegistryUrl } from "./registry/manage";

export type AddPresetOptions = {
  preset: string;
  platform?: PlatformId;
  registryAlias?: string;
  global?: boolean;
  directory?: string;
  force?: boolean;
  dryRun?: boolean;
  skipConflicts?: boolean;
};

export type AddPresetResult = {
  entry: RegistryEntry;
  bundle: RegistryBundle;
  filesWritten: number;
  filesOverwritten: number;
  filesSkipped: number;
  conflicts: ConflictDetail[];
  skippedConflicts: number;
  skippedRootFiles: string[];
  targetRoot: string;
  targetLabel: string;
  registryAlias: string;
  dryRun: boolean;
  skipConflicts: boolean;
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
  created: number;
  skipped: number;
  overwritten: number;
  conflicts: ConflictDetail[];
  skippedDueToConflict: number;
  skippedRootFiles: string[];
};

export { normalizePlatformInput } from "@agentrules/core";

export async function addPreset(
  options: AddPresetOptions
): Promise<AddPresetResult> {
  const { alias: registryAlias, url: registryUrl } = await getActiveRegistryUrl(
    options.registryAlias
  );

  const config = await loadConfig();
  const registryIndex = await fetchRegistryIndex(registryUrl);
  const entry = resolveRegistryEntry(
    registryIndex,
    options.preset,
    options.platform
  );
  const { bundle } = await fetchRegistryBundle(registryUrl, entry.bundlePath);

  if (bundle.slug !== entry.slug || bundle.platform !== entry.platform) {
    throw new Error(
      `Registry bundle metadata mismatch for "${entry.name}". Expected slug "${entry.slug}" (${entry.platform}).`
    );
  }

  const target = resolveInstallTarget(bundle.platform, options);

  const installBehavior = {
    force: Boolean(options.force),
    skipConflicts: Boolean(options.skipConflicts),
    dryRun: Boolean(options.dryRun),
  };

  const writeStats = await writeBundleFiles(bundle, target, installBehavior);

  if (!installBehavior.dryRun) {
    await updateRegistryMetadata(config, registryAlias);
  }

  return {
    entry,
    bundle,
    filesWritten: writeStats.created + writeStats.overwritten,
    filesOverwritten: writeStats.overwritten,
    filesSkipped: writeStats.skipped,
    conflicts: writeStats.conflicts,
    skippedConflicts: writeStats.skippedDueToConflict,
    skippedRootFiles: writeStats.skippedRootFiles,
    targetRoot: target.root,
    targetLabel: target.label,
    registryAlias,
    dryRun: installBehavior.dryRun,
    skipConflicts: installBehavior.skipConflicts,
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
  const stats: WriteBundleStats = {
    created: 0,
    skipped: 0,
    overwritten: 0,
    conflicts: [],
    skippedDueToConflict: 0,
    skippedRootFiles: [],
  };

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
      stats.skippedRootFiles.push(file.path);
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
      stats.created += 1;
      continue;
    }

    if (existing.equals(data)) {
      stats.skipped += 1;
      continue;
    }

    if (behavior.force) {
      if (!behavior.dryRun) {
        await writeFile(destination, data);
      }
      stats.overwritten += 1;
      continue;
    }

    const conflictDetail: ConflictDetail = {
      path: relativePath,
      diff: renderDiffPreview(relativePath, existing, data),
    };
    stats.conflicts.push(conflictDetail);

    if (behavior.skipConflicts || behavior.dryRun) {
      stats.skippedDueToConflict += 1;
    }
  }

  if (
    stats.conflicts.length > 0 &&
    !behavior.skipConflicts &&
    !behavior.dryRun
  ) {
    const preview = formatConflictPreview(stats.conflicts.slice(0, 3));
    const extra = stats.conflicts.length - 3;
    const suffix = extra > 0 ? `\n  • ...and ${extra} more` : "";
    const instructions = `Found ${stats.conflicts.length} conflicting files. Re-run with --force to overwrite them.`;
    throw new Error(
      `${instructions}\n\n${preview}${suffix}\n\n${instructions}`
    );
  }

  return stats;
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

function formatConflictPreview(conflicts: ConflictDetail[]) {
  return conflicts
    .map((conflict) => {
      const snippet = conflict.diff
        ? `\n${conflict.diff
            .split("\n")
            .map((line) => `    ${line}`)
            .join("\n")}`
        : "";
      return `  • ${conflict.path}${snippet}`;
    })
    .join("\n\n");
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

  return preview.split("\n").map(colorizeDiffLine).join("\n");
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
