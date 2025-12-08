/**
 * CLI Publish Command
 *
 * Publishes a preset to the AGENT_RULES registry.
 * Requires authentication - run `agentrules login` first.
 */

import {
  buildPresetPublishInput,
  type PresetInput,
  type PresetPublishInput,
} from "@agentrules/core";
import { dirname } from "path";
import { validatePreset } from "@/commands/preset/validate";
import { publishPreset } from "@/lib/api/presets";
import { useAppContext } from "@/lib/context";
import { getErrorMessage } from "@/lib/errors";
import { log } from "@/lib/log";
import { loadPreset, resolveConfigPath } from "@/lib/preset-utils";
import { ui } from "@/lib/ui";

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
  /** Major version. Defaults to 1 if not specified. */
  version?: number;
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
  const { path, version, dryRun = false } = options;

  log.debug(
    `Publishing preset from path: ${path ?? process.cwd()}${
      dryRun ? " (dry run)" : ""
    }`
  );

  const ctx = useAppContext();

  // Check authentication (skip for dry run)
  if (!(dryRun || (ctx.isLoggedIn && ctx.credentials))) {
    const error = "Not logged in. Run `agentrules login` to authenticate.";
    log.error(error);
    return { success: false, error };
  }

  if (!dryRun) {
    log.debug(`Authenticated as user, publishing to ${ctx.registry.url}`);
  }

  const spinner = await log.spinner("Validating preset...");

  // Resolve and validate preset first
  const configPath = await resolveConfigPath(path);
  const presetDir = dirname(configPath);
  log.debug(`Resolved config path: ${configPath}`);

  const validation = await validatePreset({ path: configPath });
  if (!validation.valid) {
    spinner.fail("Validation failed");
    for (const error of validation.errors) {
      log.error(error);
    }
    return {
      success: false,
      error: validation.errors.join("; "),
    };
  }

  spinner.update("Loading preset...");

  let presetInput: PresetInput;
  try {
    presetInput = await loadPreset(presetDir);
    log.debug(
      `Loaded preset "${presetInput.name}" for platform ${presetInput.config.platform}`
    );
  } catch (error) {
    const message = getErrorMessage(error);
    spinner.fail("Failed to load preset");
    log.error(message);
    return { success: false, error: message };
  }

  // Build publish input (version is assigned by registry)
  spinner.update("Building bundle...");

  let publishInput: PresetPublishInput;

  try {
    publishInput = await buildPresetPublishInput({
      preset: presetInput,
      version,
    });
    log.debug(`Built publish input for ${publishInput.platform}`);
  } catch (error) {
    const message = getErrorMessage(error);
    spinner.fail("Failed to build bundle");
    log.error(message);
    return { success: false, error: message };
  }

  // Calculate size for validation and display
  const inputJson = JSON.stringify(publishInput);
  const inputSize = Buffer.byteLength(inputJson, "utf8");
  const fileCount = publishInput.files.length;

  log.debug(
    `Publish input size: ${formatBytes(inputSize)}, files: ${fileCount}`
  );

  // Validate input size
  if (inputSize > MAX_BUNDLE_SIZE_BYTES) {
    const errorMessage = `Bundle exceeds maximum size (${formatBytes(
      inputSize
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
    log.print(ui.keyValue("Preset", publishInput.title));
    log.print(ui.keyValue("Name", publishInput.name));
    log.print(ui.keyValue("Platform", publishInput.platform));
    log.print(
      ui.keyValue(
        "Version",
        version ? `${version}.x (auto-assigned minor)` : "1.x (auto-assigned)"
      )
    );
    log.print(
      ui.keyValue("Files", `${fileCount} file${fileCount === 1 ? "" : "s"}`)
    );
    log.print(ui.keyValue("Size", formatBytes(inputSize)));
    log.print("");
    log.print(
      ui.fileTree(publishInput.files, {
        showFolderSizes: true,
        header: "Files to publish",
      })
    );
    log.print("");
    log.print(ui.hint("Run without --dry-run to publish."));

    return {
      success: true,
      preview: {
        slug: publishInput.name, // Preview uses name (full slug assigned by registry)
        platform: publishInput.platform,
        title: publishInput.title,
        totalSize: inputSize,
        fileCount,
      },
    };
  }

  // Publish to the API
  spinner.update(
    `Publishing ${publishInput.title} (${publishInput.platform})...`
  );

  // At this point we know credentials exist (checked earlier, and dry-run exits before here)
  if (!ctx.credentials) {
    throw new Error("Credentials should exist at this point");
  }

  const result = await publishPreset(
    ctx.registry.url,
    ctx.credentials.token,
    publishInput
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

  // Show published files
  log.print("");
  log.print(
    ui.fileTree(publishInput.files, {
      showFolderSizes: true,
      header: "Published files",
    })
  );

  // Show registry page URL
  const presetName = `${data.slug}.${data.platform}`;
  const presetRegistryUrl = `${ctx.registry.url}preset/${presetName}`;
  log.info("");
  log.info(ui.keyValue("Now live at", ui.link(presetRegistryUrl)));

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
