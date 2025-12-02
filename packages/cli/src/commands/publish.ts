/**
 * CLI Publish Command
 *
 * Publishes a preset to the AGENT_RULES registry.
 * Requires authentication - run `agentrules login` first.
 */

import {
  buildRegistryData,
  generateDateVersion,
  PLATFORMS,
  PRESET_CONFIG_FILENAME,
  type RegistryBundle,
  type RegistryPresetInput,
  validatePresetConfig,
} from "@agentrules/core";
import { readdir, readFile } from "fs/promises";
import { dirname, join, relative } from "path";
import { publishPreset } from "@/lib/api/presets";
import { useAppContext } from "@/lib/context";
import { directoryExists, fileExists } from "@/lib/fs";
import { log } from "@/lib/log";
import { resolveConfigPath } from "@/lib/preset-utils";
import { ui } from "@/lib/ui";

const INSTALL_FILENAME = "INSTALL.txt";
const README_FILENAME = "README.md";
const LICENSE_FILENAME = "LICENSE.md";

/** Maximum size per bundle in bytes (1MB) */
const MAX_BUNDLE_SIZE_BYTES = 1 * 1024 * 1024;

/**
 * Formats bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type PublishOptions = {
  /** Path to agentrules.json or directory containing it */
  path?: string;
  /** Preview what would be published without actually publishing */
  dryRun?: boolean;
};

export type PublishResult = {
  /** Whether publish was successful */
  success: boolean;
  /** Error message if publish failed */
  error?: string;
  /** Published preset info if successful */
  preset?: {
    slug: string;
    platform: string;
    title: string;
    version: string;
    isNewPreset: boolean;
    bundleUrl: string;
  };
  /** Dry run preview info */
  preview?: {
    slug: string;
    platform: string;
    title: string;
    version: string;
    totalSize: number;
    fileCount: number;
  };
};

/**
 * Publishes a preset to the registry
 */
export async function publish(
  options: PublishOptions = {}
): Promise<PublishResult> {
  const { path, dryRun = false } = options;

  log.debug(
    `Publishing preset from path: ${path ?? process.cwd()}${
      dryRun ? " (dry run)" : ""
    }`
  );

  // Get app context
  const ctx = useAppContext();
  if (!ctx) {
    throw new Error("App context not initialized");
  }

  // Check authentication (skip for dry run)
  if (!(dryRun || (ctx.isLoggedIn && ctx.credentials))) {
    log.error(
      `Not logged in. Run ${ui.command("agentrules login")} to authenticate.`
    );
    return {
      success: false,
      error: `Not logged in. Run ${ui.command(
        "agentrules login"
      )} to authenticate.`,
    };
  }

  if (!dryRun) {
    log.debug(`Authenticated as user, publishing to ${ctx.registry.apiUrl}`);
  }

  const spinner = await log.spinner("Loading preset...");

  // Resolve and load preset
  const configPath = await resolveConfigPath(path);
  const presetDir = dirname(configPath);
  log.debug(`Resolved config path: ${configPath}`);

  let presetInput: RegistryPresetInput;
  try {
    presetInput = await loadPreset(presetDir);
    log.debug(
      `Loaded preset "${presetInput.slug}" for platform ${presetInput.config.platform}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    spinner.fail("Failed to load preset");
    log.error(errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }

  // Build bundle
  spinner.update("Building bundle...");

  const version = generateDateVersion();
  let bundle: RegistryBundle;

  try {
    const result = await buildRegistryData({
      presets: [presetInput],
      version,
    });
    if (result.bundles.length === 0) {
      throw new Error("No bundle was generated");
    }
    bundle = result.bundles[0];
    log.debug(`Built bundle for ${bundle.platform} with version ${version}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    spinner.fail("Failed to build bundle");
    log.error(errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }

  // Calculate size for validation and display
  const bundleJson = JSON.stringify(bundle);
  const bundleSize = Buffer.byteLength(bundleJson, "utf8");
  const fileCount = bundle.files.length;

  log.debug(`Bundle size: ${formatBytes(bundleSize)}, files: ${fileCount}`);

  // Validate bundle size
  if (bundleSize > MAX_BUNDLE_SIZE_BYTES) {
    const errorMessage = `Bundle exceeds maximum size (${formatBytes(
      bundleSize
    )} > ${formatBytes(MAX_BUNDLE_SIZE_BYTES)})`;
    spinner.fail("Bundle too large");
    log.error(errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }

  // Dry run: show preview and exit
  if (dryRun) {
    spinner.success("Dry run complete");
    log.print("");
    log.print(ui.header("Publish Preview"));
    log.print(ui.keyValue("Preset", presetInput.config.title));
    log.print(ui.keyValue("Slug", presetInput.slug));
    log.print(ui.keyValue("Platform", bundle.platform));
    log.print(ui.keyValue("Version", ui.version(version)));
    log.print(
      ui.keyValue("Files", `${fileCount} file${fileCount === 1 ? "" : "s"}`)
    );
    log.print(ui.keyValue("Size", formatBytes(bundleSize)));
    log.print("");
    log.print(ui.hint("Run without --dry-run to publish."));

    return {
      success: true,
      preview: {
        slug: presetInput.slug,
        platform: bundle.platform,
        title: presetInput.config.title,
        version,
        totalSize: bundleSize,
        fileCount,
      },
    };
  }

  // Publish to the API
  spinner.update(
    `Publishing ${presetInput.config.title} ${ui.version(version)} (${
      bundle.platform
    })...`
  );

  // At this point we know credentials exist (checked earlier, and dry-run exits before here)
  if (!ctx.credentials) {
    throw new Error("Credentials should exist at this point");
  }

  const result = await publishPreset(
    ctx.registry.apiUrl,
    ctx.credentials.token,
    bundle
  );

  if (!result.success) {
    if (result.issues) {
      const issueMessages = result.issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("\n  - ");
      const errorMessage = `Validation failed:\n  - ${issueMessages}`;
      spinner.fail("Validation failed");
      log.error(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }

    spinner.fail("Publish failed");
    log.error(result.error);

    if (result.error.includes("connect")) {
      log.info(ui.hint("Check your network connection and try again."));
    }

    return {
      success: false,
      error: result.error,
    };
  }

  const { data } = result;
  const action = data.isNewPreset ? "Published new preset" : "Published";
  spinner.success(
    `${action} ${ui.code(data.slug)} ${ui.version(data.version)} (${
      data.platform
    })`
  );

  // Show bundle URL
  log.info("");
  log.info(ui.keyValue("Download URL", ui.link(data.bundleUrl)));

  return {
    success: true,
    preset: {
      slug: data.slug,
      platform: data.platform,
      title: data.title,
      version: data.version,
      isNewPreset: data.isNewPreset,
      bundleUrl: data.bundleUrl,
    },
  };
}

/**
 * Load a preset from a directory
 */
async function loadPreset(presetDir: string): Promise<RegistryPresetInput> {
  const configPath = join(presetDir, PRESET_CONFIG_FILENAME);

  if (!(await fileExists(configPath))) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configRaw = await readFile(configPath, "utf8");

  let configJson: unknown;
  try {
    configJson = JSON.parse(configRaw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }

  // Use name from config if available, otherwise show path for clarity
  const configObj = configJson as Record<string, unknown> | null;
  const identifier =
    typeof configObj?.name === "string" ? configObj.name : configPath;

  const config = validatePresetConfig(configJson, identifier);
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

/**
 * Recursively collect all files from a directory
 */
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

/**
 * Read a file if it exists, otherwise return undefined
 */
async function readFileIfExists(path: string): Promise<string | undefined> {
  if (await fileExists(path)) {
    return await readFile(path, "utf8");
  }
  return;
}
