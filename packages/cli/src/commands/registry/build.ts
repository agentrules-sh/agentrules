import {
  API_ENDPOINTS,
  buildPresetRegistry,
  LATEST_VERSION,
  PRESET_CONFIG_FILENAME,
  type PresetInput,
  STATIC_BUNDLE_DIR,
} from "@agentrules/core";
import { mkdir, readdir, writeFile } from "fs/promises";
import { basename, join } from "path";
import { fileExists } from "@/lib/fs";
import { log } from "@/lib/log";
import { loadPreset } from "@/lib/preset-utils";

export type BuildOptions = {
  input: string;
  out?: string;
  bundleBase?: string;
  compact?: boolean;
  validateOnly?: boolean;
};

export type BuildResult = {
  presets: number;
  entries: number;
  bundles: number;
  outputDir: string | null;
  validateOnly: boolean;
};

export async function buildRegistry(
  options: BuildOptions
): Promise<BuildResult> {
  const inputDir = options.input;
  const outputDir = options.out ?? null;
  const compact = Boolean(options.compact);
  const validateOnly = Boolean(options.validateOnly);

  log.debug(`Discovering presets in ${inputDir}`);
  const presetDirs = await discoverPresetDirs(inputDir);

  if (presetDirs.length === 0) {
    throw new Error(
      `No presets found in "${inputDir}". Each preset needs an ${PRESET_CONFIG_FILENAME} file.`
    );
  }

  log.debug(`Found ${presetDirs.length} preset(s)`);

  const presets: PresetInput[] = [];

  for (const presetDir of presetDirs) {
    const slug = basename(presetDir);
    log.debug(`Loading preset: ${slug}`);
    const preset = await loadPreset(presetDir);
    presets.push(preset);
  }

  const result = await buildPresetRegistry({
    presets,
    bundleBase: options.bundleBase,
  });

  if (validateOnly || !outputDir) {
    return {
      presets: presets.length,
      entries: result.entries.length,
      bundles: result.bundles.length,
      outputDir: null,
      validateOnly,
    };
  }

  log.debug(`Writing output to ${outputDir}`);
  await mkdir(outputDir, { recursive: true });

  const indent = compact ? undefined : 2;

  // Write bundles to r/{slug}/{platform}/{version} and r/{slug}/{platform}/latest
  for (const bundle of result.bundles) {
    const bundleDir = join(
      outputDir,
      STATIC_BUNDLE_DIR,
      bundle.slug,
      bundle.platform
    );
    await mkdir(bundleDir, { recursive: true });

    const bundleJson = JSON.stringify(bundle, null, indent);

    // Write versioned bundle
    await writeFile(join(bundleDir, bundle.version), bundleJson);

    // Write latest bundle (copy of current version)
    await writeFile(join(bundleDir, LATEST_VERSION), bundleJson);
  }

  // Write entries to api/presets/{slug}/{platform}/{version} and api/presets/{slug}/{platform}/latest
  for (const entry of result.entries) {
    const apiPresetDir = join(
      outputDir,
      API_ENDPOINTS.presets.base,
      entry.slug,
      entry.platform
    );
    await mkdir(apiPresetDir, { recursive: true });

    const entryJson = JSON.stringify(entry, null, indent);

    // Write versioned entry
    await writeFile(join(apiPresetDir, entry.version), entryJson);

    // Write latest entry (copy of current version)
    await writeFile(join(apiPresetDir, LATEST_VERSION), entryJson);
  }

  // Write registry.json (array of all entries wrapped in schema-compliant format)
  const registryJson = JSON.stringify(
    {
      $schema: "https://agentrules.directory/schema/registry.json",
      items: result.entries,
    },
    null,
    indent
  );
  await writeFile(join(outputDir, "registry.json"), registryJson);

  // Write registry.index.json (name → entry lookup)
  const indexJson = JSON.stringify(result.index, null, indent);
  await writeFile(join(outputDir, "registry.index.json"), indexJson);

  return {
    presets: presets.length,
    entries: result.entries.length,
    bundles: result.bundles.length,
    outputDir,
    validateOnly: false,
  };
}

async function discoverPresetDirs(inputDir: string): Promise<string[]> {
  const presetDirs: string[] = [];

  async function searchDir(dir: string, depth: number): Promise<void> {
    if (depth > 3) return; // Limit recursion depth

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const subDir = join(dir, entry.name);
      const configPath = join(subDir, PRESET_CONFIG_FILENAME);

      if (await fileExists(configPath)) {
        presetDirs.push(subDir);
      } else {
        await searchDir(subDir, depth + 1);
      }
    }
  }

  await searchDir(inputDir, 0);
  return presetDirs.sort();
}
