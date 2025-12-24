import {
  COMMON_LICENSES,
  descriptionSchema,
  isSupportedPlatform,
  licenseSchema,
  nameSchema,
  PLATFORM_IDS,
  type PlatformId,
  RULE_CONFIG_FILENAME,
  tagsSchema,
} from "@agentrules/core";
import * as p from "@clack/prompts";
import { join } from "path";
import { directoryExists, fileExists } from "@/lib/fs";
import { normalizeName, toTitleCase } from "@/lib/rule-utils";
import { check } from "@/lib/zod-validator";
import {
  detectSkillDirectory,
  type InitOptions,
  type InitResult,
  initRule,
} from "./init";

const DEFAULT_RULE_NAME = "my-rule";

/**
 * Parse comma-separated tags string into array.
 */
function parseTags(input: unknown): string[] {
  if (typeof input !== "string") return [];
  if (input.trim().length === 0) return [];

  return input
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
}

/**
 * Validator for comma-separated tags input.
 */
function checkTags(value: unknown): string | undefined {
  const tags = parseTags(value);
  const result = tagsSchema.safeParse(tags);
  if (!result.success) {
    return result.error.issues[0]?.message;
  }
}

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
  const {
    directory,
    name: nameOption,
    title: titleOption,
    description: descriptionOption,
    platforms: platformsOption,
    platformPaths,
    license: licenseOption,
  } = options;
  let { force } = options;

  p.intro("Create a new rule");

  // Detect skill directory and prompt
  const skillInfo = await detectSkillDirectory(directory);
  let useSkillDefaults = false;

  if (skillInfo) {
    const confirm = await p.confirm({
      message: `Detected SKILL.md${skillInfo.name ? ` (${skillInfo.name})` : ""}. Initialize as skill?`,
      initialValue: true,
    });

    if (p.isCancel(confirm)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    useSkillDefaults = confirm;
  }

  const defaultName =
    useSkillDefaults && skillInfo?.name
      ? skillInfo.name
      : (nameOption ?? DEFAULT_RULE_NAME);

  const defaultLicense =
    useSkillDefaults && skillInfo?.license
      ? skillInfo.license
      : (licenseOption ?? "MIT");

  // Validate platform options if provided
  const validatedPlatforms: PlatformId[] = [];
  if (platformsOption) {
    for (const platform of platformsOption) {
      if (!isSupportedPlatform(platform)) {
        p.cancel(`Unknown platform "${platform}"`);
        process.exit(1);
      }
      validatedPlatforms.push(platform as PlatformId);
    }
  }

  const selectedPlatforms: PlatformId[] =
    validatedPlatforms.length > 0
      ? validatedPlatforms
      : await (async () => {
          const platformChoices = await p.multiselect({
            message: "Platforms (select one or more)",
            options: PLATFORM_IDS.map((id) => ({ value: id, label: id })),
            required: true,
          });

          if (p.isCancel(platformChoices)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          return platformChoices as PlatformId[];
        })();

  const platformEntries: Array<
    PlatformId | { platform: PlatformId; path: string }
  > = await (async () => {
    if (selectedPlatforms.length === 0) {
      return [];
    }

    // Skills generate paths automatically on publish - skip path prompts
    if (useSkillDefaults) {
      return selectedPlatforms;
    }

    const hasCompletePathMapping = selectedPlatforms.every((platform) => {
      const value = platformPaths?.[platform];
      return typeof value === "string" && value.trim().length > 0;
    });

    if (hasCompletePathMapping) {
      return selectedPlatforms.map((platform) => {
        const path = platformPaths?.[platform]?.trim();
        if (!path || path === ".") return platform;
        return { platform, path };
      });
    }

    if (selectedPlatforms.length === 1) {
      return selectedPlatforms;
    }

    const entries: Array<PlatformId | { platform: PlatformId; path: string }> =
      [];

    for (const platform of selectedPlatforms) {
      const mappedPath = platformPaths?.[platform]?.trim();
      const suggestedPath =
        mappedPath ??
        ((await directoryExists(join(directory, platform))) ? platform : ".");

      const input = await p.text({
        message: `Folder for ${platform} files ('.' = same folder as agentrules.json)`,
        placeholder: suggestedPath,
        defaultValue: suggestedPath,
      });

      if (p.isCancel(input)) {
        p.cancel("Cancelled");
        process.exit(0);
      }

      const trimmed = input.trim();
      const resolvedPath = trimmed.length > 0 ? trimmed : suggestedPath;

      if (resolvedPath === ".") {
        entries.push(platform);
      } else {
        entries.push({ platform, path: resolvedPath });
      }
    }

    return entries;
  })();

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

  // Prompt for remaining values
  const result = await p.group(
    {
      name: () => {
        const normalizedDefault = normalizeName(defaultName);
        return p.text({
          message: "Rule name",
          placeholder: normalizedDefault,
          defaultValue: normalizedDefault,
          validate: (value) => {
            // Allow empty to use defaultValue
            if (!value || value.trim() === "") return;
            return check(nameSchema)(value);
          },
        });
      },

      title: ({ results }: { results: { name?: string } }) => {
        const defaultTitle =
          titleOption ?? toTitleCase(results.name ?? defaultName);
        return p.text({
          message: "Title",
          defaultValue: defaultTitle,
          placeholder: defaultTitle,
        });
      },

      description: () =>
        p.text({
          message: "Description",
          placeholder: "Describe what this rule does...",
          defaultValue: descriptionOption,
          validate: check(descriptionSchema),
        }),

      tags: () =>
        p.text({
          message: "Tags (comma-separated, optional)",

          placeholder: "e.g., typescript, testing, react",
          validate: checkTags,
        }),

      license: async () => {
        const choice = await p.select({
          message: "License",
          options: [
            ...COMMON_LICENSES.map((id) => ({ value: id, label: id })),
            { value: "__other__", label: "Other (enter SPDX identifier)" },
          ],
          initialValue: defaultLicense,
        });

        if (p.isCancel(choice)) {
          p.cancel("Cancelled");
          process.exit(0);
        }

        if (choice === "__other__") {
          const custom = await p.text({
            message: "License (SPDX identifier)",
            placeholder: "e.g., MPL-2.0, AGPL-3.0-only",
            validate: check(licenseSchema),
          });

          if (p.isCancel(custom)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          return custom;
        }

        return choice;
      },
    },
    {
      onCancel: () => {
        p.cancel("Cancelled");
        return process.exit(0);
      },
    }
  );

  const initOptions: InitOptions = {
    directory,
    name: result.name,
    type: useSkillDefaults ? "skill" : undefined,
    title: result.title.trim() || undefined,
    description: result.description,
    tags: parseTags(result.tags),
    platforms: platformEntries,
    license: result.license,
    force,
  };

  const initResult = await initRule(initOptions);

  // Show success
  p.outro(`Created ${initResult.configPath}`);

  return initResult;
}
