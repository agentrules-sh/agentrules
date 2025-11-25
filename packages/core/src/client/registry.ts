import {
  isSupportedPlatform,
  type PlatformId,
  type RegistryBundle,
  type RegistryEntry,
  type RegistryIndex,
} from "../types";

export type FetchRegistryBundleResult = {
  bundle: RegistryBundle;
  etag: string | null;
};

export async function fetchRegistryIndex(
  baseUrl: string
): Promise<RegistryIndex> {
  const indexUrl = new URL("registry.index.json", baseUrl);
  const response = await fetch(indexUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to load registry index (${response.status} ${response.statusText}).`
    );
  }

  try {
    return (await response.json()) as RegistryIndex;
  } catch (error) {
    throw new Error(
      `Unable to parse registry index JSON: ${(error as Error).message}`
    );
  }
}

export async function fetchRegistryBundle(
  baseUrl: string,
  bundlePath: string
): Promise<FetchRegistryBundleResult> {
  const bundleUrl = new URL(bundlePath, baseUrl);
  const response = await fetch(bundleUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download bundle (${response.status} ${response.statusText}).`
    );
  }

  try {
    const bundle = (await response.json()) as RegistryBundle;
    return { bundle, etag: response.headers.get("etag") };
  } catch (error) {
    throw new Error(`Unable to parse bundle JSON: ${(error as Error).message}`);
  }
}

export function resolveRegistryEntry(
  index: RegistryIndex,
  input: string,
  explicitPlatform?: PlatformId
): RegistryEntry {
  const map = new Map<string, RegistryEntry>();
  for (const [key, value] of Object.entries(index)) {
    map.set(key.toLowerCase(), value);
  }

  const normalizedInput = input.toLowerCase();
  const direct = map.get(normalizedInput);
  if (direct) {
    return direct;
  }

  let slugHint = normalizedInput;
  let platform = explicitPlatform;
  if (!platform) {
    const parts = normalizedInput.split(".");
    const maybePlatform = parts.at(-1);
    if (maybePlatform && isSupportedPlatform(maybePlatform)) {
      platform = maybePlatform;
      slugHint = parts.slice(0, -1).join(".");
    }
  }

  const matches = Object.values(index).filter(
    (entry) => entry.slug.toLowerCase() === slugHint
  );

  if (platform) {
    const match = matches.find((entry) => entry.platform === platform);
    if (match) {
      return match;
    }
    throw new Error(
      `Preset "${input}" is not available for platform "${platform}".`
    );
  }

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    const platforms = matches.map((entry) => entry.platform).join(", ");
    throw new Error(
      `Preset "${input}" is available for multiple platforms (${platforms}). Use --platform to pick one or specify <slug>.<platform>.`
    );
  }

  throw new Error(`Preset "${input}" was not found in the active registry.`);
}
