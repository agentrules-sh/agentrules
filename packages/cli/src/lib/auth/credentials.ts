/**
 * Credential storage for CLI authentication
 *
 * Stores session tokens per registry URL for authenticated CLI operations.
 * Credentials are stored in ~/.agentrules/credentials.json with 0600 permissions.
 */

import { chmod } from "fs";
import {
  access,
  constants as fsConstants,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "fs/promises";
import { dirname, join } from "path";
import { promisify } from "util";
import { getConfigDir } from "@/lib/config";
import { log } from "@/lib/log";

const chmodAsync = promisify(chmod);
const CREDENTIALS_FILENAME = "credentials.json";

/**
 * Credentials for a single registry
 */
export type RegistryCredentials = {
  token: string;
  expiresAt?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
};

/**
 * All stored credentials, keyed by registry URL
 */
export type CredentialsStore = Record<string, RegistryCredentials>;

/**
 * Gets the path to the credentials file
 */
export function getCredentialsPath(): string {
  return join(getConfigDir(), CREDENTIALS_FILENAME);
}

/**
 * Normalizes a registry URL for use as a key
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "").toLowerCase();
}

/**
 * Loads the entire credentials store
 */
async function loadStore(): Promise<CredentialsStore> {
  const credentialsPath = getCredentialsPath();

  try {
    await access(credentialsPath, fsConstants.F_OK);
  } catch {
    log.debug(`Credentials file not found at ${credentialsPath}`);
    return {};
  }

  try {
    const raw = await readFile(credentialsPath, "utf8");
    const store = JSON.parse(raw) as CredentialsStore;
    log.debug(`Loaded credentials for ${Object.keys(store).length} registries`);
    return store;
  } catch (error) {
    log.debug(
      `Failed to load credentials: ${error instanceof Error ? error.message : String(error)}`
    );
    return {};
  }
}

/**
 * Saves the entire credentials store
 */
async function saveStore(store: CredentialsStore): Promise<void> {
  const credentialsPath = getCredentialsPath();
  const dir = dirname(credentialsPath);

  await mkdir(dir, { recursive: true });

  const content = JSON.stringify(store, null, 2);
  await writeFile(credentialsPath, content, { encoding: "utf8", mode: 0o600 });
  await chmodAsync(credentialsPath, 0o600);
  log.debug(
    `Saved credentials for ${Object.keys(store).length} registries to ${credentialsPath}`
  );
}

/**
 * Gets credentials for a specific registry
 */
export async function getCredentials(
  registryUrl: string
): Promise<RegistryCredentials | null> {
  const store = await loadStore();
  const key = normalizeUrl(registryUrl);
  const credentials = store[key];

  if (!credentials) {
    log.debug(`No credentials found for registry: ${registryUrl}`);
    return null;
  }

  // Check expiration
  if (credentials.expiresAt) {
    const expiresAt = new Date(credentials.expiresAt);
    if (expiresAt.getTime() < Date.now()) {
      log.debug(
        `Credentials expired for registry ${registryUrl}, clearing them`
      );
      await clearCredentials(registryUrl);
      return null;
    }
    log.debug(
      `Credentials valid for registry ${registryUrl}, expires at ${credentials.expiresAt}`
    );
  } else {
    log.debug(`Credentials found for registry ${registryUrl} (no expiration)`);
  }

  return credentials;
}

/**
 * Saves credentials for a specific registry
 */
export async function saveCredentials(
  registryUrl: string,
  credentials: RegistryCredentials
): Promise<void> {
  const store = await loadStore();
  const key = normalizeUrl(registryUrl);
  store[key] = credentials;
  log.debug(
    `Saving credentials for registry ${registryUrl}${credentials.expiresAt ? ` (expires ${credentials.expiresAt})` : ""}`
  );
  await saveStore(store);
}

/**
 * Clears credentials for a specific registry
 */
export async function clearCredentials(registryUrl: string): Promise<void> {
  const store = await loadStore();
  const key = normalizeUrl(registryUrl);
  delete store[key];
  log.debug(`Cleared credentials for registry ${registryUrl}`);

  if (Object.keys(store).length === 0) {
    // Remove file if no credentials left
    try {
      await rm(getCredentialsPath(), { force: true });
      log.debug("Removed empty credentials file");
    } catch {
      // Ignore
    }
  } else {
    await saveStore(store);
  }
}

/**
 * Clears all stored credentials
 */
export async function clearAllCredentials(): Promise<void> {
  try {
    await rm(getCredentialsPath(), { force: true });
  } catch {
    // Ignore
  }
}

/**
 * Checks if the user is logged in to a specific registry
 */
export async function isLoggedIn(registryUrl: string): Promise<boolean> {
  const credentials = await getCredentials(registryUrl);
  return credentials !== null;
}

/**
 * Lists all registries the user is logged into
 */
export async function listLoggedInRegistries(): Promise<string[]> {
  const store = await loadStore();
  return Object.keys(store);
}
