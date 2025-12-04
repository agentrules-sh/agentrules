import { API_ENDPOINTS } from "../constants";
import type { PlatformId, RegistryBundle, RegistryEntry } from "../types";

/**
 * Resolved preset with absolute bundle URL
 */
export type ResolvedPreset = {
  entry: RegistryEntry;
  bundleUrl: string;
};

/**
 * Resolves a preset from the registry via API endpoint.
 * Returns the entry metadata and the absolute bundle URL.
 */
export async function resolvePreset(
  baseUrl: string,
  slug: string,
  platform: PlatformId
): Promise<ResolvedPreset> {
  const apiUrl = new URL(API_ENDPOINTS.presets.entry(slug, platform), baseUrl);

  const response = await fetch(apiUrl);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Preset "${slug}" for platform "${platform}" was not found in the registry.`
      );
    }
    throw new Error(
      `Failed to resolve preset (${response.status} ${response.statusText}).`
    );
  }

  try {
    const entry = (await response.json()) as ResolvedPreset["entry"];
    // Resolve bundleUrl against registry base (handles both relative and absolute URLs)
    const resolvedBundleUrl = new URL(entry.bundleUrl, baseUrl).toString();
    return {
      entry,
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
export async function fetchBundle(bundleUrl: string): Promise<RegistryBundle> {
  const response = await fetch(bundleUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download bundle (${response.status} ${response.statusText}).`
    );
  }

  try {
    return (await response.json()) as RegistryBundle;
  } catch (error) {
    throw new Error(`Unable to parse bundle JSON: ${(error as Error).message}`);
  }
}
