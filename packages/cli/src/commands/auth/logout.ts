/**
 * CLI Logout Command
 *
 * Clears stored credentials from the local machine.
 */

import { useAppContext } from "@/lib/context";
import { clearAllCredentials, clearCredentials } from "@/lib/credentials";
import { log } from "@/lib/log";

export type LogoutOptions = {
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
  const { all = false } = options;

  if (all) {
    log.debug("Clearing all stored credentials");
    await clearAllCredentials();
    return { success: true, hadCredentials: true };
  }

  const ctx = useAppContext();
  if (!ctx) {
    throw new Error("App context not initialized");
  }

  const { url: registryUrl } = ctx.registry;
  const hadCredentials = ctx.credentials !== null;

  if (hadCredentials) {
    log.debug(`Clearing credentials for ${registryUrl}`);
    await clearCredentials(registryUrl);
  } else {
    log.debug(`No credentials found for ${registryUrl}`);
  }

  return { success: true, hadCredentials };
}
