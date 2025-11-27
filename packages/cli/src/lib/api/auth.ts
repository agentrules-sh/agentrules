/**
 * Registry API - Authentication Endpoints
 *
 * Session and user info endpoints that registries must implement
 * to support CLI user display features.
 */

// =============================================================================
// Endpoints
// =============================================================================

export const AUTH_ENDPOINTS = {
  /** Get current session and user info. */
  GET_SESSION: "/api/auth/get-session",
} as const;

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

/** Response from GET /api/auth/get-session. */
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
  const url = `${baseUrl}${AUTH_ENDPOINTS.GET_SESSION}`;

  try {
    if (process.env.DEBUG) {
      console.log("[DEBUG] GET", url);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const text = await response.text();

    if (process.env.DEBUG) {
      console.log("[DEBUG] Response:", response.status, text.slice(0, 200));
    }

    if (response.ok && text) {
      return JSON.parse(text) as GetSessionResponse;
    }

    return null;
  } catch (err) {
    if (process.env.DEBUG) {
      console.log("[DEBUG] fetchSession error:", err);
    }
    return null;
  }
}
