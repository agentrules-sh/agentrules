import type { PlatformId, PresetConfig } from "../types";
import { PLATFORM_IDS } from "../types/platform";

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
  // Version is optional major version (integer). Registry assigns minor.
  if (preset.version !== undefined && typeof preset.version !== "number") {
    throw new Error(
      `Preset ${slug} has invalid version (must be a positive integer or omitted)`
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
