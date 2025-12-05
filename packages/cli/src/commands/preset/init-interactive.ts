import {
  COMMON_LICENSES,
  descriptionSchema,
  licenseSchema,
  PLATFORM_IDS,
  type PlatformId,
  PRESET_CONFIG_FILENAME,
  slugSchema,
  titleSchema,
} from "@agentrules/core";
import * as p from "@clack/prompts";
import { join } from "path";
import { fileExists } from "@/lib/fs";
import { normalizeName, toTitleCase } from "@/lib/preset-utils";
import { check } from "@/lib/zod-validator";
import {
  detectPlatforms,
  type InitOptions,
  type InitResult,
  initPreset,
} from "./init";

const DEFAULT_PRESET_NAME = "my-preset";

export type InteractiveInitOptions = {
  directory: string;
  name?: string;
  title?: string;
  description?: string;
  platform?: string;
  license?: string;
  force?: boolean;
};

/**
 * Run interactive init flow with clack prompts
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
  const defaultName = nameOption ?? DEFAULT_PRESET_NAME;

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
          message: "Preset name (slug)",
          placeholder: normalizeName(defaultName),
          defaultValue: normalizeName(defaultName),
          validate: check(slugSchema),
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
        const defaultDescription =
          descriptionOption ?? `${results.title} preset`;
        return p.text({
          message: "Description",
          placeholder: defaultDescription,
          defaultValue: defaultDescription,
          validate: check(descriptionSchema),
        });
      },

      platform: () => {
        const defaultPlatform =
          platformOption ?? (detected.length > 0 ? detected[0].id : "opencode");
        return p.select({
          message: "Platform",
          options: PLATFORM_IDS.map((id) => ({
            value: id,
            label: detectedMap.has(id) ? `${id} (detected)` : id,
            hint: detectedMap.get(id)?.path,
          })),
          initialValue: defaultPlatform as PlatformId,
        });
      },

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
