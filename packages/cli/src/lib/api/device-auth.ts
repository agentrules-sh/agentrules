/**
 * RFC 8628 - OAuth 2.0 Device Authorization Grant
 *
 * Uses openid-client library which is OpenID Certified and handles
 * the RFC 8628 flow correctly.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628
 * @see https://github.com/panva/openid-client
 */

import * as client from "openid-client";
import { log } from "@/lib/log";
import { buildUrl } from "@/lib/url";

// Re-export types from openid-client for convenience
export type {
  DeviceAuthorizationResponse,
  TokenEndpointResponse,
} from "openid-client";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_DEVICE_AUTHORIZATION_ENDPOINT = "/api/auth/device/code";
const DEFAULT_TOKEN_ENDPOINT = "/api/auth/device/token";

export type DeviceCodeRequestOptions = {
  /** The authorization server's issuer URL */
  issuer: string;
  /** The client identifier */
  clientId: string;
  /** Optional scope for the access request */
  scope?: string;
  /** Custom device authorization endpoint (optional) */
  deviceAuthorizationEndpoint?: string;
  /** Custom token endpoint (optional) */
  tokenEndpoint?: string;
};

export type DeviceCodeRequestResult =
  | {
      success: true;
      data: client.DeviceAuthorizationResponse;
      config: client.Configuration;
    }
  | { success: false; error: string };

// =============================================================================
// Device Code Request
// =============================================================================

/**
 * Request a device code from the authorization server.
 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.1
 */
export async function requestDeviceCode(
  options: DeviceCodeRequestOptions
): Promise<DeviceCodeRequestResult> {
  const deviceAuthEndpoint = buildUrl(
    options.issuer,
    options.deviceAuthorizationEndpoint ?? DEFAULT_DEVICE_AUTHORIZATION_ENDPOINT
  );
  const tokenEndpoint = buildUrl(
    options.issuer,
    options.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT
  );

  const serverMetadata: client.ServerMetadata = {
    issuer: options.issuer.replace(/\/$/, ""), // OpenID spec expects no trailing slash
    device_authorization_endpoint: deviceAuthEndpoint,
    token_endpoint: tokenEndpoint,
  };

  const config = new client.Configuration(
    serverMetadata,
    options.clientId,
    undefined,
    client.None()
  );

  // Allow HTTP for localhost
  if (
    options.issuer.startsWith("http://localhost") ||
    options.issuer.startsWith("http://127.0.0.1")
  ) {
    client.allowInsecureRequests(config);
  }

  const params: Record<string, string> = {};
  if (options.scope) {
    params.scope = options.scope;
  }

  try {
    log.debug(`Device code request to: ${deviceAuthEndpoint}`);

    const response = await client.initiateDeviceAuthorization(config, params);

    log.debug(`Device code response: ${JSON.stringify(response)}`);

    return { success: true, data: response, config };
  } catch (err) {
    return {
      success: false,
      error: formatError(err, deviceAuthEndpoint),
    };
  }
}

// =============================================================================
// Token Polling
// =============================================================================

export type PollForTokenOptions = {
  /** The openid-client configuration */
  config: client.Configuration;
  /** The device authorization response */
  deviceAuthorizationResponse: client.DeviceAuthorizationResponse;
  /** Optional AbortSignal to cancel polling */
  signal?: AbortSignal;
};

export type PollForTokenResult =
  | { success: true; token: client.TokenEndpointResponse }
  | { success: false; error: string };

/**
 * Poll for the access token after user authorization.
 *
 * openid-client handles RFC 8628 polling responses internally:
 * - `authorization_pending`: Continue polling
 * - `slow_down`: Increase polling interval
 * - `expired_token`: Stop polling, code expired
 * - `access_denied`: Stop polling, user denied
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.4
 */
export async function pollForToken(
  options: PollForTokenOptions
): Promise<PollForTokenResult> {
  const { config, deviceAuthorizationResponse, signal } = options;

  try {
    log.debug("Starting token polling...");

    const tokenResponse = await client.pollDeviceAuthorizationGrant(
      config,
      deviceAuthorizationResponse,
      undefined,
      { signal }
    );

    log.debug(`Token response: ${JSON.stringify(tokenResponse)}`);

    return { success: true, token: tokenResponse };
  } catch (err) {
    return { success: false, error: formatPollingError(err) };
  }
}

// =============================================================================
// Error Handling
// =============================================================================

function formatError(err: unknown, endpoint: string): string {
  // OAuth errors have useful messages - use them
  if (err instanceof client.ResponseBodyError) {
    return err.error_description || err.error || "Unknown OAuth error";
  }

  // HTTP errors
  if (err instanceof client.ClientError) {
    const cause = err.cause as Response | undefined;
    if (cause?.status) {
      return formatHttpError(cause.status, endpoint);
    }
  }

  // Everything else (connection failures, generic errors) - provide helpful message
  const url = new URL(endpoint);
  return `Cannot connect to ${url.host}. Is the server running?`;
}

function formatHttpError(status: number, endpoint: string): string {
  switch (status) {
    case 401:
    case 403:
      return `Not authorized (${status}): ${endpoint}`;
    case 404:
      return `Endpoint not found: ${endpoint}`;
    case 415:
      return `Server rejected request format (HTTP 415). Endpoint: ${endpoint}`;
    case 500:
      return `Server error (500): ${endpoint}. Check server logs for details.`;
    case 502:
    case 503:
      return `Server unavailable (${status}): ${endpoint}`;
    default:
      return `HTTP ${status}: ${endpoint}`;
  }
}

function formatPollingError(err: unknown): string {
  // OAuth errors - these have useful messages
  if (err instanceof client.ResponseBodyError) {
    switch (err.error) {
      case "expired_token":
        return "Device code expired. Please try again.";
      case "access_denied":
        return "Authorization was denied.";
      default:
        return err.error_description || err.error || "Authorization failed";
    }
  }

  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return "Authorization was cancelled.";
    }
    if (err.message.includes("timed out")) {
      return "Device code expired. Please try again.";
    }
  }

  // Connection lost, generic errors
  return "Lost connection to server. Please try again.";
}
