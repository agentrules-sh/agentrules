import {
  buildRegistryData,
  generateDateVersion,
  normalizeBundlePublicBase,
  PLATFORMS,
  PRESET_CONFIG_FILENAME,
  type RegistryPresetInput,
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
  version: string;
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
  const bundleBase = normalizeBundlePublicBase(options.bundleBase ?? "/r");
  const compact = Boolean(options.compact);
  const validateOnly = Boolean(options.validateOnly);

  // Generate date-based version for this build
  const version = generateDateVersion();

  log.debug(`Discovering presets in ${inputDir}`);
  const presetDirs = await discoverPresetDirs(inputDir);

  if (presetDirs.length === 0) {
    throw new Error(
      `No presets found in "${inputDir}". Each preset needs an ${PRESET_CONFIG_FILENAME} file.`
    );
  }

  log.debug(`Found ${presetDirs.length} preset(s)`);

  const presets: RegistryPresetInput[] = [];

  for (const presetDir of presetDirs) {
    const slug = basename(presetDir);
    log.debug(`Loading preset: ${slug}`);
    const preset = await loadPreset(presetDir);
    presets.push(preset);
  }

  const result = await buildRegistryData({ bundleBase, presets, version });

  if (validateOnly || !outputDir) {
    return {
      presets: presets.length,
      entries: result.entries.length,
      bundles: result.bundles.length,
      version,
      outputDir: null,
      validateOnly,
    };
  }

  log.debug(`Writing output to ${outputDir}`);
  await mkdir(outputDir, { recursive: true });

  const indent = compact ? undefined : 2;

  // Write registry.index.json (lookup by name)
  const indexPath = join(outputDir, "registry.index.json");
  await writeFile(indexPath, JSON.stringify(result.index, null, indent));
  log.debug(`Wrote ${indexPath}`);

  // Write registry.json (array of entries for listing)
  const registryPath = join(outputDir, "registry.json");
  await writeFile(registryPath, JSON.stringify(result.entries, null, indent));
  log.debug(`Wrote ${registryPath}`);

  // Write individual bundle files (both versioned and latest)
  for (const bundle of result.bundles) {
    const bundleDir = join(outputDir, bundle.slug);
    await mkdir(bundleDir, { recursive: true });

    const bundleJson = JSON.stringify(bundle, null, indent);

    // Write versioned bundle: {slug}/{platform}.{version}.json
    const versionedPath = join(
      bundleDir,
      `${bundle.platform}.${bundle.version}.json`
    );
    await writeFile(versionedPath, bundleJson);

    // Write latest bundle: {slug}/{platform}.json (for O(1) lookup without version)
    const latestPath = join(bundleDir, `${bundle.platform}.json`);
    await writeFile(latestPath, bundleJson);

    log.debug(`Wrote bundle: ${bundle.slug}/${bundle.platform}`);
  }

  return {
    presets: presets.length,
    entries: result.entries.length,
    bundles: result.bundles.length,
    version,
    outputDir,
    validateOnly: false,
  };
}

async function discoverPresetDirs(inputDir: string): Promise<string[]> {
  const entries = await readdir(inputDir, { withFileTypes: true });
  const presetDirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const presetDir = join(inputDir, entry.name);
    const configPath = join(presetDir, PRESET_CONFIG_FILENAME);

    if (await fileExists(configPath)) {
      presetDirs.push(presetDir);
    }
  }

  return presetDirs.sort();
}

async function loadPreset(presetDir: string): Promise<RegistryPresetInput> {
  const slug = basename(presetDir);
  const configPath = join(presetDir, PRESET_CONFIG_FILENAME);
  const configRaw = await readFile(configPath, "utf8");

  let configJson: unknown;
  try {
    configJson = JSON.parse(configRaw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }

  const config = validatePresetConfig(configJson, slug);

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
