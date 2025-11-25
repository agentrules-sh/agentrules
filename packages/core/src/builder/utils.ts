import type { BundledFile, PlatformId, PresetConfig } from "../types";
import { encodeUtf8, toPosixPath } from "../utils/encoding";

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
  if (!preset.version || typeof preset.version !== "string") {
    throw new Error(`Preset ${slug} is missing a version`);
  }
  if (!preset.description || typeof preset.description !== "string") {
    throw new Error(`Preset ${slug} is missing a description`);
  }
  if (!preset.platforms || typeof preset.platforms !== "object") {
    throw new Error(`Preset ${slug} is missing platforms map`);
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
