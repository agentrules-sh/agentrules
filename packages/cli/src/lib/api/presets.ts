/**
 * Registry API - Preset Endpoints
 *
 * Publish and unpublish endpoints for managing presets in the registry.
 */

import { API_ENDPOINTS, type PresetPublishInput } from "@agentrules/core";
import { getErrorMessage } from "@/lib/errors";
import { log } from "@/lib/log";

// =============================================================================
// Types
// =============================================================================

/** Response from POST {API_ENDPOINTS.presets.base} (publish). */
export type PublishResponse = {
  presetId: string;
  versionId: string;
  slug: string;
  platform: string;
  title: string;
  version: string;
  isNewPreset: boolean;
  bundleUrl: string;
};

/** Response from DELETE {API_ENDPOINTS.presets.unpublish()} (unpublish). */
export type UnpublishResponse = {
  slug: string;
  platform: string;
  version: string;
};

/** Error response from the API. */
export type ErrorResponse = {
  error: string;
  issues?: Array<{ path: string; message: string }>;
};

// =============================================================================
// Client
// =============================================================================

export type PublishResult =
  | { success: true; data: PublishResponse }
  | { success: false; error: string; issues?: ErrorResponse["issues"] };

/**
 * Publishes a preset to the registry.
 * Sends PresetPublishInput (no version) - registry assigns version.
 */
export async function publishPreset(
  baseUrl: string,
  token: string,
  input: PresetPublishInput
): Promise<PublishResult> {
  const url = `${baseUrl}${API_ENDPOINTS.presets.base}`;

  log.debug(`POST ${url}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });

    log.debug(`Response status: ${response.status}`);

    if (!response.ok) {
      const errorData = (await response.json()) as ErrorResponse;
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
        issues: errorData.issues,
      };
    }

    const data = (await response.json()) as PublishResponse;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Failed to connect to registry: ${getErrorMessage(error)}`,
    };
  }
}

export type UnpublishResult =
  | { success: true; data: UnpublishResponse }
  | { success: false; error: string };

/**
 * Unpublishes a preset version from the registry.
 */
export async function unpublishPreset(
  baseUrl: string,
  token: string,
  slug: string,
  platform: string,
  version: string
): Promise<UnpublishResult> {
  const url = `${baseUrl}${API_ENDPOINTS.presets.unpublish(slug, platform, version)}`;

  log.debug(`DELETE ${url}`);

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    log.debug(`Response status: ${response.status}`);

    if (!response.ok) {
      const errorData = (await response.json()) as ErrorResponse;
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as UnpublishResponse;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Failed to connect to registry: ${getErrorMessage(error)}`,
    };
  }
}
