/**
 * CLI Login Command
 *
 * Authenticates with an agentrules registry using the OAuth 2.0 Device
 * Authorization Grant (RFC 8628). This allows authentication in headless
 * environments (SSH, CI/CD, etc.) without requiring a browser redirect.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { fetchSession } from "@/lib/api";
import { pollForToken, requestDeviceCode, saveCredentials } from "@/lib/auth";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";

const execAsync = promisify(exec);

const CLIENT_ID = "agentrules-cli";

export type DeviceCodeData = {
  /** User code to display (formatted as XXXX-XXXX) */
  userCode: string;
  /** URL for manual entry */
  verificationUri: string;
  /** URL with code included (if available) */
  verificationUriComplete?: string;
};

export type LoginOptions = {
  /** Skip opening browser automatically */
  noBrowser?: boolean;
  /** Force re-login even if already authenticated */
  force?: boolean;
  /** Called when device code is received - display this to the user (essential for UX) */
  onDeviceCode?: (data: DeviceCodeData) => void;
  /** Called after browser open attempt - true if opened, false if manual entry needed (essential for UX) */
  onBrowserOpen?: (opened: boolean) => void;
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
    noBrowser = false,
    force = false,
    onDeviceCode,
    onBrowserOpen,
  } = options;

  const ctx = useAppContext();
  if (!ctx) {
    throw new Error("App context not initialized");
  }

  const { apiUrl } = ctx.registry;
  log.debug(`Authenticating with ${apiUrl}`);

  // Check if already logged in to this registry
  if (!force && ctx.credentials) {
    log.debug("Already logged in, skipping authentication");
    return {
      success: true,
      alreadyLoggedIn: true,
      user: ctx.user ?? undefined,
    };
  }

  try {
    // Step 1: Request device code
    log.debug("Requesting device code");
    const codeResult = await requestDeviceCode({
      issuer: apiUrl,
      clientId: CLIENT_ID,
    });

    if (codeResult.success === false) {
      return { success: false, error: codeResult.error };
    }

    const { data: deviceAuthResponse, config } = codeResult;

    // Step 2: Display device code to user
    const formattedCode = formatUserCode(deviceAuthResponse.user_code);

    onDeviceCode?.({
      userCode: formattedCode,
      verificationUri: deviceAuthResponse.verification_uri,
      verificationUriComplete: deviceAuthResponse.verification_uri_complete,
    });

    // Step 3: Open browser (if enabled)
    let browserOpened = false;

    if (!noBrowser) {
      try {
        const urlToOpen =
          deviceAuthResponse.verification_uri_complete ??
          deviceAuthResponse.verification_uri;
        log.debug(`Opening browser: ${urlToOpen}`);
        await openBrowser(urlToOpen);
        browserOpened = true;
      } catch {
        log.debug("Failed to open browser");
      }
    }

    onBrowserOpen?.(browserOpened);

    // Step 4: Poll for authorization
    log.debug("Waiting for user authorization");
    const pollResult = await pollForToken({
      config,
      deviceAuthorizationResponse: deviceAuthResponse,
    });

    if (pollResult.success === false) {
      return { success: false, error: pollResult.error };
    }

    // Step 5: Fetch user info
    const token = pollResult.token.access_token;

    log.debug("Fetching user info");
    const session = await fetchSession(apiUrl, token);
    const user = session?.user;
    const sessionExpiresAt = session?.session?.expiresAt;

    // Step 6: Save credentials
    const expiresAt =
      sessionExpiresAt ??
      (pollResult.token.expires_in
        ? new Date(
            Date.now() + pollResult.token.expires_in * 1000
          ).toISOString()
        : undefined);

    log.debug("Saving credentials");
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
