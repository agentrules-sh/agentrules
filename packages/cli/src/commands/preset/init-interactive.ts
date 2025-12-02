import {
  COMMON_LICENSES,
  PLATFORM_IDS,
  type PlatformId,
  PRESET_CONFIG_FILENAME,
  validateDescription,
  validateLicense,
  validateSlug,
  validateTitle,
} from "@agentrules/core";
import * as p from "@clack/prompts";
import { basename, join } from "path";
import { fileExists } from "@/lib/fs";
import {
  detectPlatforms,
  type InitOptions,
  type InitResult,
  initPreset,
} from "./init";

export type InteractiveInitOptions = {
  directory: string;
  force?: boolean;
};

/**
 * Run interactive init flow with clack prompts
 */
export async function initInteractive(
  options: InteractiveInitOptions
): Promise<InitResult | null> {
  const { directory } = options;
  let { force } = options;
  const dirName = basename(directory);

  p.intro("Create a new preset");

  // Check if config already exists
  const configPath = join(directory, PRESET_CONFIG_FILENAME);
  if (!force && (await fileExists(configPath))) {
    const overwrite = await p.confirm({
      message: `${PRESET_CONFIG_FILENAME} already exists. Overwrite?`,
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    force = true;
  }

  // Detect existing platform config directories
  const detected = await detectPlatforms(directory);
  const detectedMap = new Map(detected.map((d) => [d.id, d]));

  if (detected.length > 0) {
    p.note(
      detected.map((d) => `${d.id} → ${d.path}`).join("\n"),
      "Detected platform directories"
    );
  }

  // Prompt for values
  const result = await p.group(
    {
      name: () =>
        p.text({
          message: "Package name (slug)",
          placeholder: normalizeName(dirName),
          defaultValue: normalizeName(dirName),
          validate: validateSlug,
        }),

      title: ({ results }) =>
        p.text({
          message: "Display name",
          placeholder: toTitleCase(results.name ?? dirName),
          defaultValue: toTitleCase(results.name ?? dirName),
          validate: validateTitle,
        }),

      description: ({ results }) =>
        p.text({
          message: "Description",
          placeholder: `${results.title} preset`,
          defaultValue: `${results.title} preset`,
          validate: validateDescription,
        }),

      platform: () =>
        p.select({
          message: "Platform",
          options: PLATFORM_IDS.map((id) => ({
            value: id,
            label: detectedMap.has(id) ? `${id} (detected)` : id,
            hint: detectedMap.get(id)?.path,
          })),
          initialValue:
            detected.length > 0 ? detected[0].id : ("opencode" as PlatformId),
        }),

      license: async () => {
        const choice = await p.select({
          message: "License",
          options: [
            ...COMMON_LICENSES.map((id) => ({ value: id, label: id })),
            { value: "__other__", label: "Other (enter SPDX identifier)" },
          ],
          initialValue: "MIT",
        });

        if (p.isCancel(choice)) {
          p.cancel("Cancelled");
          process.exit(0);
        }

        if (choice === "__other__") {
          const custom = await p.text({
            message: "License (SPDX identifier)",
            placeholder: "e.g., MPL-2.0, AGPL-3.0-only",
            validate: validateLicense,
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

  // Get detected path for selected platform
  const detectedPath = detectedMap.get(result.platform as PlatformId)?.path;

  const initOptions: InitOptions = {
    directory,
    name: result.name,
    title: result.title as string,
    description: result.description as string,
    platform: result.platform as string,
    detectedPath,
    license: result.license as string,
    force,
  };

  const initResult = await initPreset(initOptions);

  // Show success
  p.outro(`Created ${initResult.configPath}`);

  return initResult;
}

function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toTitleCase(input: string): string {
  return input
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
