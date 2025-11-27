/**
 * CLI Login Command
 *
 * Authenticates with an agentrules registry using the OAuth 2.0 Device
 * Authorization Grant (RFC 8628). This allows authentication in headless
 * environments (SSH, CI/CD, etc.) without requiring a browser redirect.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { fetchSession } from "../../lib/api";
import {
  getCredentials,
  pollForToken,
  requestDeviceCode,
  saveCredentials,
} from "../../lib/auth";
import { getActiveRegistryUrl } from "../registry/manage";

const execAsync = promisify(exec);

const CLIENT_ID = "agentrules-cli";

export type LoginOptions = {
  /** Registry URL (default: active registry) */
  apiUrl?: string;
  /** Registry alias to use instead of URL */
  registry?: string;
  /** Skip opening browser automatically */
  noBrowser?: boolean;
  /** Force re-login even if already authenticated */
  force?: boolean;
  /** Callback for status messages */
  onStatus?: (message: string) => void;
  /** Callback for error messages */
  onError?: (message: string) => void;
};

export type LoginResult = {
  /** Whether login was successful */
  success: boolean;
  /** Error message if login failed */
  error?: string;
  /** User info if login succeeded (optional - depends on registry support) */
  user?: {
    id: string;
    name: string;
    email: string;
  };
  /** Whether login was skipped because already authenticated */
  alreadyLoggedIn?: boolean;
};

/**
 * Performs device code flow login to an agentrules registry.
 */
export async function login(options: LoginOptions = {}): Promise<LoginResult> {
  const {
    apiUrl: explicitUrl,
    registry,
    noBrowser = false,
    force = false,
    onStatus,
    onError,
  } = options;

  // Resolve registry URL: explicit URL > registry alias > active registry
  const registryUrl = explicitUrl ?? (await getActiveRegistryUrl(registry)).url;
  // Extract base URL (origin) for auth - registry URL may have path like /r/
  const apiUrl = new URL(registryUrl).origin;

  // Check if already logged in to this registry
  if (!force) {
    const existing = await getCredentials(apiUrl);
    if (existing) {
      return {
        success: true,
        alreadyLoggedIn: true,
        user:
          existing.userName && existing.userEmail
            ? {
                id: existing.userId ?? "",
                name: existing.userName,
                email: existing.userEmail,
              }
            : undefined,
      };
    }
  }

  try {
    // =========================================================================
    // Step 1: Request device code
    // =========================================================================
    onStatus?.("Initiating device code flow...");

    const codeResult = await requestDeviceCode({
      issuer: apiUrl,
      clientId: CLIENT_ID,
    });

    if (codeResult.success === false) {
      onError?.(codeResult.error);
      return { success: false, error: codeResult.error };
    }

    const { data: deviceAuthResponse, config } = codeResult;

    // =========================================================================
    // Step 2: Open browser and display instructions
    // =========================================================================
    const formattedCode = formatUserCode(deviceAuthResponse.user_code);
    let browserOpened = false;

    if (!noBrowser) {
      try {
        // Prefer verification_uri_complete if available (includes user_code)
        const urlToOpen =
          deviceAuthResponse.verification_uri_complete ??
          deviceAuthResponse.verification_uri;
        await openBrowser(urlToOpen);
        browserOpened = true;
      } catch {
        // Browser failed to open, will show manual instructions below
      }
    }

    onStatus?.("");
    if (browserOpened && deviceAuthResponse.verification_uri_complete) {
      // Browser opened with code in URL - just need to verify
      onStatus?.("Browser opened. Verify this code matches:");
      onStatus?.(`  ${formattedCode}`);
    } else {
      // Manual flow - show URL and code
      onStatus?.("To authenticate, visit:");
      onStatus?.(`  ${deviceAuthResponse.verification_uri}`);
      onStatus?.("");
      onStatus?.(`And enter the code: ${formattedCode}`);
    }

    onStatus?.("");
    onStatus?.("Waiting for authorization...");

    // =========================================================================
    // Step 4: Poll for authorization
    // =========================================================================
    const pollResult = await pollForToken({
      config,
      deviceAuthorizationResponse: deviceAuthResponse,
    });

    if (pollResult.success === false) {
      onError?.(pollResult.error);
      return { success: false, error: pollResult.error };
    }

    // =========================================================================
    // Step 5: Fetch user info
    // =========================================================================
    const token = pollResult.token.access_token;

    onStatus?.("Fetching user info...");
    const session = await fetchSession(apiUrl, token);
    const user = session?.user;
    const sessionExpiresAt = session?.session?.expiresAt;

    // =========================================================================
    // Step 6: Save credentials
    // =========================================================================
    const expiresAt =
      sessionExpiresAt ??
      (pollResult.token.expires_in
        ? new Date(
            Date.now() + pollResult.token.expires_in * 1000
          ).toISOString()
        : undefined);

    await saveCredentials(apiUrl, {
      token,
      expiresAt,
      userId: user?.id,
      userName: user?.name,
      userEmail: user?.email,
    });

    return {
      success: true,
      user: user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
          }
        : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onError?.(message);
    return { success: false, error: message };
  }
}

/**
 * Format user code as XXXX-XXXX for display.
 */
function formatUserCode(code: string): string {
  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length <= 4) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
}

/**
 * Opens a URL in the default browser.
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;

  const commands: Record<string, string> = {
    darwin: `open "${url}"`,
    win32: `start "" "${url}"`,
    linux: `xdg-open "${url}"`,
  };

  const command = commands[platform];
  if (!command) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  await execAsync(command);
}
