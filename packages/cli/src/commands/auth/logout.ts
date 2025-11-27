/**
 * CLI Logout Command
 *
 * Clears stored credentials from the local machine.
 */

import { getActiveRegistryUrl } from "@/commands/registry/manage";
import {
  clearAllCredentials,
  clearCredentials,
  getCredentials,
} from "@/lib/auth";
import { log } from "@/lib/log";

export type LogoutOptions = {
  /** Registry URL to logout from (default: active registry) */
  apiUrl?: string;
  /** Registry alias to use instead of URL */
  registry?: string;
  /** Clear credentials for all registries */
  all?: boolean;
};

export type LogoutResult = {
  /** Whether logout was successful */
  success: boolean;
  /** Whether credentials were actually cleared (false if none existed) */
  hadCredentials: boolean;
};

/**
 * Logs out by clearing stored credentials
 */
export async function logout(
  options: LogoutOptions = {}
): Promise<LogoutResult> {
  const { apiUrl: explicitUrl, registry, all = false } = options;

  // Resolve registry URL: explicit URL > registry alias > active registry
  const registryUrl = explicitUrl ?? (await getActiveRegistryUrl(registry)).url;
  // Extract base URL (origin) for auth - registry URL may have path like /r/
  const apiUrl = new URL(registryUrl).origin;

  if (all) {
    log.debug("Clearing all stored credentials");
    await clearAllCredentials();
    return { success: true, hadCredentials: true };
  }

  // Check if we have credentials for this registry
  const existing = await getCredentials(apiUrl);
  const hadCredentials = existing !== null;

  if (hadCredentials) {
    log.debug(`Clearing credentials for ${apiUrl}`);
    await clearCredentials(apiUrl);
  } else {
    log.debug(`No credentials found for ${apiUrl}`);
  }

  return {
    success: true,
    hadCredentials,
  };
}
