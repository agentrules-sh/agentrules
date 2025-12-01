import type { BundledFile, PlatformId, PresetConfig } from "../types";
import { PLATFORM_IDS } from "../types/platform";
import { encodeUtf8, toPosixPath } from "../utils/encoding";

/**
 * Generates a date-based version string in format YYYY.MM.DD
 * Uses UTC to ensure consistent versioning across timezones
 */
export function generateDateVersion(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export function normalizeBundlePublicBase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("--bundle-base must be a non-empty string");
  }
  if (isAbsoluteUrl(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  let normalized = trimmed;
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  normalized = normalized.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

export function isAbsoluteUrl(value: string) {
  return /^[a-zA-Z][a-zA-Z\d+-.]*:/.test(value);
}

export function cleanInstallMessage(value: unknown) {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function encodeItemName(slug: string, platform: PlatformId) {
  return `${slug}.${platform}`;
}

export function validatePresetConfig(
  config: unknown,
  slug: string
): PresetConfig {
  if (!config || typeof config !== "object") {
    throw new Error(`Invalid preset config for ${slug}`);
  }

  const preset = config as Partial<PresetConfig>;
  if (!preset.name || typeof preset.name !== "string") {
    throw new Error(`Preset ${slug} is missing a name`);
  }
  if (!preset.title || typeof preset.title !== "string") {
    throw new Error(`Preset ${slug} is missing a title`);
  }
  // Version is optional - will be auto-generated at build time if not provided
  if (preset.version !== undefined && typeof preset.version !== "string") {
    throw new Error(
      `Preset ${slug} has invalid version (must be string or omitted)`
    );
  }
  if (!preset.description || typeof preset.description !== "string") {
    throw new Error(`Preset ${slug} is missing a description`);
  }
  if (!preset.license || typeof preset.license !== "string") {
    throw new Error(
      `Preset ${slug} is missing a license (SPDX identifier required)`
    );
  }
  if (!preset.platform || typeof preset.platform !== "string") {
    throw new Error(`Preset ${slug} is missing a platform`);
  }

  // Validate that the platform is supported
  if (!PLATFORM_IDS.includes(preset.platform as PlatformId)) {
    throw new Error(
      `Preset ${slug} has unknown platform: ${preset.platform}. ` +
        `Supported platforms: ${PLATFORM_IDS.join(", ")}`
    );
  }

  return preset as PresetConfig;
}

export function collectBundledFiles(
  files: Record<string, string>
): BundledFile[] {
  return Object.entries(files)
    .map(([path, contents]) => {
      const normalizedPath = toPosixPath(path);
      const payload = encodeUtf8(contents);
      return {
        path: normalizedPath,
        size: payload.length,
        checksum: "",
        contents,
      } satisfies BundledFile;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}
