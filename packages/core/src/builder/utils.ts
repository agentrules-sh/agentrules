import { ZodError } from "zod";
import type { PlatformId, PresetConfig } from "../types";
import { presetConfigSchema } from "../types/schema";

export function cleanInstallMessage(value: unknown) {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function encodeItemName(slug: string, platform: PlatformId) {
  return `${slug}.${platform}`;
}

export function validatePresetConfig(
  config: unknown,
  slug: string
): PresetConfig {
  try {
    return presetConfigSchema.parse(config);
  } catch (e) {
    if (e instanceof ZodError) {
      const messages = e.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      });
      throw new Error(`Invalid preset config for ${slug}:\n  - ${messages.join("\n  - ")}`);
    }
    throw e;
  }
}
