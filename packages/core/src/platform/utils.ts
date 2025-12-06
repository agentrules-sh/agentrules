import { PLATFORM_IDS, PLATFORMS } from "./config";
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
 * Check if a directory name matches a platform's projectDir.
 * Used to detect if a preset config is inside a platform directory (in-project mode).
 */
export function isPlatformDir(dirName: string): boolean {
  return PLATFORM_IDS.some((id) => PLATFORMS[id].projectDir === dirName);
}

/**
 * Get the platform ID from a directory name, if it matches a platform's projectDir.
 */
export function getPlatformFromDir(dirName: string): PlatformId | undefined {
  for (const id of PLATFORM_IDS) {
    if (PLATFORMS[id].projectDir === dirName) {
      return id;
    }
  }
  return;
}
