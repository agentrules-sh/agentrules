import {
  getPlatformFromDir,
  isSupportedPlatform,
  PLATFORM_IDS,
  type PlatformId,
  type RawRuleConfig,
  RULE_CONFIG_FILENAME,
  RULE_SCHEMA_URL,
  type RuleType,
} from "@agentrules/core";
import { mkdir, writeFile } from "fs/promises";
import { basename, join } from "path";
import { directoryExists, fileExists } from "@/lib/fs";
import { log } from "@/lib/log";
import { normalizeName, toTitleCase } from "@/lib/rule-utils";

export type InitOptions = {
  /** Directory to write agentrules.json (defaults to cwd) */
  directory?: string;
  name?: string;
  title?: string;
  description?: string;
  /**
   * Target platforms (at least one required).
   * Accepts strings or per-platform entries with an optional source path.
   */
  platforms?: Array<string | { platform: string; path?: string }>;
  license?: string;
  tags?: string[];
  /** Rule type (optional; when omitted, type is not set) */
  type?: string;
  force?: boolean;
};

export type InitResult = {
  configPath: string;
  rule: RawRuleConfig;
  createdDir?: string;
};

/** Default rule name when none specified */
const DEFAULT_RULE_NAME = "my-rule";

/**
 * Initialize a rule in a directory (rule root).
 *
 * Structure:
 * - ruleDir/agentrules.json - rule config
 * - ruleDir/* - rule files (collected by default)
 * - ruleDir/README.md, ruleDir/LICENSE.md, ruleDir/INSTALL.txt - optional metadata (not bundled)
 */
export async function initRule(options: InitOptions): Promise<InitResult> {
  const ruleDir = options.directory ?? process.cwd();

  log.debug(`Initializing rule in: ${ruleDir}`);

  // Infer platform from directory name if not provided
  const inferredPlatform = getPlatformFromDir(basename(ruleDir));
  const platformInputs: Array<string | { platform: string; path?: string }> =
    options.platforms ?? (inferredPlatform ? [inferredPlatform] : []);

  if (platformInputs.length === 0) {
    throw new Error(
      `Cannot determine platform. Specify --platform (${PLATFORM_IDS.join(", ")}).`
    );
  }

  const platforms = platformInputs.map(normalizePlatformEntryInput);

  // Validate/normalize inputs
  const name = normalizeName(options.name ?? DEFAULT_RULE_NAME);
  const title = options.title ?? toTitleCase(name);
  const description = options.description ?? "";
  const license = options.license ?? "MIT";

  const platformLabels = platforms
    .map((p) => (typeof p === "string" ? p : p.platform))
    .join(", ");

  log.debug(`Rule name: ${name}, platforms: ${platformLabels}`);

  const configPath = join(ruleDir, RULE_CONFIG_FILENAME);

  // Check if config already exists
  if (!options.force && (await fileExists(configPath))) {
    throw new Error(
      `${RULE_CONFIG_FILENAME} already exists. Use --force to overwrite.`
    );
  }

  const config: RawRuleConfig = {
    $schema: RULE_SCHEMA_URL,
    name,
    ...(options.type && { type: options.type as RuleType }),
    title,
    version: 1,
    description,
    tags: options.tags ?? [],
    license,
    platforms,
  };

  // Create rule directory if needed
  let createdDir: string | undefined;
  if (await directoryExists(ruleDir)) {
    log.debug(`Directory exists: ${ruleDir}`);
  } else {
    await mkdir(ruleDir, { recursive: true });
    createdDir = ruleDir;
    log.debug(`Created directory: ${ruleDir}`);
  }

  // Write config
  const content = `${JSON.stringify(config, null, 2)}\n`;
  await writeFile(configPath, content, "utf8");
  log.debug(`Wrote config file: ${configPath}`);

  log.debug("Rule initialization complete.");
  return { configPath, rule: config, createdDir };
}

type PlatformEntryInput = string | { platform: string; path?: string };

function normalizePlatform(input: string): PlatformId {
  const normalized = input.toLowerCase();
  if (!isSupportedPlatform(normalized)) {
    throw new Error(
      `Unknown platform "${input}". Supported: ${PLATFORM_IDS.join(", ")}`
    );
  }
  return normalized;
}

function normalizePlatformEntryInput(
  input: PlatformEntryInput
): PlatformId | { platform: PlatformId; path: string } {
  if (typeof input === "string") {
    return normalizePlatform(input);
  }

  const platform = normalizePlatform(input.platform);
  const path = typeof input.path === "string" ? input.path.trim() : "";

  if (path.length === 0 || path === ".") {
    return platform;
  }

  return { platform, path };
}
