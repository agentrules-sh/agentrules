/**
 * CLI Unpublish Command
 *
 * Removes a preset version from the AGENT_RULES registry.
 * Requires authentication - run `agentrules login` first.
 */

import type { PlatformId } from "@agentrules/core";
import { isSupportedPlatform } from "@agentrules/core";
import { unpublishPreset } from "@/lib/api/presets";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";
import { ui } from "@/lib/ui";

export type UnpublishOptions = {
  /** Preset identifier (e.g., my-preset.claude@1.0 or my-preset@1.0) */
  preset: string;
  /** Platform override */
  platform?: PlatformId;
  /** Version override */
  version?: string;
};

export type UnpublishResult = {
  /** Whether unpublish was successful */
  success: boolean;
  /** Error message if unpublish failed */
  error?: string;
  /** Unpublished preset info */
  preset?: {
    slug: string;
    platform: string;
    version: string;
  };
};

/**
 * Parses preset input to extract slug, platform, and version.
 * Supports formats:
 * - "my-preset.claude@1.0" (platform and version in string)
 * - "my-preset@1.0" (requires explicit platform)
 * - "my-preset.claude" (requires explicit version)
 *
 * Explicit --platform and --version flags take precedence.
 */
function parseUnpublishInput(
  input: string,
  explicitPlatform?: PlatformId,
  explicitVersion?: string
): { slug: string; platform?: PlatformId; version?: string } {
  let normalized = input.toLowerCase().trim();

  // Extract version from @version suffix
  let parsedVersion: string | undefined;
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex > 0) {
    parsedVersion = normalized.slice(atIndex + 1);
    normalized = normalized.slice(0, atIndex);
  }

  // Explicit version flag takes precedence
  const version = explicitVersion ?? parsedVersion;

  // Try to extract platform from suffix (e.g., "my-preset.claude")
  const parts = normalized.split(".");
  const maybePlatform = parts.at(-1);

  let slug: string;
  let platform: PlatformId | undefined;

  if (maybePlatform && isSupportedPlatform(maybePlatform)) {
    slug = parts.slice(0, -1).join(".");
    platform = explicitPlatform ?? maybePlatform;
  } else {
    slug = normalized;
    platform = explicitPlatform;
  }

  return { slug, platform, version };
}

/**
 * Unpublishes a preset version from the registry
 */
export async function unpublish(
  options: UnpublishOptions
): Promise<UnpublishResult> {
  const { slug, platform, version } = parseUnpublishInput(
    options.preset,
    options.platform,
    options.version
  );

  if (!slug) {
    log.error("Preset slug is required");
    return {
      success: false,
      error: "Preset slug is required",
    };
  }

  if (!platform) {
    log.error(
      "Platform is required. Use --platform or specify as <slug>.<platform>@<version>"
    );
    return {
      success: false,
      error: "Platform is required",
    };
  }

  if (!version) {
    log.error(
      "Version is required. Use --version or specify as <slug>.<platform>@<version>"
    );
    return {
      success: false,
      error: "Version is required",
    };
  }

  log.debug(`Unpublishing preset: ${slug}.${platform}@${version}`);

  const ctx = useAppContext();

  // Check authentication
  if (!(ctx.isLoggedIn && ctx.credentials)) {
    const error = "Not logged in. Run `agentrules login` to authenticate.";
    log.error(error);
    return { success: false, error };
  }

  log.debug(`Authenticated, unpublishing from ${ctx.registry.url}`);

  const spinner = await log.spinner(
    `Unpublishing ${ui.code(slug)}.${platform} ${ui.version(version)}...`
  );

  const result = await unpublishPreset(
    ctx.registry.url,
    ctx.credentials.token,
    slug,
    platform,
    version
  );

  if (!result.success) {
    spinner.fail("Unpublish failed");
    log.error(result.error);

    if (result.error.includes("connect")) {
      log.info(ui.hint("Check your network connection and try again."));
    }

    return {
      success: false,
      error: result.error,
    };
  }

  const { data } = result;

  spinner.success(
    `Unpublished ${ui.code(data.slug)}.${data.platform} ${ui.version(data.version)}`
  );

  log.info(ui.hint("This version can no longer be republished."));

  return {
    success: true,
    preset: {
      slug: data.slug,
      platform: data.platform,
      version: data.version,
    },
  };
}
