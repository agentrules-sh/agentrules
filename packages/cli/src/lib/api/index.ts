/**
 * Registry API Client
 *
 * This module contains the client code for calling remote registry APIs.
 *
 * ## For Registry Implementers
 *
 * A compatible registry server must implement:
 *
 * ### Authentication
 * - POST /api/auth/device/code - RFC 8628 device code request
 * - POST /api/auth/device/token - RFC 8628 token exchange
 * - GET  /api/auth/get-session - Get current user/session info
 *
 * ### Presets
 * - POST   /api/presets - Publish a preset bundle
 * - DELETE /api/presets/:slug/:platform/:version - Unpublish a preset version
 */

// RFC 8628 Device Authorization Grant
export {
  type DeviceAuthorizationResponse,
  type DeviceCodeRequestOptions,
  type DeviceCodeRequestResult,
  type PollForTokenOptions,
  type PollForTokenResult,
  pollForToken,
  requestDeviceCode,
  type TokenEndpointResponse,
} from "./device-auth";
// Preset endpoints
export {
  type ErrorResponse,
  PRESET_ENDPOINTS,
  type PublishResponse,
  type PublishResult,
  publishPreset,
  type UnpublishResponse,
  type UnpublishResult,
  unpublishPreset,
} from "./presets";
// Session endpoint
export {
  AUTH_ENDPOINTS,
  fetchSession,
  type GetSessionResponse,
  type RegistrySession,
  type RegistryUser,
} from "./session";
