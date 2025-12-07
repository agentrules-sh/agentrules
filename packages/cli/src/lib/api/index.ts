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
 * ### Presets (API_ENDPOINTS.presets)
 * - POST   {base} - Publish a preset bundle
 * - DELETE {unpublish(slug, platform, version)} - Unpublish a preset version
 *
 * ### Rules (API_ENDPOINTS.rule)
 * - POST   {base} - Create a new rule
 * - GET    {base}/{slug} - Get a rule by slug
 * - PUT    {base}/{slug} - Update a rule
 * - DELETE {base}/{slug} - Unshare (soft delete) a rule
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
// Preset endpoints
export {
  type ErrorResponse,
  type PublishResponse,
  type PublishResult,
  publishPreset,
  type UnpublishResponse,
  type UnpublishResult,
  unpublishPreset,
} from "./presets";
// Rule endpoints
export {
  type CreateRuleResult,
  createRule,
  type DeleteRuleResponse,
  type DeleteRuleResult,
  deleteRule,
  type GetRuleResult,
  getRule,
  type RuleInput,
  type RuleResponse,
  type UpdateRuleResult,
  updateRule,
  // Note: ErrorResponse is already exported from "./presets"
} from "./rule";
// Session endpoint
export {
  fetchSession,
  type GetSessionResponse,
  type RegistrySession,
  type RegistryUser,
} from "./session";
