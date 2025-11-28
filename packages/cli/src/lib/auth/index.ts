/**
 * Authentication Module
 *
 * Handles CLI authentication using OAuth 2.0 Device Authorization Grant.
 *
 * - `rfc-8628.ts` - Device Authorization Grant protocol (RFC 8628)
 * - `credentials.ts` - Local token storage
 *
 * For registry API endpoints (session, presets), see `../api/`.
 */

// Credential Storage
export {
  type CredentialsStore,
  clearAllCredentials,
  clearCredentials,
  getCredentials,
  getCredentialsPath,
  type RegistryCredentials,
  saveCredentials,
} from "./credentials";
// RFC 8628 - Device Authorization Grant
export {
  type DeviceAuthorizationResponse,
  type DeviceCodeRequestOptions,
  type DeviceCodeRequestResult,
  type PollForTokenOptions,
  type PollForTokenResult,
  pollForToken,
  requestDeviceCode,
  type TokenEndpointResponse,
} from "./rfc-8628";
