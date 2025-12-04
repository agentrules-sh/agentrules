import { PLATFORM_IDS } from "./config";
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
