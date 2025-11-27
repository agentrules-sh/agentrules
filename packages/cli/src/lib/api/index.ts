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
 * ### Presets (coming soon)
 * - GET  /api/presets/:slug - Fetch a preset
 * - POST /api/presets - Publish a preset
 * - DELETE /api/presets/:slug - Unpublish a preset
 */

export {
  AUTH_ENDPOINTS,
  fetchSession,
  type GetSessionResponse,
  type RegistrySession,
  type RegistryUser,
} from "./auth";
