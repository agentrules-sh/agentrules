/**
 * Registry API - Rule Endpoints
 *
 * Create, update, and fetch rules from the registry.
 */

import { API_ENDPOINTS } from "@agentrules/core";
import { getErrorMessage } from "@/lib/errors";
import { log } from "@/lib/log";

export type RuleInput = {
  slug: string;
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
  publishedAt: string;
};

export type ErrorResponse = {
  error: string;
  issues?: Array<{ path: string; message: string }>;
};

export type CreateRuleResult =
  | { success: true; data: RuleResponse }
  | { success: false; error: string; issues?: ErrorResponse["issues"] };

export async function createRule(
  baseUrl: string,
  token: string,
  input: RuleInput
): Promise<CreateRuleResult> {
  const url = `${baseUrl}${API_ENDPOINTS.rule.base}`;

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

export type UpdateRuleResult =
  | { success: true; data: RuleResponse }
  | { success: false; error: string; issues?: ErrorResponse["issues"] };

export async function updateRule(
  baseUrl: string,
  token: string,
  slug: string,
  input: Partial<Omit<RuleInput, "slug" | "platform" | "type">>
): Promise<UpdateRuleResult> {
  const url = `${baseUrl}${API_ENDPOINTS.rule.get(slug)}`;

  log.debug(`PUT ${url}`);

  try {
    const response = await fetch(url, {
      method: "PUT",
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

export type GetRuleResult =
  | { success: true; data: RuleResponse }
  | { success: false; error: string };

export async function getRule(
  baseUrl: string,
  slug: string
): Promise<GetRuleResult> {
  const url = `${baseUrl}${API_ENDPOINTS.rule.get(slug)}`;

  log.debug(`GET ${url}`);

  try {
    const response = await fetch(url);

    log.debug(`Response status: ${response.status}`);

    if (!response.ok) {
      const errorData = (await response.json()) as ErrorResponse;
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
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
