import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  API_ENDPOINTS,
  LATEST_VERSION,
  STATIC_BUNDLE_DIR,
} from "@agentrules/core";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { buildRegistry } from "./build";

let testDir: string;
let inputDir: string;
let outputDir: string;

// Version is optional in source config - defaults to major 1, minor 0
const VALID_CONFIG = {
  name: "test-rule",
  type: "instruction",
  title: "Test Rule",
  description: "A test rule",
  license: "MIT",
  platforms: ["opencode"],
  tags: ["test"],
};

/**
 * Creates a standalone rule: config at rule root, files in subdir
 */
async function createRule(
  name: string,
  config: object,
  files: Record<string, string>
) {
  const ruleDir = join(inputDir, name);
  await mkdir(ruleDir, { recursive: true });
  await writeFile(join(ruleDir, "agentrules.json"), JSON.stringify(config));

  for (const [filePath, contents] of Object.entries(files)) {
    const fullPath = join(ruleDir, filePath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, contents);
  }
}

/**
 * Creates an in-project rule: config inside platform dir, files as siblings
 */
async function createInProjectRule(
  name: string,
  config: object,
  files: Record<string, string>
) {
  // Use platform dir name as the rule directory name
  const platformDir = join(inputDir, name);
  await mkdir(platformDir, { recursive: true });

  await writeFile(
    join(platformDir, "agentrules.json"),
    JSON.stringify({
      ...(config as Record<string, unknown>),
      platforms: ["opencode"],
    })
  );

  // Files are siblings of config
  for (const [filePath, contents] of Object.entries(files)) {
    const fullPath = join(platformDir, filePath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, contents);
  }
}

describe("buildRegistry", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-build-"));
    inputDir = join(testDir, "rules");
    outputDir = join(testDir, "output");
    await mkdir(inputDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("builds registry from rules", async () => {
    await createRule("test-rule", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
      "config.json": '{"key": "value"}',
    });

    const result = await buildRegistry({
      input: inputDir,
      out: outputDir,
    });

    expect(result.ruleInputs).toBe(1);
    expect(result.rules).toBe(1);
    expect(result.bundles).toBe(1);
    expect(result.outputDir).toBe(outputDir);

    // Check bundle file exists (now versioned)
    const bundleContent = await readFile(
      join(
        outputDir,
        `${STATIC_BUNDLE_DIR}/test-rule/opencode/${LATEST_VERSION}`
      ),
      "utf8"
    );
    const bundle = JSON.parse(bundleContent);
    expect(bundle.files).toHaveLength(2);

    // Check API rule file exists (one file per slug with all versions/variants)
    const apiRuleContent = await readFile(
      join(outputDir, API_ENDPOINTS.rules.get("test-rule")),
      "utf8"
    );
    const apiRule = JSON.parse(apiRuleContent);
    expect(apiRule.slug).toBe("test-rule");
    expect(apiRule.versions).toHaveLength(1);
    expect(apiRule.versions[0].variants).toHaveLength(1);
    // bundleUrl is on the variant
    expect(apiRule.versions[0].variants[0].bundleUrl).toBe(
      `${STATIC_BUNDLE_DIR}/test-rule/opencode/1.0`
    );

    // Check registry.json exists with schema and items array
    const registryContent = await readFile(
      join(outputDir, "registry.json"),
      "utf8"
    );
    const registry = JSON.parse(registryContent);
    expect(registry.$schema).toBe(
      "https://agentrules.directory/schema/registry.json"
    );
    expect(registry.rules).toHaveLength(1);
    expect(registry.rules[0].slug).toBe("test-rule");
  });

  it("validates without writing when --validate-only", async () => {
    await createRule("test-rule", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    const result = await buildRegistry({
      input: inputDir,
      validateOnly: true,
    });

    expect(result.validateOnly).toBeTrue();
    expect(result.outputDir).toBeNull();
    expect(result.rules).toBe(1);
  });

  it("returns counts without writing when no output specified", async () => {
    await createRule("test-rule", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    const result = await buildRegistry({
      input: inputDir,
    });

    expect(result.outputDir).toBeNull();
    expect(result.rules).toBe(1);
  });

  it("throws for empty input directory", async () => {
    await expect(
      buildRegistry({
        input: inputDir,
      })
    ).rejects.toThrow(/No rules found/);
  });

  it("throws for missing files directory", async () => {
    const ruleDir = join(inputDir, "bad-rule");
    await mkdir(ruleDir, { recursive: true });
    await writeFile(
      join(ruleDir, "agentrules.json"),
      JSON.stringify({
        ...VALID_CONFIG,
        name: "bad-rule",
        platforms: [{ platform: "opencode", path: "missing-files" }],
      })
    );
    // Don't create missing-files directory

    await expect(
      buildRegistry({
        input: inputDir,
      })
    ).rejects.toThrow(/Files directory not found/);
  });

  it("writes compact JSON when --compact", async () => {
    await createRule("test-rule", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    await buildRegistry({
      input: inputDir,
      out: outputDir,
      compact: true,
    });

    const content = await readFile(
      join(outputDir, API_ENDPOINTS.rules.get("test-rule")),
      "utf8"
    );
    expect(content).not.toContain("\n  ");
  });

  it("uses custom bundle base for relative path", async () => {
    await createRule("test-rule", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    await buildRegistry({
      input: inputDir,
      out: outputDir,
      bundleBase: "my-registry",
    });

    const content = await readFile(
      join(outputDir, API_ENDPOINTS.rules.get("test-rule")),
      "utf8"
    );
    const item = JSON.parse(content);
    // bundleBase + STATIC_BUNDLE_DIR + slug/platform/version
    expect(item.versions[0].variants[0].bundleUrl).toBe(
      `my-registry/${STATIC_BUNDLE_DIR}/test-rule/opencode/1.0`
    );
  });

  it("uses custom bundle base for absolute URL", async () => {
    await createRule("test-rule", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    await buildRegistry({
      input: inputDir,
      out: outputDir,
      bundleBase: "https://cdn.example.com/bundles",
    });

    const content = await readFile(
      join(outputDir, API_ENDPOINTS.rules.get("test-rule")),
      "utf8"
    );
    const item = JSON.parse(content);
    // bundleBase + STATIC_BUNDLE_DIR + slug/platform/version
    expect(item.versions[0].variants[0].bundleUrl).toBe(
      `https://cdn.example.com/bundles/${STATIC_BUNDLE_DIR}/test-rule/opencode/1.0`
    );
  });

  it("handles multiple rules", async () => {
    await createRule(
      "rule-a",
      { ...VALID_CONFIG, name: "rule-a" },
      {
        "rules.md": "# A",
      }
    );
    await createRule(
      "rule-b",
      { ...VALID_CONFIG, name: "rule-b" },
      {
        "rules.md": "# B",
      }
    );

    const result = await buildRegistry({
      input: inputDir,
      out: outputDir,
    });

    expect(result.ruleInputs).toBe(2);
    expect(result.rules).toBe(2);

    // Verify registry.json contains all rules
    const registryContent = await readFile(
      join(outputDir, "registry.json"),
      "utf8"
    );
    const registry = JSON.parse(registryContent);
    expect(registry.rules).toHaveLength(2);
  });

  describe("README.md support", () => {
    it("includes README.md in bundle as readmeContent", async () => {
      await createRule("test-rule", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      const ruleDir = join(inputDir, "test-rule");
      await writeFile(
        join(ruleDir, "README.md"),
        "# Test Rule\n\nThis is a great rule!"
      );

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/test-rule/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.readmeContent).toBe("# Test Rule\n\nThis is a great rule!");
    });

    it("omits readmeContent in bundle when no README.md", async () => {
      await createRule("test-rule", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/test-rule/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.readmeContent).toBeUndefined();
    });
  });

  describe("INSTALL.txt support", () => {
    it("uses rule-level INSTALL.txt as default", async () => {
      await createRule("test-rule", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      const ruleDir = join(inputDir, "test-rule");
      await writeFile(
        join(ruleDir, "INSTALL.txt"),
        "Welcome to the rule!\n\nEnjoy!"
      );

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/test-rule/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.installMessage).toBe("Welcome to the rule!\n\nEnjoy!");
    });

    it("no installMessage when no INSTALL.txt", async () => {
      await createRule("test-rule", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/test-rule/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.installMessage).toBeUndefined();
    });
  });

  describe("in-project rule (config inside platform dir)", () => {
    it("builds when config is inside platform directory", async () => {
      // Use .opencode as the rule dir name (platform dir)
      await createInProjectRule(
        ".opencode",
        { ...VALID_CONFIG, name: "in-project-rule" },
        { "AGENT_RULES.md": "# Rules\n" }
      );

      const result = await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      expect(result.rules).toBe(1);
      expect(result.bundles).toBe(1);

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/in-project-rule/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.files).toHaveLength(1);
      expect(bundle.files[0].path).toBe(".opencode/AGENT_RULES.md");
    });

    it("reads metadata from rule root", async () => {
      await createInProjectRule(
        ".opencode",
        { ...VALID_CONFIG, name: "metadata-rule" },
        { "AGENT_RULES.md": "# Rules\n" }
      );

      const platformDir = join(inputDir, ".opencode");
      await writeFile(join(platformDir, "README.md"), "# In-project README");
      await writeFile(join(platformDir, "INSTALL.txt"), "Install instructions");

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/metadata-rule/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.readmeContent).toBe("# In-project README");
      expect(bundle.installMessage).toBe("Install instructions");
    });

    it("excludes config and metadata files from bundle files", async () => {
      await createInProjectRule(
        ".opencode",
        { ...VALID_CONFIG, name: "exclude-test" },
        { "AGENT_RULES.md": "# Rules\n" }
      );

      const platformDir = join(inputDir, ".opencode");
      await writeFile(join(platformDir, "README.md"), "# README");
      await writeFile(join(platformDir, "LICENSE.md"), "MIT");
      await writeFile(join(platformDir, "INSTALL.txt"), "Install");

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/exclude-test/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      const filePaths = bundle.files.map((f: { path: string }) => f.path);

      expect(filePaths).toContain(".opencode/AGENT_RULES.md");
      expect(
        filePaths.some((p: string) => p.includes("agentrules.json"))
      ).toBeFalse();
      expect(
        filePaths.some((p: string) => p.includes("README.md"))
      ).toBeFalse();
      expect(
        filePaths.some((p: string) => p.includes("LICENSE.md"))
      ).toBeFalse();
      expect(
        filePaths.some((p: string) => p.includes("INSTALL.txt"))
      ).toBeFalse();
    });
  });
});
