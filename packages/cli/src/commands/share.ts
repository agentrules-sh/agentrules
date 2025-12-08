/**
 * CLI Share Command
 *
 * Shares a rule to the AGENT_RULES registry.
 * Rules are atomic units: a single agent definition, command, tool, or prompt.
 * Requires authentication - run `agentrules login` first.
 */

import {
  getValidRuleTypes,
  PLATFORM_IDS,
  type PlatformId,
} from "@agentrules/core";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { createRule, getRule, updateRule } from "@/lib/api/rule";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";
import { ui } from "@/lib/ui";

export type ShareOptions = {
  name?: string;
  platform?: PlatformId;
  type?: string;
  title?: string;
  description?: string;
  content?: string;
  file?: string;
  tags?: string[];
};

export type ShareResult = {
  success: boolean;
  error?: string;
  rule?: {
    slug: string;
    platform: string;
    type: string;
    title: string;
    isNew: boolean;
  };
};

export async function share(options: ShareOptions = {}): Promise<ShareResult> {
  const ctx = useAppContext();

  // Check authentication
  if (!(ctx.isLoggedIn && ctx.credentials)) {
    const error = "Not logged in. Run `agentrules login` to authenticate.";
    log.error(error);
    return { success: false, error };
  }

  // Get content from file or direct input
  let content = options.content;
  if (options.file) {
    const filePath = resolve(options.file);
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      const error = `Failed to read file: ${options.file}`;
      log.error(error);
      return { success: false, error };
    }
  }

  // Validate required fields
  if (!options.name) {
    const error = "Name is required. Use --name <name>";
    log.error(error);
    return { success: false, error };
  }

  if (!options.platform) {
    const error = `Platform is required. Use --platform <${PLATFORM_IDS.join(
      "|"
    )}>`;
    log.error(error);
    return { success: false, error };
  }

  if (!PLATFORM_IDS.includes(options.platform)) {
    const error = `Invalid platform "${
      options.platform
    }". Valid platforms: ${PLATFORM_IDS.join(", ")}`;
    log.error(error);
    return { success: false, error };
  }

  const validTypes = getValidRuleTypes(options.platform);
  if (!options.type) {
    const error = `Type is required. Use --type <${validTypes.join("|")}>`;
    log.error(error);
    return { success: false, error };
  }

  if (!validTypes.includes(options.type)) {
    const error = `Invalid type "${options.type}" for platform "${
      options.platform
    }". Valid types: ${validTypes.join(", ")}`;
    log.error(error);
    return { success: false, error };
  }

  if (!options.title) {
    const error = "Title is required. Use --title <title>";
    log.error(error);
    return { success: false, error };
  }

  if (!content) {
    const error =
      "Content is required. Use --content <content> or --file <path>";
    log.error(error);
    return { success: false, error };
  }

  if (!options.tags || options.tags.length === 0) {
    const error = "At least one tag is required. Use --tags <tag1,tag2,...>";
    log.error(error);
    return { success: false, error };
  }

  const spinner = await log.spinner("Checking if rule exists...");

  // Check if rule already exists
  const existingResult = await getRule(ctx.registry.url, options.name);
  const isUpdate = existingResult.success;

  if (isUpdate) {
    const existingRule = existingResult.data;

    // Warn if platform/type don't match (they're immutable)
    if (options.platform !== existingRule.platform) {
      spinner.stop();
      log.warn(
        `Platform cannot be changed. Rule is "${existingRule.platform}", ignoring "${options.platform}".`
      );
    }
    if (options.type !== existingRule.type) {
      spinner.stop();
      log.warn(
        `Type cannot be changed. Rule is "${existingRule.type}", ignoring "${options.type}".`
      );
    }

    spinner.update(`Updating rule "${options.name}"...`);

    const result = await updateRule(
      ctx.registry.url,
      ctx.credentials.token,
      options.name,
      {
        title: options.title,
        description: options.description,
        content,
        tags: options.tags,
      }
    );

    if (!result.success) {
      spinner.fail("Update failed");
      log.error(result.error);
      return { success: false, error: result.error };
    }

    spinner.success(`Updated rule ${ui.code(options.name)}`);

    const ruleUrl = `${ctx.registry.url}r/${options.name}`;
    log.print("");
    log.print(ui.keyValue("Now live at", ui.link(ruleUrl)));
    log.print("");
    log.print(
      ui.keyValue(
        "Install command",
        ui.code(`npx @agentrules/cli add r/${options.name}`)
      )
    );

    return {
      success: true,
      rule: {
        slug: result.data.slug,
        platform: result.data.platform,
        type: result.data.type,
        title: result.data.title,
        isNew: false,
      },
    };
  }

  // Create new rule
  spinner.update(`Creating rule "${options.name}"...`);

  const result = await createRule(ctx.registry.url, ctx.credentials.token, {
    name: options.name,
    platform: options.platform,
    type: options.type,
    title: options.title,
    description: options.description,
    content,
    tags: options.tags,
  });

  if (!result.success) {
    spinner.fail("Create failed");
    log.error(result.error);
    if (result.issues) {
      for (const issue of result.issues) {
        log.error(`  ${issue.path}: ${issue.message}`);
      }
    }
    return { success: false, error: result.error };
  }

  spinner.success(`Created rule ${ui.code(options.name)}`);

  const ruleUrl = `${ctx.registry.url}r/${options.name}`;
  log.print("");
  log.print(ui.keyValue("Now live at", ui.link(ruleUrl)));
  log.print("");
  log.print(
    ui.keyValue(
      "Install command",
      ui.code(`npx @agentrules/cli add r/${options.name}`)
    )
  );

  return {
    success: true,
    rule: {
      slug: result.data.slug,
      platform: result.data.platform,
      type: result.data.type,
      title: result.data.title,
      isNew: true,
    },
  };
}
