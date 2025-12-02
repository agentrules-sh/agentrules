/**
 * Application Context
 *
 * Centralizes loading of config, credentials, and user info to avoid
 * redundant file I/O across commands. Created once at startup and
 * passed to commands that need it.
 */

import { normalizeAlias } from "@/commands/registry/manage";
import { fetchSession } from "./api";
import { type Config, loadConfig } from "./config";
import {
  getCredentials,
  type RegistryCredentials,
  saveCredentials,
} from "./credentials";
import { log } from "./log";

/**
 * User information from credentials or API
 */
export type AppUser = {
  id: string;
  name: string;
  email: string;
};

/**
 * Active registry information
 */
export type AppRegistry = {
  alias: string;
  url: string;
  /** Base API URL (origin) for auth endpoints */
  apiUrl: string;
};

/**
 * Application context loaded at startup
 */
export type AppContext = {
  /** CLI configuration (registries, defaults) */
  config: Config;
  /** Active registry (resolved from alias or default) */
  registry: AppRegistry;
  /** Credentials for active registry (null if not logged in) */
  credentials: RegistryCredentials | null;
  /** User info (null if not logged in or not available) */
  user: AppUser | null;
  /** Whether user is logged in to active registry */
  isLoggedIn: boolean;
};

export type CreateAppContextOptions = {
  /** Explicit API URL (overrides registry resolution) */
  apiUrl?: string;
  /** Registry alias to use instead of default */
  registryAlias?: string;
};

/**
 * Creates the application context by loading config, credentials, and user info.
 * This should be called once at startup and the result passed to commands.
 */
export async function createAppContext(
  options: CreateAppContextOptions = {}
): Promise<AppContext> {
  const { apiUrl: explicitApiUrl, registryAlias } = options;

  // Load config once
  log.debug("Loading app context");
  const config = await loadConfig();

  // Resolve active registry: explicit URL > alias > default
  const registry = explicitApiUrl
    ? resolveExplicitUrl(explicitApiUrl)
    : resolveRegistry(config, registryAlias);
  log.debug(`Active registry: ${registry.alias} → ${registry.url}`);

  // Get credentials for active registry
  const credentials = await getCredentials(registry.apiUrl);
  const isLoggedIn = credentials !== null;

  // Get user info
  let user: AppUser | null = null;

  if (credentials) {
    // Try cached user info first
    if (credentials.userName && credentials.userEmail) {
      log.debug("Using cached user info");
      user = {
        id: credentials.userId ?? "",
        name: credentials.userName,
        email: credentials.userEmail,
      };
    } else {
      // Fetch from server if not cached (e.g., credentials file was corrupted)
      log.debug("Fetching user info from server");
      try {
        const session = await fetchSession(registry.apiUrl, credentials.token);
        if (session?.user) {
          user = {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
          };
          // Cache it so we don't fetch again
          await saveCredentials(registry.apiUrl, {
            ...credentials,
            userId: session.user.id,
            userName: session.user.name,
            userEmail: session.user.email,
          });
          log.debug("Saved fetched user info to credentials");
        }
      } catch (error) {
        log.debug(
          `Failed to fetch user info: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  log.debug(
    `App context loaded: isLoggedIn=${isLoggedIn}, user=${user?.name ?? "none"}`
  );

  return {
    config,
    registry,
    credentials,
    user,
    isLoggedIn,
  };
}

/**
 * Resolves registry from an explicit URL (bypasses config).
 */
function resolveExplicitUrl(url: string): AppRegistry {
  const parsed = new URL(url);
  const apiUrl = parsed.origin;

  return {
    alias: apiUrl, // Use URL as alias for explicit URLs
    url,
    apiUrl,
  };
}

/**
 * Resolves the active registry from config.
 * If alias is provided, uses that; otherwise uses the default.
 */
export function resolveRegistry(config: Config, alias?: string): AppRegistry {
  const targetAlias = alias ? normalizeAlias(alias) : config.defaultRegistry;
  const entry = config.registries[targetAlias];

  if (!entry) {
    throw new Error(`Registry "${targetAlias}" is not defined.`);
  }

  // Extract base URL (origin) for auth - registry URL may have path like /r/
  const apiUrl = new URL(entry.url).origin;

  return {
    alias: targetAlias,
    url: entry.url,
    apiUrl,
  };
}

// =============================================================================
// Global context singleton (for commands that need it)
// =============================================================================

let globalContext: AppContext | null = null;

/**
 * Gets the global app context, or null if not initialized.
 * Use this in commands to access cached config, registry, and auth state.
 */
export function useAppContext(): AppContext | null {
  return globalContext;
}

/**
 * Initializes the global app context. Call this once at startup.
 */
export async function initAppContext(
  options: CreateAppContextOptions = {}
): Promise<AppContext> {
  globalContext = await createAppContext(options);
  return globalContext;
}
