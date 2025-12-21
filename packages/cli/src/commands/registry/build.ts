import {
  API_ENDPOINTS,
  buildRegistry as buildRegistryCore,
  LATEST_VERSION,
  RULE_CONFIG_FILENAME,
  type RuleInput,
  STATIC_BUNDLE_DIR,
} from "@agentrules/core";
import { mkdir, readdir, writeFile } from "fs/promises";
import { basename, join } from "path";
import { fileExists } from "@/lib/fs";
import { log } from "@/lib/log";
import { loadRule } from "@/lib/rule-utils";

export type BuildOptions = {
  input: string;
  out?: string;
  bundleBase?: string;
  compact?: boolean;
  validateOnly?: boolean;
};

export type BuildResult = {
  /** Number of rule directories found */
  ruleInputs: number;
  /** Number of resolved rules in output */
  rules: number;
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

  log.debug(`Discovering rules in ${inputDir}`);
  const ruleDirs = await discoverRuleDirs(inputDir);

  if (ruleDirs.length === 0) {
    throw new Error(
      `No rules found in "${inputDir}". Each rule needs an ${RULE_CONFIG_FILENAME} file.`
    );
  }

  log.debug(`Found ${ruleDirs.length} rule(s)`);

  const rules: RuleInput[] = [];

  for (const ruleDir of ruleDirs) {
    const slug = basename(ruleDir);
    log.debug(`Loading rule: ${slug}`);
    const rule = await loadRule(ruleDir);
    rules.push(rule);
  }

  const result = await buildRegistryCore({
    rules,
    bundleBase: options.bundleBase,
  });

  if (validateOnly || !outputDir) {
    return {
      ruleInputs: rules.length,
      rules: result.rules.length,
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

  // Write rules to api/rules/{slug} (one file per slug with all versions/variants)
  for (const rule of result.rules) {
    const ruleJson = JSON.stringify(rule, null, indent);

    // Write rule file
    const rulePath = join(outputDir, API_ENDPOINTS.rules.get(rule.slug));
    await mkdir(join(rulePath, ".."), { recursive: true });
    await writeFile(rulePath, ruleJson);
  }

  // Write registry.json
  const registryJson = JSON.stringify(
    {
      $schema: "https://agentrules.directory/schema/registry.json",
      rules: result.rules,
    },
    null,
    indent
  );
  await writeFile(join(outputDir, "registry.json"), registryJson);

  return {
    ruleInputs: rules.length,
    rules: result.rules.length,
    bundles: result.bundles.length,
    outputDir,
    validateOnly: false,
  };
}

async function discoverRuleDirs(inputDir: string): Promise<string[]> {
  const ruleDirs: string[] = [];

  async function searchDir(dir: string, depth: number): Promise<void> {
    if (depth > 3) return; // Limit recursion depth

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const subDir = join(dir, entry.name);
      const configPath = join(subDir, RULE_CONFIG_FILENAME);

      if (await fileExists(configPath)) {
        ruleDirs.push(subDir);
      } else {
        await searchDir(subDir, depth + 1);
      }
    }
  }

  await searchDir(inputDir, 0);
  return ruleDirs.sort();
}
