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
  name: "test-preset",
  title: "Test Preset",
  description: "A test preset",
  license: "MIT",
  platforms: [{ platform: "opencode", path: "files" }],
  tags: ["test"],
};

/**
 * Creates a standalone preset: config at preset root, files in subdir
 */
async function createPreset(
  name: string,
  config: object,
  files: Record<string, string>
) {
  const presetDir = join(inputDir, name);
  const filesDir = join(presetDir, "files");
  await mkdir(filesDir, { recursive: true });
  await writeFile(join(presetDir, "agentrules.json"), JSON.stringify(config));

  for (const [filePath, contents] of Object.entries(files)) {
    const fullPath = join(filesDir, filePath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, contents);
  }
}

/**
 * Creates an in-project preset: config inside platform dir, files as siblings
 */
async function createInProjectPreset(
  name: string,
  config: object,
  files: Record<string, string>
) {
  // Use platform dir name as the preset directory name
  const platformDir = join(inputDir, name);
  await mkdir(platformDir, { recursive: true });

  // Config without path field (not needed for in-project)
  const { path: _path, ...configWithoutPath } = config as Record<
    string,
    unknown
  >;
  await writeFile(
    join(platformDir, "agentrules.json"),
    JSON.stringify(configWithoutPath)
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
    inputDir = join(testDir, "presets");
    outputDir = join(testDir, "output");
    await mkdir(inputDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("builds registry from presets", async () => {
    await createPreset("test-preset", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
      "config.json": '{"key": "value"}',
    });

    const result = await buildRegistry({
      input: inputDir,
      out: outputDir,
    });

    expect(result.presets).toBe(1);
    expect(result.items).toBe(1);
    expect(result.bundles).toBe(1);
    expect(result.outputDir).toBe(outputDir);

    // Check bundle file exists (now versioned)
    const bundleContent = await readFile(
      join(
        outputDir,
        `${STATIC_BUNDLE_DIR}/test-preset/opencode/${LATEST_VERSION}`
      ),
      "utf8"
    );
    const bundle = JSON.parse(bundleContent);
    expect(bundle.files).toHaveLength(2);

    // Check API item file exists (one file per slug with all versions/variants)
    const apiItemContent = await readFile(
      join(outputDir, API_ENDPOINTS.items.get("test-preset")),
      "utf8"
    );
    const apiItem = JSON.parse(apiItemContent);
    expect(apiItem.slug).toBe("test-preset");
    expect(apiItem.kind).toBe("preset");
    expect(apiItem.versions).toHaveLength(1);
    expect(apiItem.versions[0].variants).toHaveLength(1);
    // bundleUrl is on the variant
    expect(apiItem.versions[0].variants[0].bundleUrl).toBe(
      `${STATIC_BUNDLE_DIR}/test-preset/opencode/1.0`
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
    expect(registry.items).toHaveLength(1);
    expect(registry.items[0].slug).toBe("test-preset");
  });

  it("validates without writing when --validate-only", async () => {
    await createPreset("test-preset", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    const result = await buildRegistry({
      input: inputDir,
      validateOnly: true,
    });

    expect(result.validateOnly).toBeTrue();
    expect(result.outputDir).toBeNull();
    expect(result.presets).toBe(1);
  });

  it("returns counts without writing when no output specified", async () => {
    await createPreset("test-preset", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    const result = await buildRegistry({
      input: inputDir,
    });

    expect(result.outputDir).toBeNull();
    expect(result.presets).toBe(1);
  });

  it("throws for empty input directory", async () => {
    await expect(
      buildRegistry({
        input: inputDir,
      })
    ).rejects.toThrow(/No presets found/);
  });

  it("throws for missing files directory", async () => {
    const presetDir = join(inputDir, "bad-preset");
    await mkdir(presetDir, { recursive: true });
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify({ ...VALID_CONFIG, name: "bad-preset" })
    );
    // Don't create files directory

    await expect(
      buildRegistry({
        input: inputDir,
      })
    ).rejects.toThrow(/Files directory not found/);
  });

  it("writes compact JSON when --compact", async () => {
    await createPreset("test-preset", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    await buildRegistry({
      input: inputDir,
      out: outputDir,
      compact: true,
    });

    const content = await readFile(
      join(outputDir, API_ENDPOINTS.items.get("test-preset")),
      "utf8"
    );
    expect(content).not.toContain("\n  ");
  });

  it("uses custom bundle base for relative path", async () => {
    await createPreset("test-preset", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    await buildRegistry({
      input: inputDir,
      out: outputDir,
      bundleBase: "my-registry",
    });

    const content = await readFile(
      join(outputDir, API_ENDPOINTS.items.get("test-preset")),
      "utf8"
    );
    const item = JSON.parse(content);
    // bundleBase + STATIC_BUNDLE_DIR + slug/platform/version
    expect(item.versions[0].variants[0].bundleUrl).toBe(
      `my-registry/${STATIC_BUNDLE_DIR}/test-preset/opencode/1.0`
    );
  });

  it("uses custom bundle base for absolute URL", async () => {
    await createPreset("test-preset", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    await buildRegistry({
      input: inputDir,
      out: outputDir,
      bundleBase: "https://cdn.example.com/bundles",
    });

    const content = await readFile(
      join(outputDir, API_ENDPOINTS.items.get("test-preset")),
      "utf8"
    );
    const item = JSON.parse(content);
    // bundleBase + STATIC_BUNDLE_DIR + slug/platform/version
    expect(item.versions[0].variants[0].bundleUrl).toBe(
      `https://cdn.example.com/bundles/${STATIC_BUNDLE_DIR}/test-preset/opencode/1.0`
    );
  });

  it("handles multiple presets", async () => {
    await createPreset(
      "preset-a",
      { ...VALID_CONFIG, name: "preset-a" },
      {
        "rules.md": "# A",
      }
    );
    await createPreset(
      "preset-b",
      { ...VALID_CONFIG, name: "preset-b" },
      {
        "rules.md": "# B",
      }
    );

    const result = await buildRegistry({
      input: inputDir,
      out: outputDir,
    });

    expect(result.presets).toBe(2);
    expect(result.items).toBe(2);

    // Verify registry.json contains all presets
    const registryContent = await readFile(
      join(outputDir, "registry.json"),
      "utf8"
    );
    const registry = JSON.parse(registryContent);
    expect(registry.items).toHaveLength(2);
  });

  describe("README.md support", () => {
    it("includes README.md in bundle as readmeContent", async () => {
      await createPreset("test-preset", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      // Add README.md in .agentrules/ metadata directory
      const presetDir = join(inputDir, "test-preset");
      const metadataDir = join(presetDir, ".agentrules");
      await mkdir(metadataDir, { recursive: true });
      await writeFile(
        join(metadataDir, "README.md"),
        "# Test Preset\n\nThis is a great preset!"
      );

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/test-preset/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.readmeContent).toBe(
        "# Test Preset\n\nThis is a great preset!"
      );
    });

    it("omits readmeContent in bundle when no README.md", async () => {
      await createPreset("test-preset", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/test-preset/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.readmeContent).toBeUndefined();
    });
  });

  describe("INSTALL.txt support", () => {
    it("uses preset-level INSTALL.txt as default", async () => {
      await createPreset("test-preset", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      // Add INSTALL.txt in .agentrules/ metadata directory
      const presetDir = join(inputDir, "test-preset");
      const metadataDir = join(presetDir, ".agentrules");
      await mkdir(metadataDir, { recursive: true });
      await writeFile(
        join(metadataDir, "INSTALL.txt"),
        "Welcome to the preset!\n\nEnjoy!"
      );

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/test-preset/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.installMessage).toBe("Welcome to the preset!\n\nEnjoy!");
    });

    it("no installMessage when no INSTALL.txt", async () => {
      await createPreset("test-preset", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/test-preset/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.installMessage).toBeUndefined();
    });
  });

  describe("in-project preset (config inside platform dir)", () => {
    it("builds when config is inside platform directory", async () => {
      // Use .opencode as the preset dir name (platform dir)
      await createInProjectPreset(
        ".opencode",
        { ...VALID_CONFIG, name: "in-project-preset" },
        { "AGENT_RULES.md": "# Rules\n" }
      );

      const result = await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      expect(result.presets).toBe(1);
      expect(result.bundles).toBe(1);

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/in-project-preset/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.files).toHaveLength(1);
      expect(bundle.files[0].path).toBe("AGENT_RULES.md");
    });

    it("reads metadata from .agentrules/ subdirectory", async () => {
      await createInProjectPreset(
        ".opencode",
        { ...VALID_CONFIG, name: "metadata-preset" },
        { "AGENT_RULES.md": "# Rules\n" }
      );

      // Add .agentrules/ metadata folder
      const metadataDir = join(inputDir, ".opencode", ".agentrules");
      await mkdir(metadataDir, { recursive: true });
      await writeFile(join(metadataDir, "README.md"), "# In-project README");
      await writeFile(join(metadataDir, "INSTALL.txt"), "Install instructions");

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(
          outputDir,
          `${STATIC_BUNDLE_DIR}/metadata-preset/opencode/${LATEST_VERSION}`
        ),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.readmeContent).toBe("# In-project README");
      expect(bundle.installMessage).toBe("Install instructions");
    });

    it("excludes config and .agentrules/ from bundle files", async () => {
      await createInProjectPreset(
        ".opencode",
        { ...VALID_CONFIG, name: "exclude-test" },
        { "AGENT_RULES.md": "# Rules\n" }
      );

      // Add .agentrules/ metadata folder with files
      const metadataDir = join(inputDir, ".opencode", ".agentrules");
      await mkdir(metadataDir, { recursive: true });
      await writeFile(join(metadataDir, "README.md"), "# README");

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

      expect(filePaths).toContain("AGENT_RULES.md");
      expect(filePaths).not.toContain("agentrules.json");
      expect(
        filePaths.some((p: string) => p.startsWith(".agentrules/"))
      ).toBeFalse();
    });
  });
});
