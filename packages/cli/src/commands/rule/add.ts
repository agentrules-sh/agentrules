/**
 * CLI Rule Add Command
 *
 * Downloads and installs a rule from the AGENT_RULES registry.
 * Rules are single files that get installed to platform-specific paths.
 */

import type { PlatformId } from "@agentrules/core";
import { PLATFORMS } from "@agentrules/core";
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, resolve } from "path";
import { getRule } from "@/lib/api/rule";
import { useAppContext } from "@/lib/context";
import { log } from "@/lib/log";

const PLATFORM_TYPE_PATHS: Record<string, Record<string, string>> = {
  opencode: {
    agent: "config/agent",
    command: "config/command",
    tool: "config/tool",
  },
  claude: {
    agent: "config/agent",
    command: "commands",
    skill: "skills",
  },
  cursor: {
    rule: "rules",
  },
  codex: {
    agent: "",
  },
};

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

  // Determine target path
  const targetPath = resolveTargetPath(platform, rule.type, options.slug, {
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
  const platformConfig = PLATFORMS[platform];
  const typePaths = PLATFORM_TYPE_PATHS[platform] || {};
  const typePath = typePaths[type] || "";

  // Custom directory
  if (options.directory) {
    const customRoot = resolve(expandHome(options.directory));
    return resolve(customRoot, typePath, `${slug}.md`);
  }

  // Global
  if (options.global) {
    const globalRoot = resolve(expandHome(platformConfig.globalDir));
    return resolve(globalRoot, typePath, `${slug}.md`);
  }

  // Project (default)
  const projectRoot = process.cwd();
  return resolve(
    projectRoot,
    platformConfig.projectDir,
    typePath,
    `${slug}.md`
  );
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
