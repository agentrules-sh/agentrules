/**
 * CLI Publish Command
 *
 * Publishes a rule to the AGENT_RULES registry.
 * Requires authentication - run `agentrules login` first.
 */

import {
  buildPublishInput,
  descriptionSchema,
  getInstallPath,
  getValidTypes,
  inferInstructionPlatformsFromFileName,
  inferPlatformFromPath,
  inferTypeFromPath,
  nameSchema,
  normalizePlatformInput,
  PLATFORM_IDS,
  type PlatformId,
  RULE_CONFIG_FILENAME,
  RULE_SCHEMA_URL,
  type RuleInput,
  type RulePublishInput,
  type RuleType,
  supportsInstallPath,
  tagsSchema,
  validateRule as validateRuleConfig,
} from "@agentrules/core";
import * as p from "@clack/prompts";
import { readFile, stat } from "fs/promises";
import { basename } from "path";
import { z } from "zod";
import { publishRule } from "@/lib/api/rules";
import { useAppContext } from "@/lib/context";
import { getErrorMessage } from "@/lib/errors";
import { log } from "@/lib/log";
import {
  collectMetadata,
  collectPlatformFiles,
  type LoadConfigOverrides,
  loadConfig,
  normalizeName,
  parsePlatformSelection,
  parseSkillFrontmatter,
  resolveConfigPath,
  SKILL_FILENAME,
  toTitleCase,
} from "@/lib/rule-utils";
import { ui } from "@/lib/ui";
import { check } from "@/lib/zod-validator";
import { detectSkillDirectory } from "./rule/init";

/** Maximum size per variant/platform bundle in bytes (1MB) */
const MAX_VARIANT_SIZE_BYTES = 1 * 1024 * 1024;

/** Schema for parsing comma-separated tags input */
const tagsInputSchema = z
  .string()
  .transform((input) =>
    input
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
  )
  .pipe(tagsSchema);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type PublishOptions = {
  /** Path to agentrules.json, a directory containing it, or a single file to publish */
  path?: string;
  /** Major version. Defaults to 1 if not specified. */
  version?: number;
  /** Preview what would be published without actually publishing */
  dryRun?: boolean;
  /** Skip prompts (fail if required flags missing for single-file publish) */
  yes?: boolean;

  /** Publish-time override: rule name/slug (kebab-case) */
  name?: string;
  /**
   * Publish-time override:
   * - config mode: select platform variant(s) (repeatable/comma-separated)
   * - file mode: set platform (must resolve to exactly one)
   */
  platform?: string | string[];
  /** Publish-time override: rule type */
  type?: string;
  /** Publish-time override: title */
  title?: string;
  /** Publish-time override: description */
  description?: string;
  /** Publish-time override: tags */
  tags?: string[];
  /** Publish-time override: license SPDX identifier */
  license?: string;
};

export type PublishResult = {
  /** Whether publish was successful */
  success: boolean;
  /** Error message if publish failed */
  error?: string;
  /** Published rule info if successful */
  rule?: {
    slug: string;
    title: string;
    version: string;
    isNew: boolean;
    variants: Array<{ platform: string; bundleUrl: string }>;
    url: string;
  };
  /** Dry run preview info */
  preview?: {
    slug: string;
    platforms: string[];
    title: string;
    totalSize: number;
    fileCount: number;
  };
};

/**
 * Publishes a rule to the registry.
 *
 * Supports:
 * - agentrules.json or a directory containing it
 * - a single file path (quick publish)
 */
export async function publish(
  options: PublishOptions = {}
): Promise<PublishResult> {
  const {
    path,
    version,
    dryRun = false,
    yes = false,
    name,
    platform,
    type,
    title,
    description,
    tags,
    license,
  } = options;

  log.debug(
    `Publishing rule from path: ${path ?? process.cwd()}${
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

  const filePath = await getSingleFilePath(path);
  const quickDir = await getQuickPublishDirectory(path);

  // Build publish input (version is assigned by registry)
  let publishInput: RulePublishInput;

  if (filePath) {
    // Quick publish: single file
    let resolved: QuickPublishInputs;

    try {
      resolved = await resolveQuickPublishInputs(
        {
          name,
          platform,
          type,
          title,
          description,
          tags,
          license,
        },
        { type: "file", path: filePath },
        { dryRun, yes }
      );
    } catch (error) {
      const message = getErrorMessage(error);
      log.error(message);
      return { success: false, error: message };
    }

    const fileSpinner = await log.spinner("Building bundle...");

    try {
      publishInput = await buildPublishInput({
        rule: await buildRuleInputFromQuickPublish(resolved),
        version,
      });
      log.debug(
        `Built publish input for platforms: ${publishInput.variants
          .map((v) => v.platform)
          .join(", ")}`
      );
    } catch (error) {
      const message = getErrorMessage(error);
      fileSpinner.fail("Failed to build bundle");
      log.error(message);
      return { success: false, error: message };
    }

    return await finalizePublish({
      publishInput,
      dryRun,
      version,
      spinner: fileSpinner,
      ctx,
    });
  }

  if (quickDir) {
    // Quick publish: directory (skill, etc.)
    let resolved: QuickPublishInputs;

    try {
      resolved = await resolveQuickPublishInputs(
        {
          name,
          platform,
          type,
          title,
          description,
          tags,
          license,
        },
        {
          type: "directory",
          path: quickDir.path,
          entryFile: quickDir.entryFile,
        },
        { dryRun, yes }
      );
    } catch (error) {
      const message = getErrorMessage(error);
      log.error(message);
      return { success: false, error: message };
    }

    const dirSpinner = await log.spinner("Building bundle...");

    try {
      publishInput = await buildPublishInput({
        rule: await buildRuleInputFromQuickPublish(resolved),
        version,
      });
      log.debug(
        `Built publish input for platforms: ${publishInput.variants
          .map((v) => v.platform)
          .join(", ")}`
      );
    } catch (error) {
      const message = getErrorMessage(error);
      dirSpinner.fail("Failed to build bundle");
      log.error(message);
      return { success: false, error: message };
    }

    return await finalizePublish({
      publishInput,
      dryRun,
      version,
      spinner: dirSpinner,
      ctx,
    });
  }

  // Config publish: agentrules.json
  const spinner = await log.spinner("Validating rule...");

  const configPath = await resolveConfigPath(path);
  log.debug(`Resolved config path: ${configPath}`);

  const configOverrides = buildConfigPublishOverrides({
    name,
    platform,
    type,
    title,
    description,
    tags,
    license,
  });

  spinner.update("Loading config...");

  let loadedConfig: Awaited<ReturnType<typeof loadConfig>>;
  try {
    loadedConfig = await loadConfig(configPath, configOverrides);
  } catch (error) {
    const message = getErrorMessage(error);
    spinner.fail("Validation failed");
    log.error(message);
    return { success: false, error: message };
  }

  const validation = validateRuleConfig(loadedConfig.config);
  if (!validation.valid) {
    spinner.fail("Validation failed");
    for (const validationError of validation.errors) {
      log.error(validationError);
    }
    return {
      success: false,
      error: validation.errors.join("; "),
    };
  }

  spinner.update("Loading metadata...");

  let ruleInput: RuleInput;
  try {
    const metadata = await collectMetadata(loadedConfig);

    spinner.update("Collecting files...");
    const platformFiles = await collectPlatformFiles(loadedConfig);

    ruleInput = {
      name: loadedConfig.config.name,
      config: loadedConfig.config,
      platformFiles,
      ...metadata,
    };

    const rulePlatforms = ruleInput.config.platforms
      .map((entry) => entry.platform)
      .join(", ");
    log.debug(
      `Loaded rule "${ruleInput.name}" for platforms: ${rulePlatforms}`
    );
  } catch (error) {
    const message = getErrorMessage(error);
    spinner.fail("Failed to load rule");
    log.error(message);
    return { success: false, error: message };
  }

  spinner.update("Building platform bundles...");

  try {
    publishInput = await buildPublishInput({
      rule: ruleInput,
      version,
    });
    log.debug(
      `Built publish input for platforms: ${publishInput.variants
        .map((v) => v.platform)
        .join(", ")}`
    );
  } catch (error) {
    const message = getErrorMessage(error);
    spinner.fail("Failed to build platform bundles");
    log.error(message);
    return { success: false, error: message };
  }

  return await finalizePublish({ publishInput, dryRun, version, spinner, ctx });
}

type QuickPublishOptions = {
  name?: string;
  platform?: string | string[];
  type?: string;
  title?: string;
  description?: string;
  tags?: string[];
  license?: string;
};

type QuickPublishSource =
  | { type: "file"; path: string }
  | { type: "directory"; path: string; entryFile: string };

type QuickPublishInputs = {
  source: QuickPublishSource;
  name: string;
  platforms: PlatformId[];
  ruleType: RuleType;
  title: string;
  description: string;
  tags: string[];
  license: string;
};

async function getSingleFilePath(inputPath: string | undefined) {
  if (!inputPath) return;
  const fileStat = await stat(inputPath).catch(() => null);
  if (!fileStat?.isFile()) return;
  if (basename(inputPath) === RULE_CONFIG_FILENAME) return;
  return inputPath;
}

type QuickPublishDirectory = {
  path: string;
  type: "skill";
  entryFile: string;
};

async function getQuickPublishDirectory(
  inputPath: string | undefined
): Promise<QuickPublishDirectory | undefined> {
  if (!inputPath) return;

  const pathStat = await stat(inputPath).catch(() => null);
  if (!pathStat?.isDirectory()) return;

  // Check if directory has agentrules.json - if so, use config publish
  const configStat = await stat(`${inputPath}/${RULE_CONFIG_FILENAME}`).catch(
    () => null
  );
  if (configStat?.isFile()) return;

  // Check for SKILL.md - skill directory quick publish
  const skillPath = `${inputPath}/${SKILL_FILENAME}`;
  const skillStat = await stat(skillPath).catch(() => null);
  if (skillStat?.isFile()) {
    return {
      path: inputPath,
      type: "skill",
      entryFile: skillPath,
    };
  }

  return;
}

function normalizePathForInference(value: string) {
  return value.replace(/\\/g, "/");
}

function stripExtension(value: string) {
  return value.replace(/\.[^/.]+$/, "");
}

type InferredDefaults = {
  platform?: PlatformId;
  ruleType?: RuleType;
  name?: string;
  license?: string;
};

function inferFileDefaults(filePath: string): InferredDefaults {
  const normalized = normalizePathForInference(filePath);
  const segments = normalized.split("/").filter(Boolean);
  const fileName = segments.at(-1) ?? "";

  const instructionPlatforms = inferInstructionPlatformsFromFileName(fileName);
  if (instructionPlatforms.length > 0) {
    return {
      ruleType: "instruction",
      ...(instructionPlatforms.length === 1
        ? { platform: instructionPlatforms[0] }
        : {}),
    };
  }

  const platform = inferPlatformFromPath(filePath);

  if (!platform) {
    return {
      name: normalizeName(stripExtension(fileName)),
    };
  }

  const inferredType = inferTypeFromPath(platform, filePath) as
    | RuleType
    | undefined;

  const result: InferredDefaults = { platform };

  if (inferredType) {
    result.ruleType = inferredType;
    if (inferredType !== "instruction") {
      result.name = normalizeName(stripExtension(fileName));
    }
  }

  return result;
}

async function inferDirectoryDefaults(
  _dirPath: string,
  entryFile: string,
  dirType: "skill"
): Promise<InferredDefaults> {
  const result: InferredDefaults = {};

  if (dirType === "skill") {
    result.ruleType = "skill";

    // Parse frontmatter for name and license
    const content = await readFile(entryFile, "utf8");
    const frontmatter = parseSkillFrontmatter(content);

    if (frontmatter.name) {
      result.name = normalizeName(frontmatter.name);
    }
    if (frontmatter.license) {
      result.license = frontmatter.license;
    }
  }

  return result;
}

function buildConfigPublishOverrides(options: {
  name?: string;
  platform?: string | string[];
  type?: string;
  title?: string;
  description?: string;
  tags?: string[];
  license?: string;
}): LoadConfigOverrides | undefined {
  const overrides: LoadConfigOverrides = {};

  if (options.name !== undefined) overrides.name = options.name;
  if (options.platform !== undefined) overrides.platform = options.platform;
  if (options.type !== undefined) overrides.type = options.type;
  if (options.title !== undefined) overrides.title = options.title;
  if (options.description !== undefined) {
    overrides.description = options.description;
  }
  if (options.license !== undefined) overrides.license = options.license;
  if (options.tags !== undefined) overrides.tags = options.tags;

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

async function resolveQuickPublishInputs(
  options: QuickPublishOptions,
  source: QuickPublishSource,
  ctx: { dryRun: boolean; yes: boolean }
): Promise<QuickPublishInputs> {
  const isInteractive = !ctx.yes && process.stdin.isTTY;
  const isDirectory = source.type === "directory";

  // Detect skill directory and prompt (like init-interactive)
  let useSkillDefaults = false;
  let skillInfo: Awaited<ReturnType<typeof detectSkillDirectory>> | undefined;

  if (isDirectory) {
    skillInfo = await detectSkillDirectory(source.path);

    if (skillInfo && isInteractive) {
      const confirm = await p.confirm({
        message: `Detected SKILL.md${skillInfo.name ? ` (${skillInfo.name})` : ""}. Publish as skill?`,
        initialValue: true,
      });

      if (p.isCancel(confirm)) {
        throw new Error("Cancelled");
      }

      if (!confirm) {
        throw new Error(
          "Directory contains SKILL.md but no agentrules.json. Use `agentrules init` to create a config, or publish as a skill."
        );
      }

      useSkillDefaults = true;
    } else if (skillInfo) {
      // Non-interactive with skill detected - use skill defaults
      useSkillDefaults = true;
    }
  }

  // Get inferred defaults based on source type
  const inferred =
    source.type === "file"
      ? inferFileDefaults(source.path)
      : useSkillDefaults
        ? await inferDirectoryDefaults(source.path, source.entryFile, "skill")
        : {};

  // For directories, type is inferred from entry file (e.g., SKILL.md → skill)
  // For files, we may need name/platform/type from CLI args
  const hasRequiredArgs = isDirectory
    ? options.platform !== undefined &&
      (options.name !== undefined || inferred.name !== undefined)
    : options.name !== undefined &&
      options.platform !== undefined &&
      options.type !== undefined;

  if (!(isInteractive || hasRequiredArgs)) {
    if (isDirectory) {
      throw new Error(
        "Publishing a directory in non-interactive mode requires --platform (and --name if not in frontmatter)."
      );
    }
    throw new Error(
      "Publishing a single file in non-interactive mode requires --name, --platform, and --type."
    );
  }

  const parsedPlatforms = options.platform
    ? parsePlatformSelection(options.platform).map(normalizePlatformInput)
    : undefined;

  let selectedPlatforms: PlatformId[] =
    parsedPlatforms && parsedPlatforms.length > 0
      ? parsedPlatforms
      : inferred.platform
        ? [inferred.platform]
        : [];

  if (selectedPlatforms.length === 0) {
    if (!isInteractive) {
      throw new Error("Missing --platform");
    }

    const selection = await p.multiselect({
      message: `Platforms ${ui.dim("(space to toggle, 'a' to select all)")}`,
      options: PLATFORM_IDS.map((id) => ({ value: id, label: id })),
      required: true,
    });

    if (p.isCancel(selection)) {
      throw new Error("Cancelled");
    }

    selectedPlatforms = selection as PlatformId[];
  }

  // For directories, type is already inferred; for files, check options/inferred
  let selectedType: RuleType | undefined = (options.type ??
    inferred.ruleType) as RuleType | undefined;

  if (!selectedType) {
    if (!isInteractive) {
      throw new Error("Missing --type");
    }

    // Find types valid for all selected platforms
    const candidateSets = selectedPlatforms.map((plat) =>
      getValidTypes(plat).filter((t) =>
        supportsInstallPath({
          platform: plat,
          type: t,
          scope: "project",
        })
      )
    );

    const candidates =
      candidateSets.length === 1
        ? candidateSets[0]
        : candidateSets.reduce((acc, set) =>
            acc.filter((t) => set.includes(t))
          );

    if (candidates.length === 0) {
      throw new Error(
        `No common type supports all selected platforms: ${selectedPlatforms.join(", ")}`
      );
    }

    const selection = await p.select({
      message: "Type",
      options: candidates.map((t) => ({ value: t, label: t })),
    });

    if (p.isCancel(selection)) {
      throw new Error("Cancelled");
    }

    selectedType = selection as RuleType;
  }

  const platforms = selectedPlatforms;
  const ruleType = selectedType as RuleType;

  // Validate CLI-provided type works for all platforms
  if (options.type) {
    for (const platform of platforms) {
      if (
        !supportsInstallPath({ platform, type: ruleType, scope: "project" })
      ) {
        throw new Error(
          `Type "${ruleType}" is not supported for project installs on platform "${platform}".`
        );
      }
    }
  }

  // Name: CLI option > inferred (from frontmatter or filename) > prompt
  const nameValue =
    options.name ??
    inferred.name ??
    (await (async () => {
      if (!isInteractive) {
        throw new Error("Missing --name");
      }

      const input = await p.text({
        message: "Rule name",
        placeholder: "my-rule",
        validate: check(nameSchema),
      });

      if (p.isCancel(input)) {
        throw new Error("Cancelled");
      }

      return input;
    })());

  const normalizedName = normalizeName(nameValue);
  const nameCheck = nameSchema.safeParse(normalizedName);
  if (!nameCheck.success) {
    throw new Error(nameCheck.error.issues[0]?.message ?? "Invalid name");
  }

  const defaultTitle = toTitleCase(normalizedName);
  const finalTitle =
    options.title ??
    (await (async () => {
      if (!isInteractive) {
        return defaultTitle;
      }

      const input = await p.text({
        message: "Title",
        defaultValue: defaultTitle,
        placeholder: defaultTitle,
      });

      if (p.isCancel(input)) {
        throw new Error("Cancelled");
      }

      return input;
    })());

  const finalDescription =
    options.description ??
    (await (async () => {
      if (!isInteractive) {
        return "";
      }

      const input = await p.text({
        message: "Description (optional)",
        placeholder: "Describe what this rule does...",
        validate: check(descriptionSchema),
      });

      if (p.isCancel(input)) {
        throw new Error("Cancelled");
      }

      return input;
    })());

  const finalTags = await (async () => {
    if (options.tags) {
      return tagsSchema.parse(options.tags);
    }

    if (!isInteractive) {
      return [];
    }

    const input = await p.text({
      message: "Tags (optional)",
      placeholder: "comma-separated, e.g. typescript, react",
    });

    if (p.isCancel(input)) {
      throw new Error("Cancelled");
    }

    return tagsInputSchema.parse(input ?? "");
  })();

  // License: CLI option > inferred (from frontmatter) > default MIT
  const finalLicense = options.license ?? inferred.license ?? "MIT";

  if (isInteractive && !ctx.dryRun) {
    log.print("");
    log.print(ui.header("Quick publish"));
    log.print(
      ui.keyValue(isDirectory ? "Directory" : "File", ui.path(source.path))
    );
    log.print(ui.keyValue("Name", ui.code(normalizedName)));
    log.print(ui.keyValue("Title", finalTitle));
    log.print(
      ui.keyValue("Description", finalDescription || ui.dim("No description"))
    );
    log.print(ui.keyValue("Platforms", platforms.join(", ")));
    log.print(ui.keyValue("Type", ruleType));
    if (finalTags.length > 0) {
      log.print(ui.keyValue("Tags", finalTags.join(", ")));
    }
    log.print("");

    const confirm = await p.confirm({
      message: isDirectory ? "Publish this directory?" : "Publish this file?",
      initialValue: true,
    });

    if (p.isCancel(confirm) || !confirm) {
      throw new Error("Cancelled");
    }
  }

  return {
    source,
    name: normalizedName,
    platforms,
    ruleType,
    title: finalTitle,
    description: finalDescription,
    tags: finalTags,
    license: finalLicense,
  };
}

async function buildRuleInputFromQuickPublish(
  inputs: QuickPublishInputs
): Promise<RuleInput> {
  const config: RuleInput["config"] = {
    $schema: RULE_SCHEMA_URL,
    name: inputs.name,
    type: inputs.ruleType,
    title: inputs.title,
    description: inputs.description,
    license: inputs.license,
    tags: inputs.tags,
    platforms: inputs.platforms.map((platform) => ({ platform })),
  };

  if (inputs.source.type === "file") {
    // Single file quick publish - same content for all platforms
    const content = await readFile(inputs.source.path);

    const platformFiles: RuleInput["platformFiles"] = [];

    for (const platform of inputs.platforms) {
      const bundlePath = getInstallPath({
        platform,
        type: inputs.ruleType,
        name: inputs.name,
        scope: "project",
      });

      if (!bundlePath) {
        throw new Error(
          `Type "${inputs.ruleType}" is not supported for project installs on platform "${platform}".`
        );
      }

      platformFiles.push({
        platform,
        files: [{ path: bundlePath, content }],
      });
    }

    return {
      name: inputs.name,
      config,
      platformFiles,
    };
  }

  // Directory quick publish - use collectPlatformFiles logic
  const loadedConfig = {
    configPath: `${inputs.source.path}/agentrules.json`, // Virtual path
    config: {
      ...config,
      platforms: inputs.platforms.map((platform) => ({ platform })),
    },
    configDir: inputs.source.path,
  };

  const platformFiles = await collectPlatformFiles(loadedConfig);

  return {
    name: inputs.name,
    config,
    platformFiles,
  };
}

async function finalizePublish(options: {
  publishInput: RulePublishInput;
  dryRun: boolean;
  version: number | undefined;
  spinner: {
    update: (message: string) => void;
    fail: (message: string) => void;
    success: (message: string) => void;
  };
  ctx: ReturnType<typeof useAppContext>;
}): Promise<PublishResult> {
  const { publishInput, dryRun, version, spinner, ctx } = options;

  // Calculate sizes for validation and display
  const totalFileCount = publishInput.variants.reduce(
    (sum, v) => sum + v.files.length,
    0
  );
  const platformList = publishInput.variants.map((v) => v.platform).join(", ");

  // Validate each variant's size individually
  let totalSize = 0;
  for (const variant of publishInput.variants) {
    const variantJson = JSON.stringify(variant);
    const variantSize = Buffer.byteLength(variantJson, "utf8");
    totalSize += variantSize;

    log.debug(
      `Variant ${variant.platform}: ${formatBytes(variantSize)}, ${
        variant.files.length
      } files`
    );

    if (variantSize > MAX_VARIANT_SIZE_BYTES) {
      const errorMessage = `Files for "${
        variant.platform
      }" exceed maximum size (${formatBytes(variantSize)} > ${formatBytes(
        MAX_VARIANT_SIZE_BYTES
      )})`;
      spinner.fail("Platform bundle too large");
      log.error(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  log.debug(
    `Total publish size: ${formatBytes(
      totalSize
    )}, files: ${totalFileCount}, platforms: ${platformList}`
  );

  // Dry run: show preview and exit
  if (dryRun) {
    spinner.success("Dry run complete");
    log.print("");
    log.print(ui.header("Publish Preview"));
    log.print(ui.keyValue("Rule", publishInput.title));
    log.print(ui.keyValue("Name", publishInput.name));
    log.print(ui.keyValue("Platforms", platformList));
    log.print(
      ui.keyValue(
        "Version",
        version ? `${version}.x (auto-assigned minor)` : "1.x (auto-assigned)"
      )
    );
    log.print(
      ui.keyValue(
        "Files",
        `${totalFileCount} file${totalFileCount === 1 ? "" : "s"}`
      )
    );
    log.print(ui.keyValue("Size", formatBytes(totalSize)));
    log.print("");

    // Show files for each platform variant
    for (const variant of publishInput.variants) {
      log.print(
        ui.fileTree(variant.files, {
          showFolderSizes: true,
          header: `Files for ${variant.platform}`,
        })
      );
      log.print("");
    }

    log.print(ui.hint("Run without --dry-run to publish."));

    return {
      success: true,
      preview: {
        slug: publishInput.name,
        platforms: publishInput.variants.map((v) => v.platform),
        title: publishInput.title,
        totalSize,
        fileCount: totalFileCount,
      },
    };
  }

  // Publish to the API
  spinner.update(`Publishing ${publishInput.title} (${platformList})...`);

  // At this point we know credentials exist (checked earlier, and dry-run exits before here)
  if (!ctx.credentials) {
    throw new Error("Credentials should exist at this point");
  }

  const result = await publishRule(
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
  const action = data.isNew ? "Published new rule" : "Published";
  const publishedPlatforms = data.variants.map((v) => v.platform).join(", ");
  spinner.success(
    `${action} ${ui.code(data.slug)} ${ui.version(
      data.version
    )} (${publishedPlatforms})`
  );

  // Show published files for each platform
  log.print("");
  for (const variant of publishInput.variants) {
    log.print(
      ui.fileTree(variant.files, {
        showFolderSizes: true,
        header: `Published files for ${variant.platform}`,
      })
    );
    log.print("");
  }

  // Show registry page URL
  log.info("");
  log.info(ui.keyValue("Now live at", ui.link(data.url)));

  return {
    success: true,
    rule: {
      slug: data.slug,
      title: data.title,
      version: data.version,
      isNew: data.isNew,
      variants: data.variants,
      url: data.url,
    },
  };
}
