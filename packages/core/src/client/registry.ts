import { API_ENDPOINTS, LATEST_VERSION } from "../constants";
import type { PlatformId, Preset, PresetBundle } from "../types";

/**
 * Resolved preset with absolute bundle URL
 */
export type ResolvedPreset = {
  preset: Preset;
  bundleUrl: string;
};

/**
 * Resolves a preset from the registry via API endpoint.
 * Returns the entry metadata and the absolute bundle URL.
 *
 * @param baseUrl - Registry base URL
 * @param slug - Preset slug
 * @param platform - Target platform
 * @param version - Version to resolve (defaults to "latest")
 */
export async function resolvePreset(
  baseUrl: string,
  slug: string,
  platform: PlatformId,
  version: string = LATEST_VERSION
): Promise<ResolvedPreset> {
  const apiUrl = new URL(
    API_ENDPOINTS.presets.get(slug, platform, version),
    baseUrl
  );

  const response = await fetch(apiUrl);

  if (!response.ok) {
    if (response.status === 404) {
      const versionInfo =
        version === LATEST_VERSION ? "" : ` version "${version}"`;
      throw new Error(
        `Preset "${slug}"${versionInfo} for platform "${platform}" was not found in the registry.`
      );
    }
    throw new Error(
      `Failed to resolve preset (${response.status} ${response.statusText}).`
    );
  }

  try {
    const preset = (await response.json()) as ResolvedPreset["preset"];
    // Resolve bundleUrl against registry base (handles both relative and absolute URLs)
    const resolvedBundleUrl = new URL(preset.bundleUrl, baseUrl).toString();
    return {
      preset,
      bundleUrl: resolvedBundleUrl,
    };
  } catch (error) {
    throw new Error(
      `Unable to parse preset response: ${(error as Error).message}`
    );
  }
}

/**
 * Fetches a bundle from an absolute URL or resolves it relative to the registry.
 */
export async function fetchBundle(bundleUrl: string): Promise<PresetBundle> {
  const response = await fetch(bundleUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download bundle (${response.status} ${response.statusText}).`
    );
  }

  try {
    return (await response.json()) as PresetBundle;
  } catch (error) {
    throw new Error(`Unable to parse bundle JSON: ${(error as Error).message}`);
  }
}
