/**
 * CLI Whoami Command
 *
 * Displays information about the currently authenticated user.
 */

import { useAppContext } from "@/lib/context";

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
export async function whoami(): Promise<WhoamiResult> {
  const ctx = useAppContext();
  if (!ctx) {
    throw new Error("App context not initialized");
  }

  const { apiUrl } = ctx.registry;

  return {
    success: true,
    loggedIn: ctx.isLoggedIn,
    user: ctx.user ?? undefined,
    apiUrl,
    expiresAt: ctx.credentials?.expiresAt,
  };
}
