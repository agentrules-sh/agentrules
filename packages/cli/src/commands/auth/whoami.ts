/**
 * CLI Whoami Command
 *
 * Displays information about the currently authenticated user.
 */

import { fetchSession } from "../../lib/api";
import { getCredentials } from "../../lib/auth";
import { getActiveRegistryUrl } from "../registry/manage";

export type WhoamiOptions = {
  /** Registry URL to check (default: active registry) */
  apiUrl?: string;
  /** Registry alias to use instead of URL */
  registry?: string;
  /** Callback for status messages */
  onStatus?: (message: string) => void;
  /** Callback for error messages */
  onError?: (message: string) => void;
};

export type WhoamiResult = {
  /** Whether check was successful */
  success: boolean;
  /** Whether user is logged in */
  loggedIn: boolean;
  /** User info if logged in */
  user?: {
    id: string;
    name: string;
    email: string;
  };
  /** API URL of the registry */
  apiUrl?: string;
  /** Token expiration date */
  expiresAt?: string;
  /** Error message if something went wrong */
  error?: string;
};

/**
 * Returns information about the currently authenticated user
 */
export async function whoami(
  options: WhoamiOptions = {}
): Promise<WhoamiResult> {
  const { apiUrl: explicitUrl, registry, onStatus, onError } = options;

  // Resolve registry URL: explicit URL > registry alias > active registry
  const registryUrl = explicitUrl ?? (await getActiveRegistryUrl(registry)).url;
  // Extract base URL (origin) for auth - registry URL may have path like /r/
  const apiUrl = new URL(registryUrl).origin;

  try {
    const credentials = await getCredentials(apiUrl);

    if (!credentials) {
      return {
        success: true,
        loggedIn: false,
        apiUrl,
      };
    }

    // If we have cached user info, return it
    if (credentials.userName && credentials.userEmail) {
      return {
        success: true,
        loggedIn: true,
        user: {
          id: credentials.userId ?? "",
          name: credentials.userName,
          email: credentials.userEmail,
        },
        apiUrl,
        expiresAt: credentials.expiresAt,
      };
    }

    // Otherwise, fetch user info from the server
    onStatus?.("Fetching user info...");

    const session = await fetchSession(apiUrl, credentials.token);

    if (session?.user) {
      return {
        success: true,
        loggedIn: true,
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
        },
        apiUrl,
        expiresAt: credentials.expiresAt,
      };
    }

    // Token might be invalid or registry doesn't support user info endpoint
    return {
      success: true,
      loggedIn: true,
      apiUrl,
      expiresAt: credentials.expiresAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onError?.(message);
    return {
      success: false,
      loggedIn: false,
      error: message,
    };
  }
}
