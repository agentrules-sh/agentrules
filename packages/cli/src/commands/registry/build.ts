import {
  buildRegistryData,
  generateDateVersion,
  normalizeBundlePublicBase,
  PLATFORM_IDS,
  type RegistryPresetInput,
  validatePresetConfig,
} from "@agentrules/core";
import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import { basename, join, relative } from "path";

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

const CONFIG_FILENAME = "agentrules.json";
const INSTALL_FILENAME = "INSTALL.txt";
const README_FILENAME = "README.md";

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

  const presetDirs = await discoverPresetDirs(inputDir);

  if (presetDirs.length === 0) {
    throw new Error(
      `No presets found in "${inputDir}". Each preset needs an ${CONFIG_FILENAME} file.`
    );
  }

  const presets: RegistryPresetInput[] = [];

  for (const presetDir of presetDirs) {
    const preset = await loadPreset(presetDir);
    presets.push(preset);
  }

  const result = buildRegistryData({ bundleBase, presets, version });

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

  await mkdir(outputDir, { recursive: true });

  const indent = compact ? undefined : 2;

  // Write registry.index.json (lookup by name)
  const indexPath = join(outputDir, "registry.index.json");
  await writeFile(indexPath, JSON.stringify(result.index, null, indent));

  // Write registry.json (array of entries for listing)
  const registryPath = join(outputDir, "registry.json");
  await writeFile(registryPath, JSON.stringify(result.entries, null, indent));

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
    const configPath = join(presetDir, CONFIG_FILENAME);

    if (await fileExists(configPath)) {
      presetDirs.push(presetDir);
    }
  }

  return presetDirs.sort();
}

async function loadPreset(presetDir: string): Promise<RegistryPresetInput> {
  const slug = basename(presetDir);
  const configPath = join(presetDir, CONFIG_FILENAME);
  const configRaw = await readFile(configPath, "utf8");

  let configJson: unknown;
  try {
    configJson = JSON.parse(configRaw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }

  const config = validatePresetConfig(configJson, slug);

  // Read preset-level INSTALL.txt (default for all platforms)
  const presetInstallPath = join(presetDir, INSTALL_FILENAME);
  const presetInstallMessage = await readFileIfExists(presetInstallPath);

  // Read preset README.md for registry display
  const readmePath = join(presetDir, README_FILENAME);
  const readme = await readFileIfExists(readmePath);

  const platforms: RegistryPresetInput["platforms"] = [];

  for (const platformId of PLATFORM_IDS) {
    const platformConfig = config.platforms[platformId];
    if (!platformConfig) continue;

    const platformDir = join(presetDir, platformConfig.path);

    if (!(await directoryExists(platformDir))) {
      throw new Error(
        `Platform directory not found: ${platformDir} (referenced in ${configPath})`
      );
    }

    // Read platform-level INSTALL.txt (overrides preset-level)
    // Platform INSTALL.txt is at {presetDir}/{platformId}/INSTALL.txt
    const platformInstallPath = join(presetDir, platformId, INSTALL_FILENAME);
    const platformInstallMessage = await readFileIfExists(platformInstallPath);

    // Resolution order: platform INSTALL.txt > preset INSTALL.txt > JSON field
    const installMessage =
      platformInstallMessage ??
      presetInstallMessage ??
      platformConfig.installMessage;

    if (installMessage !== undefined) {
      platformConfig.installMessage = installMessage;
    }

    const files = await collectFiles(platformDir);

    platforms.push({
      platform: platformId,
      files,
    });
  }

  if (platforms.length === 0) {
    throw new Error(
      `No valid platforms found in ${configPath}. Check that platform paths exist.`
    );
  }

  return { slug, config, platforms, readme };
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

async function fileExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function readFileIfExists(path: string): Promise<string | undefined> {
  try {
    const stats = await stat(path);
    if (stats.isFile()) {
      return await readFile(path, "utf8");
    }
  } catch {
    // File doesn't exist
  }
  return;
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
