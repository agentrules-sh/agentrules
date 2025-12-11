/**
 * CLI Unpublish Command
 *
 * Removes a preset version from the AGENT_RULES registry.
 * Unpublishes the entire version including all platform variants.
 * Requires authentication - run `agentrules login` first.
 */

import { unpublishPreset } from "@/lib/api/presets";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";
import { ui } from "@/lib/ui";

export type UnpublishOptions = {
  /** Preset identifier (e.g., my-preset@1.0 or username/my-preset@1.0) */
  preset: string;
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
    version: string;
  };
};

/**
 * Parses preset input to extract slug and version.
 * Supports formats:
 * - "my-preset@1.0" (slug and version)
 * - "username/my-preset@1.0" (namespaced slug and version)
 * - "my-preset" (requires explicit --version)
 *
 * Explicit --version flag takes precedence.
 */
function parseUnpublishInput(
  input: string,
  explicitVersion?: string
): { slug: string; version?: string } {
  let normalized = input.trim();

  // Extract version from @version suffix
  let parsedVersion: string | undefined;
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex > 0) {
    parsedVersion = normalized.slice(atIndex + 1);
    normalized = normalized.slice(0, atIndex);
  }

  // Explicit version flag takes precedence
  const version = explicitVersion ?? parsedVersion;

  return { slug: normalized, version };
}

/**
 * Unpublishes a preset version from the registry.
 * This unpublishes all platform variants for the specified version.
 */
export async function unpublish(
  options: UnpublishOptions
): Promise<UnpublishResult> {
  const { slug, version } = parseUnpublishInput(
    options.preset,
    options.version
  );

  if (!slug) {
    log.error("Preset slug is required");
    return {
      success: false,
      error: "Preset slug is required",
    };
  }

  if (!version) {
    log.error(
      "Version is required. Use --version or specify as <slug>@<version>"
    );
    return {
      success: false,
      error: "Version is required",
    };
  }

  log.debug(`Unpublishing preset: ${slug}@${version}`);

  const ctx = useAppContext();

  // Check authentication
  if (!(ctx.isLoggedIn && ctx.credentials)) {
    const error = "Not logged in. Run `agentrules login` to authenticate.";
    log.error(error);
    return { success: false, error };
  }

  log.debug(`Authenticated, unpublishing from ${ctx.registry.url}`);

  const spinner = await log.spinner(
    `Unpublishing ${ui.code(slug)} ${ui.version(version)}...`
  );

  const result = await unpublishPreset(
    ctx.registry.url,
    ctx.credentials.token,
    slug,
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
    `Unpublished ${ui.code(data.slug)} ${ui.version(data.version)}`
  );

  log.info(
    ui.hint("This version and all its platform variants have been removed.")
  );

  return {
    success: true,
    preset: {
      slug: data.slug,
      version: data.version,
    },
  };
}
