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
  titleSchema,
} from "@agentrules/core";
import * as p from "@clack/prompts";
import { join } from "path";
import { fileExists } from "@/lib/fs";
import { normalizeName, toTitleCase } from "@/lib/rule-utils";
import { check } from "@/lib/zod-validator";
import { type InitOptions, type InitResult, initRule } from "./init";

const DEFAULT_RULE_NAME = "my-rule";

/**
 * Parse comma-separated tags string into array
 */
function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
}

/**
 * Validator for comma-separated tags input
 */
function checkTags(value: string): string | undefined {
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
  platform?: string;
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
    platform: platformOption,
    license: licenseOption,
  } = options;
  let { force } = options;
  const defaultName = nameOption ?? DEFAULT_RULE_NAME;

  p.intro("Create a new rule");

  // Validate platform option if provided
  if (platformOption && !isSupportedPlatform(platformOption)) {
    p.cancel(`Unknown platform "${platformOption}"`);
    process.exit(1);
  }
  const validatedPlatform = platformOption as PlatformId | undefined;

  const selectedPlatform: PlatformId =
    validatedPlatform ??
    (await (async () => {
      const platformChoice = await p.select({
        message: "Platform",
        options: PLATFORM_IDS.map((id) => ({ value: id, label: id })),
      });

      if (p.isCancel(platformChoice)) {
        p.cancel("Cancelled");
        process.exit(0);
      }

      return platformChoice as PlatformId;
    })());

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
      name: () =>
        p.text({
          message: "Rule name",
          placeholder: normalizeName(defaultName),
          defaultValue: normalizeName(defaultName),
          validate: check(nameSchema),
        }),

      title: ({ results }) => {
        const defaultTitle =
          titleOption ?? toTitleCase(results.name ?? defaultName);
        return p.text({
          message: "Display name",
          placeholder: defaultTitle,
          defaultValue: defaultTitle,
          validate: check(titleSchema),
        });
      },

      description: ({ results }) => {
        const defaultDescription = descriptionOption ?? `${results.title} rule`;
        return p.text({
          message: "Description",
          placeholder: defaultDescription,
          defaultValue: defaultDescription,
          validate: check(descriptionSchema),
        });
      },

      tags: () =>
        p.text({
          message: "Tags (comma-separated, at least one)",
          placeholder: "e.g., typescript, testing, react",
          validate: checkTags,
        }),

      license: async () => {
        const defaultLicense = licenseOption ?? "MIT";
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
    title: result.title as string,
    description: result.description as string,
    tags: parseTags(result.tags as string),
    platform: selectedPlatform,
    license: result.license as string,
    force,
  };

  const initResult = await initRule(initOptions);

  // Show success
  p.outro(`Created ${initResult.configPath}`);

  return initResult;
}
