/**
 * Registry API - Rule Endpoints
 *
 * Publish and delete rules from the registry.
 */

import { API_ENDPOINTS } from "@agentrules/core";
import { getErrorMessage } from "@/lib/errors";
import { log } from "@/lib/log";

export type RuleInput = {
  name: string;
  platform: string;
  type: string;
  title: string;
  description?: string;
  content: string;
  tags: string[];
};

export type RuleResponse = {
  id: string;
  slug: string;
  platform: string;
  type: string;
  title: string;
  description: string | null;
  content: string;
  tags: string[];
  authorId: string;
  /** Whether this was a new rule (true) or an update (false) */
  isNew: boolean;
  /** URL to the rule page on the registry */
  url: string;
};

export type ErrorResponse = {
  error: string;
  issues?: Array<{ path: string; message: string }>;
};

export type PublishRuleResult =
  | { success: true; data: RuleResponse }
  | { success: false; error: string; issues?: ErrorResponse["issues"] };

/**
 * Publish a rule (create or update).
 * The registry handles create vs update automatically.
 */
export async function publishRule(
  baseUrl: string,
  token: string,
  input: RuleInput
): Promise<PublishRuleResult> {
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

    const data = (await response.json()) as RuleResponse;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Failed to connect to registry: ${getErrorMessage(error)}`,
    };
  }
}

export type DeleteRuleResponse = {
  slug: string;
};

export type DeleteRuleResult =
  | { success: true; data: DeleteRuleResponse }
  | { success: false; error: string };

export async function deleteRule(
  baseUrl: string,
  token: string,
  slug: string
): Promise<DeleteRuleResult> {
  const url = `${baseUrl}${API_ENDPOINTS.rules.bySlug(slug)}`;

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

    const data = (await response.json()) as DeleteRuleResponse;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Failed to connect to registry: ${getErrorMessage(error)}`,
    };
  }
}
