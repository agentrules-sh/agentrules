import { API_ENDPOINTS } from "../constants";
import type { PresetBundle } from "../preset";
import type { ResolveResponse } from "../resolve";

/**
 * Fetches a bundle from an absolute URL.
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

// =============================================================================
// Unified Resolution
// =============================================================================

/**
 * Resolves a slug to get all versions and platform variants.
 *
 * @param baseUrl - Registry base URL
 * @param slug - Content slug (may contain slashes, e.g., "username/my-preset")
 * @param version - Optional version filter (server may ignore for static registries)
 * @returns Resolved data, or null if not found
 * @throws Error on network/server errors
 */
export async function resolveSlug(
  baseUrl: string,
  slug: string,
  version?: string
): Promise<ResolveResponse | null> {
  const url = new URL(API_ENDPOINTS.items.get(slug), baseUrl);
  if (version) {
    url.searchParams.set("version", version);
  }

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Failed to connect to registry: ${(error as Error).message}`
    );
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    let errorMessage = `Registry returned ${response.status} ${response.statusText}`;
    try {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
      ) {
        errorMessage = body.error;
      }
    } catch {
      // Ignore JSON parse errors, use default message
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as ResolveResponse;

  // Resolve relative bundle URLs to absolute URLs
  if (data.kind === "preset") {
    for (const ver of data.versions) {
      for (const variant of ver.variants) {
        if ("bundleUrl" in variant) {
          variant.bundleUrl = new URL(variant.bundleUrl, baseUrl).toString();
        }
      }
    }
  }

  return data;
}
