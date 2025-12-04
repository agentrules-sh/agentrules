import {
  API_ENDPOINTS,
  buildPresetRegistry,
  LATEST_VERSION,
  PLATFORMS,
  PRESET_CONFIG_FILENAME,
  type PresetInput,
  STATIC_BUNDLE_DIR,
  validatePresetConfig,
} from "@agentrules/core";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { basename, join, relative } from "path";
import { directoryExists, fileExists } from "@/lib/fs";
import { log } from "@/lib/log";

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

const INSTALL_FILENAME = "INSTALL.txt";
const README_FILENAME = "README.md";
const LICENSE_FILENAME = "LICENSE.md";

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

async function loadPreset(presetDir: string): Promise<PresetInput> {
  const configPath = join(presetDir, PRESET_CONFIG_FILENAME);
  const configRaw = await readFile(configPath, "utf8");

  let configJson: unknown;
  try {
    configJson = JSON.parse(configRaw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }

  const config = validatePresetConfig(configJson, basename(presetDir));
  const slug = config.name;

  // Read INSTALL.txt for install message
  const installPath = join(presetDir, INSTALL_FILENAME);
  const installMessage = await readFileIfExists(installPath);

  // Read preset README.md for registry display
  const readmePath = join(presetDir, README_FILENAME);
  const readmeContent = await readFileIfExists(readmePath);

  // Read preset LICENSE.md for registry display
  const licensePath = join(presetDir, LICENSE_FILENAME);
  const licenseContent = await readFileIfExists(licensePath);

  // Default to platform's standard projectDir if path not specified
  const filesPath = config.path ?? PLATFORMS[config.platform].projectDir;
  const filesDir = join(presetDir, filesPath);

  if (!(await directoryExists(filesDir))) {
    throw new Error(
      `Files directory not found: ${filesDir} (referenced in ${configPath})`
    );
  }

  const files = await collectFiles(filesDir);

  if (files.length === 0) {
    throw new Error(
      `No files found in ${filesDir}. Presets must include at least one file.`
    );
  }

  return { slug, config, files, installMessage, readmeContent, licenseContent };
}

async function collectFiles(
  dir: string,
  baseDir?: string
): Promise<Array<{ path: string; contents: string }>> {
  const root = baseDir ?? dir;
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{ path: string; contents: string }> = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = await collectFiles(fullPath, root);
      files.push(...nested);
    } else if (entry.isFile()) {
      const contents = await readFile(fullPath, "utf8");
      const relativePath = relative(root, fullPath);
      files.push({ path: relativePath, contents });
    }
  }

  return files;
}

async function readFileIfExists(path: string): Promise<string | undefined> {
  if (await fileExists(path)) {
    return await readFile(path, "utf8");
  }
  return;
}
