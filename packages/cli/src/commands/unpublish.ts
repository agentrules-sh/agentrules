/**
 * CLI Unpublish Command
 *
 * Removes a preset version from the AGENT_RULES registry.
 * Requires authentication - run `agentrules login` first.
 */

import { unpublishPreset } from "@/lib/api/presets";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";
import { ui } from "@/lib/ui";

export type UnpublishOptions = {
  /** Slug of the preset to unpublish */
  slug: string;
  /** Platform to unpublish */
  platform: string;
  /** Version to unpublish */
  version: string;
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
 * Unpublishes a preset version from the registry
 */
export async function unpublish(
  options: UnpublishOptions
): Promise<UnpublishResult> {
  const { slug, platform, version } = options;

  if (!slug) {
    log.error("Preset slug is required");
    return {
      success: false,
      error: "Preset slug is required",
    };
  }

  if (!platform) {
    log.error("Platform is required");
    return {
      success: false,
      error: "Platform is required",
    };
  }

  if (!version) {
    log.error("Version is required");
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
