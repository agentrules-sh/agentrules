import { type PlatformId, RULE_CONFIG_FILENAME } from "@agentrules/core";
import * as p from "@clack/prompts";
import { join } from "path";
import { fileExists } from "@/lib/fs";
import { log } from "@/lib/log";
import {
  type CollectedRuleInputs,
  collectRuleInputs,
  toTitleCase,
} from "@/lib/rule-utils";
import { ui } from "@/lib/ui";
import { type InitOptions, type InitResult, initRule } from "./init";

export type InteractiveInitOptions = {
  /** Directory to initialize in (defaults to cwd) */
  directory: string;
  name?: string;
  title?: string;
  description?: string;
  /** Pre-selected platforms */
  platforms?: string[];
  /** Optional per-platform source paths (relative to rule root) */
  platformPaths?: Partial<Record<PlatformId, string>>;
  license?: string;
  force?: boolean;
};

/**
 * Run interactive init flow with clack prompts.
 */
export async function initInteractive(
  options: InteractiveInitOptions
): Promise<InitResult | null> {
  const { directory, platformPaths } = options;
  let { force } = options;

  p.intro("Create a new rule");

  // Check if config already exists in target directory
  const configPath = join(directory, RULE_CONFIG_FILENAME);
  if (!force && (await fileExists(configPath))) {
    const overwrite = await p.confirm({
      message: `${RULE_CONFIG_FILENAME} already exists in ${directory}. Overwrite?`,
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    force = true;
  }

  // Collect rule inputs via shared prompts
  let collected: CollectedRuleInputs;
  try {
    collected = await collectRuleInputs({
      directory,
      defaults: {
        name: options.name,
        title: options.title,
        description: options.description,
        platforms: options.platforms as PlatformId[] | undefined,
        platformPaths,
        license: options.license,
      },
      nonInteractive: false,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Cancelled") {
      p.cancel("Cancelled");
      process.exit(0);
    }
    throw error;
  }

  // Convert platformPaths to platformEntries format expected by initRule
  const platformEntries: Array<
    PlatformId | { platform: PlatformId; path: string }
  > = collected.platforms.map((platform) => {
    const path = collected.platformPaths[platform];
    return path ? { platform, path } : platform;
  });

  // Show preview
  log.print("");
  log.print(
    ui.rulePreview({
      header: "Rule configuration",
      path: directory,
      pathLabel: "Directory",
      name: collected.name,
      title: collected.title || toTitleCase(collected.name),
      description: collected.description,
      platforms: collected.platforms,
      type: collected.isSkill ? "skill" : undefined,
      tags: collected.tags,
      license: collected.license,
      showHints: true,
    })
  );
  log.print("");

  const initOptions: InitOptions = {
    directory,
    name: collected.name,
    type: collected.isSkill ? "skill" : undefined,
    title: collected.title || undefined,
    description: collected.description,
    tags: collected.tags,
    platforms: platformEntries,
    license: collected.license,
    force,
  };

  const initResult = await initRule(initOptions);

  // Show success
  p.outro(`Created ${initResult.configPath}`);

  return initResult;
}
