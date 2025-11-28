/**
 * CLI Logout Command
 *
 * Clears stored credentials from the local machine.
 */

import { clearAllCredentials, clearCredentials } from "@/lib/auth";
import { useAppContext } from "@/lib/context";
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

  const { apiUrl } = ctx.registry;
  const hadCredentials = ctx.credentials !== null;

  if (hadCredentials) {
    log.debug(`Clearing credentials for ${apiUrl}`);
    await clearCredentials(apiUrl);
  } else {
    log.debug(`No credentials found for ${apiUrl}`);
  }

  return { success: true, hadCredentials };
}
