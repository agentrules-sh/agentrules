/**
 * Registry API - Rule Publishing
 *
 * Publish and unpublish multi-file rules to the registry.
 */

import { API_ENDPOINTS, type RulePublishInput } from "@agentrules/core";
import { getErrorMessage } from "@/lib/errors";
import { log } from "@/lib/log";

// =============================================================================
// Types
// =============================================================================

/** Response from POST {API_ENDPOINTS.rules.base} (publish). */
export type PublishResponse = {
  ruleId: string;
  versionId: string;
  slug: string;
  title: string;
  version: string;
  isNew: boolean;
  /** All published platform variants */
  variants: Array<{ platform: string; bundleUrl: string }>;
  /** URL to the rule page on the registry */
  url: string;
};

/** Response from DELETE {API_ENDPOINTS.rules.unpublish()} (unpublish). */
export type UnpublishResponse = {
  slug: string;
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
 * Publishes a rule to the registry.
 * Sends RulePublishInput (no version) - registry assigns version.
 */
export async function publishRule(
  baseUrl: string,
  token: string,
  input: RulePublishInput
): Promise<PublishResult> {
  const url = `${baseUrl}${API_ENDPOINTS.rules.base}`;

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
 * Unpublishes a rule version from the registry.
 * This unpublishes all platform variants for the specified version.
 */
export async function unpublishRule(
  baseUrl: string,
  token: string,
  slug: string,
  version: string
): Promise<UnpublishResult> {
  const url = `${baseUrl}${API_ENDPOINTS.rules.unpublish(slug, version)}`;

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
