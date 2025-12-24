import { getInstallPath, PLATFORM_IDS, PLATFORMS } from "./config";
import type { PlatformId } from "./types";
import { PLATFORM_ID_TUPLE } from "./types";

export function isSupportedPlatform(value: string): value is PlatformId {
  return (PLATFORM_ID_TUPLE as readonly string[]).includes(value);
}

export function normalizePlatformInput(value: string): PlatformId {
  const normalized = value.toLowerCase();
  if (isSupportedPlatform(normalized)) {
    return normalized;
  }
  throw new Error(
    `Unknown platform "${value}". Supported platforms: ${PLATFORM_IDS.join(", ")}.`
  );
}

/**
 * Check if a directory name matches a platform's platformDir.
 * Used to detect if a rule config is inside a platform directory (in-project mode).
 */
export function isPlatformDir(dirName: string): boolean {
  return PLATFORM_IDS.some((id) => PLATFORMS[id].platformDir === dirName);
}

/**
 * Get the platform ID from a directory name, if it matches a platform's platformDir.
 */
export function getPlatformFromDir(dirName: string): PlatformId | undefined {
  for (const id of PLATFORM_IDS) {
    if (PLATFORMS[id].platformDir === dirName) {
      return id;
    }
  }
  return;
}

function normalizePathForInference(value: string) {
  return value.replace(/\\/g, "/");
}

function getBasename(value: string) {
  const normalized = normalizePathForInference(value);
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}

/**
 * Infer the platform from a file path by searching for platformDir segments.
 *
 * Example: "/repo/.claude/commands/foo.md" -> "claude"
 */
export function inferPlatformFromPath(value: string): PlatformId | undefined {
  const normalized = normalizePathForInference(value);
  const segments = normalized.split("/").filter(Boolean);

  const matches = PLATFORM_IDS.filter((id) =>
    segments.includes(PLATFORMS[id].platformDir)
  );

  if (matches.length === 1) {
    return matches[0];
  }

  // Ambiguous (or none): force caller to be explicit.
  return;
}

/**
 * Return all platforms whose instruction file matches this basename.
 *
 * Example: "CLAUDE.md" -> ["claude"], "AGENTS.md" -> ["opencode", "cursor", "codex"]
 */
export function inferInstructionPlatformsFromFileName(
  fileName: string
): PlatformId[] {
  const matches: PlatformId[] = [];

  for (const id of PLATFORM_IDS) {
    const instructionPath = getInstallPath({
      platform: id,
      type: "instruction",
      scope: "project",
    });
    if (instructionPath === fileName) {
      matches.push(id);
    }
  }

  return matches;
}

function getProjectTypeDirMap(platform: PlatformId): Map<string, string> {
  const map = new Map<string, string>();

  for (const [type, cfg] of Object.entries(PLATFORMS[platform].types)) {
    const template = cfg.project;
    if (!template) continue;
    if (!template.startsWith("{platformDir}/")) continue;

    const rest = template.slice("{platformDir}/".length);
    const dir = rest.split("/")[0];
    if (!dir || dir.includes("{")) continue;

    map.set(dir, type);
  }

  return map;
}

/**
 * Infer a rule type from a file path for a known platform.
 * Uses PLATFORMS templates as source-of-truth.
 */
export function inferTypeFromPath(
  platform: PlatformId,
  filePath: string
): string | undefined {
  const base = getBasename(filePath);

  const instructionPath = getInstallPath({
    platform,
    type: "instruction",
    scope: "project",
  });
  if (instructionPath === base) {
    return "instruction";
  }

  const normalized = normalizePathForInference(filePath);
  const segments = normalized.split("/").filter(Boolean);
  const platformDirIndex = segments.lastIndexOf(
    PLATFORMS[platform].platformDir
  );
  if (platformDirIndex < 0) return;

  const nextDir = segments[platformDirIndex + 1];
  if (!nextDir) return;

  return getProjectTypeDirMap(platform).get(nextDir);
}

// --- Skill bundling utilities ---

export type GetInstallDirInput = {
  platform: PlatformId;
  type: string;
  name: string;
};

/**
 * Get the install directory for a type (parent directory of the install path).
 * For skills, this is the directory containing SKILL.md.
 */
export function getInstallDir({
  platform,
  type,
  name,
}: GetInstallDirInput): string | null {
  const installPath = getInstallPath({
    platform,
    type,
    name,
    scope: "project",
  });
  if (!installPath) return null;

  // Get parent directory of the install path
  const lastSlash = installPath.lastIndexOf("/");
  if (lastSlash === -1) return null;

  return installPath.slice(0, lastSlash);
}

export type BundleFile = {
  path: string;
  content: string | Uint8Array;
};

export type NormalizeSkillFilesInput = {
  files: BundleFile[];
  installDir: string;
};

/**
 * Normalize skill files by finding SKILL.md anchor and adjusting all paths.
 * Strips any existing path prefix to prevent duplication.
 */
export function normalizeSkillFiles({
  files,
  installDir,
}: NormalizeSkillFilesInput): BundleFile[] {
  // Find the SKILL.md marker
  const marker = files.find(
    (f) => f.path === "SKILL.md" || f.path.endsWith("/SKILL.md")
  );
  if (!marker) {
    throw new Error("SKILL.md not found in files");
  }

  // Get skill root (directory containing SKILL.md)
  const skillRoot =
    marker.path === "SKILL.md"
      ? "."
      : marker.path.slice(0, marker.path.lastIndexOf("/"));

  return files.map((f) => {
    // Strip skill root prefix
    let relative: string;
    if (skillRoot === ".") {
      relative = f.path;
    } else if (f.path.startsWith(skillRoot + "/")) {
      relative = f.path.slice(skillRoot.length + 1);
    } else {
      relative = f.path;
    }

    return {
      ...f,
      path: `${installDir}/${relative}`,
    };
  });
}
