/**
 * CLI Unpublish Command
 *
 * Removes a rule version from the AGENT_RULES registry.
 * Unpublishes the entire version including all platform variants.
 * Requires authentication - run `agentrules login` first.
 */

import { unpublishRule } from "@/lib/api/rules";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";
import { ui } from "@/lib/ui";

export type UnpublishOptions = {
  /** Rule identifier (e.g., my-rule@1.0 or username/my-rule@1.0) */
  rule: string;
  /** Version override */
  version?: string;
};

export type UnpublishResult = {
  /** Whether unpublish was successful */
  success: boolean;
  /** Error message if unpublish failed */
  error?: string;
  /** Unpublished rule info */
  rule?: {
    slug: string;
    version: string;
  };
};

/**
 * Parses rule input to extract slug and version.
 * Supports formats:
 * - "my-rule@1.0" (slug and version)
 * - "username/my-rule@1.0" (namespaced slug and version)
 * - "my-rule" (requires explicit --version)
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
 * Unpublishes a rule version from the registry.
 * This unpublishes all platform variants for the specified version.
 */
export async function unpublish(
  options: UnpublishOptions
): Promise<UnpublishResult> {
  const { slug, version } = parseUnpublishInput(options.rule, options.version);

  if (!slug) {
    log.error("Rule slug is required");
    return {
      success: false,
      error: "Rule slug is required",
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

  log.debug(`Unpublishing rule: ${slug}@${version}`);

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

  const result = await unpublishRule(
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
    rule: {
      slug: data.slug,
      version: data.version,
    },
  };
}
