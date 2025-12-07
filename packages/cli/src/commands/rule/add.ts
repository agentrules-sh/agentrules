/**
 * CLI Rule Add Command
 *
 * Downloads and installs a rule from the AGENT_RULES registry.
 * Rules are single files that get installed to platform-specific paths.
 */

import type { PlatformId } from "@agentrules/core";
import { getInstallPath } from "@agentrules/core";
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, resolve } from "path";
import { getRule } from "@/lib/api/rule";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";

export type AddRuleOptions = {
  slug: string;
  global?: boolean;
  directory?: string;
  force?: boolean;
  dryRun?: boolean;
};

export type AddRuleResult = {
  slug: string;
  platform: string;
  type: string;
  title: string;
  targetPath: string;
  status: "created" | "overwritten" | "conflict" | "unchanged";
  dryRun: boolean;
};

export async function addRule(options: AddRuleOptions): Promise<AddRuleResult> {
  const ctx = useAppContext();
  const dryRun = Boolean(options.dryRun);

  log.debug(`Fetching rule: ${options.slug}`);

  const result = await getRule(ctx.registry.url, options.slug);

  if (!result.success) {
    throw new Error(result.error);
  }

  const rule = result.data;
  const platform = rule.platform as PlatformId;

  // Determine target path (use rule.slug from API for consistency)
  const targetPath = resolveTargetPath(platform, rule.type, rule.slug, {
    global: options.global,
    directory: options.directory,
  });

  log.debug(`Target path: ${targetPath}`);

  // Check if file exists
  const existing = await readExistingFile(targetPath);

  if (existing !== null) {
    // File exists - check if content is the same
    if (existing === rule.content) {
      return {
        slug: rule.slug,
        platform: rule.platform,
        type: rule.type,
        title: rule.title,
        targetPath,
        status: "unchanged",
        dryRun,
      };
    }

    // Content differs - conflict unless force
    if (!options.force) {
      return {
        slug: rule.slug,
        platform: rule.platform,
        type: rule.type,
        title: rule.title,
        targetPath,
        status: "conflict",
        dryRun,
      };
    }

    // Force - overwrite
    if (!dryRun) {
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, rule.content, "utf-8");
    }

    return {
      slug: rule.slug,
      platform: rule.platform,
      type: rule.type,
      title: rule.title,
      targetPath,
      status: "overwritten",
      dryRun,
    };
  }

  // File doesn't exist - create it
  if (!dryRun) {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, rule.content, "utf-8");
  }

  return {
    slug: rule.slug,
    platform: rule.platform,
    type: rule.type,
    title: rule.title,
    targetPath,
    status: "created",
    dryRun,
  };
}

function resolveTargetPath(
  platform: PlatformId,
  type: string,
  slug: string,
  options: { global?: boolean; directory?: string }
): string {
  const location = options.global ? "global" : "project";
  const pathTemplate = getInstallPath(platform, type, slug, location);

  if (!pathTemplate) {
    const locationLabel = options.global ? "globally" : "to a project";
    throw new Error(
      `Rule type "${type}" cannot be installed ${locationLabel} for platform "${platform}"`
    );
  }

  if (options.directory) {
    // For custom directory, extract filename from resolved path template
    const resolvedTemplate = pathTemplate.replace("{name}", slug);
    const filename = resolvedTemplate.split("/").pop() ?? `${slug}.md`;
    return resolve(expandHome(options.directory), filename);
  }

  const expanded = expandHome(pathTemplate);
  if (expanded.startsWith("/")) {
    return expanded;
  }

  return resolve(process.cwd(), expanded);
}

async function readExistingFile(pathname: string): Promise<string | null> {
  try {
    return await readFile(pathname, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function expandHome(value: string): string {
  if (value.startsWith("~")) {
    const remainder = value.slice(1);
    if (!remainder) {
      return homedir();
    }
    if (remainder.startsWith("/") || remainder.startsWith("\\")) {
      return `${homedir()}${remainder}`;
    }
    return `${homedir()}/${remainder}`;
  }
  return value;
}

/**
 * Check if input looks like a rule reference (r/ prefix)
 */
export function isRuleReference(input: string): boolean {
  return input.toLowerCase().startsWith("r/");
}

/**
 * Extract slug from rule reference (removes r/ prefix)
 */
export function extractRuleSlug(input: string): string {
  if (isRuleReference(input)) {
    return input.slice(2);
  }
  return input;
}
