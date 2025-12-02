import { PRESET_CONFIG_FILENAME } from "@agentrules/core";
import { stat } from "fs/promises";
import { join } from "path";

/**
 * Normalize a string to a valid preset slug (lowercase kebab-case)
 */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Convert a kebab-case string to Title Case
 */
export function toTitleCase(input: string): string {
  return input
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Resolve path to agentrules.json config file.
 * If path is a directory, appends the config filename.
 * If path is omitted, uses current working directory.
 */
export async function resolveConfigPath(inputPath?: string): Promise<string> {
  if (!inputPath) {
    return join(process.cwd(), PRESET_CONFIG_FILENAME);
  }

  const stats = await stat(inputPath).catch(() => null);

  if (stats?.isDirectory()) {
    return join(inputPath, PRESET_CONFIG_FILENAME);
  }

  return inputPath;
}
