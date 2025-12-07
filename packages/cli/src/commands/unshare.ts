/**
 * CLI Unshare Command
 *
 * Removes a rule from the AGENT_RULES registry (soft delete).
 * Requires authentication - run `agentrules login` first.
 */

import { deleteRule } from "@/lib/api/rule";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";
import { ui } from "@/lib/ui";

export type UnshareOptions = {
  /** Rule slug to unshare */
  slug: string;
};

export type UnshareResult = {
  /** Whether unshare was successful */
  success: boolean;
  /** Error message if unshare failed */
  error?: string;
  /** Unshared rule info */
  rule?: {
    slug: string;
  };
};

/**
 * Unshares a rule from the registry (soft delete)
 */
export async function unshare(options: UnshareOptions): Promise<UnshareResult> {
  const slug = options.slug?.trim().toLowerCase();

  if (!slug) {
    const error = "Rule slug is required. Usage: agentrules unshare <slug>";
    log.error(error);
    return { success: false, error };
  }

  log.debug(`Unsharing rule: ${slug}`);

  const ctx = useAppContext();

  // Check authentication
  if (!(ctx.isLoggedIn && ctx.credentials)) {
    const error = "Not logged in. Run `agentrules login` to authenticate.";
    log.error(error);
    return { success: false, error };
  }

  log.debug(`Authenticated, unsharing from ${ctx.registry.url}`);

  const spinner = await log.spinner(`Unsharing ${ui.code(slug)}...`);

  const result = await deleteRule(
    ctx.registry.url,
    ctx.credentials.token,
    slug
  );

  if (!result.success) {
    spinner.fail("Unshare failed");
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

  spinner.success(`Unshared ${ui.code(data.slug)}`);

  log.info(ui.hint("The rule has been removed from the registry."));

  return {
    success: true,
    rule: {
      slug: data.slug,
    },
  };
}
