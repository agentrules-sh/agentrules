/**
 * Registry API - Authentication Endpoints
 *
 * Session and user info endpoints that registries must implement
 * to support CLI user display features.
 */

import { API_ENDPOINTS } from "@agentrules/core";
import { log } from "@/lib/log";
import { buildUrl } from "@/lib/url";

// =============================================================================
// Types
// =============================================================================

/** User information returned by the registry. */
export type RegistryUser = {
  id: string;
  name: string;
  email: string;
  image?: string;
  createdAt?: string;
};

/** Session information returned by the registry. */
export type RegistrySession = {
  id: string;
  expiresAt: string;
};

/** Response from GET {API_ENDPOINTS.auth.session}. */
export type GetSessionResponse = {
  user: RegistryUser;
  session: RegistrySession;
} | null;

// =============================================================================
// Client
// =============================================================================

/**
 * Fetches session information from the registry.
 *
 * If the registry doesn't implement this endpoint, returns null
 * and the CLI continues without user display info.
 */
export async function fetchSession(
  baseUrl: string,
  token: string
): Promise<GetSessionResponse> {
  const url = buildUrl(baseUrl, API_ENDPOINTS.auth.session);

  try {
    log.debug(`GET ${url}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const text = await response.text();
    log.debug(`Response: ${response.status} ${text.slice(0, 200)}`);

    if (response.ok && text) {
      return JSON.parse(text) as GetSessionResponse;
    }

    return null;
  } catch (err) {
    log.debug(`fetchSession error: ${err}`);
    return null;
  }
}
