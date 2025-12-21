/**
 * Registry API Client
 *
 * This module contains the client code for calling remote registry APIs.
 * All endpoint paths are defined in API_ENDPOINTS (from @agentrules/core).
 *
 * ## For Registry Implementers
 *
 * A compatible registry server must implement endpoints matching API_ENDPOINTS:
 *
 * ### Authentication (API_ENDPOINTS.auth)
 * - POST {deviceCode} - RFC 8628 device code request
 * - POST {deviceToken} - RFC 8628 token exchange
 * - GET  {session} - Get current user/session info
 *
 * ### Rules (API_ENDPOINTS.rules)
 * - GET    {slug}?version=X - Resolve rule by slug
 * - POST   {base} - Publish a rule
 * - DELETE {unpublish(slug, version)} - Unpublish a rule version
 */

// Re-export API_ENDPOINTS from core for convenience
export { API_ENDPOINTS } from "@agentrules/core";

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
// Rule publishing endpoints
export {
  type ErrorResponse,
  type PublishResponse,
  type PublishResult,
  publishRule,
  type UnpublishResponse,
  type UnpublishResult,
  unpublishRule,
} from "./rules";
// Session endpoint
export {
  fetchSession,
  type GetSessionResponse,
  type RegistrySession,
  type RegistryUser,
} from "./session";
