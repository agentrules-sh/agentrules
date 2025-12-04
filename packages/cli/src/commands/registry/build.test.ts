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
  platform: "opencode",
  path: "files",
};

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
    expect(result.entries).toBe(1);
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

    // Check API entry exists (now versioned)
    const apiEntryContent = await readFile(
      join(outputDir, API_ENDPOINTS.presets.entry("test-preset", "opencode")),
      "utf8"
    );
    const apiEntry = JSON.parse(apiEntryContent);
    expect(apiEntry.slug).toBe("test-preset");
    // bundleUrl now includes version
    expect(apiEntry.bundleUrl).toBe(
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

    // Check registry.index.json exists with name → entry mapping
    const indexContent = await readFile(
      join(outputDir, "registry.index.json"),
      "utf8"
    );
    const index = JSON.parse(indexContent);
    expect(index["test-preset.opencode"]).toBeDefined();
    expect(index["test-preset.opencode"].slug).toBe("test-preset");
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
      join(outputDir, API_ENDPOINTS.presets.entry("test-preset", "opencode")),
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
      join(outputDir, API_ENDPOINTS.presets.entry("test-preset", "opencode")),
      "utf8"
    );
    const entry = JSON.parse(content);
    // bundleBase + STATIC_BUNDLE_DIR + slug/platform/version
    expect(entry.bundleUrl).toBe(
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
      join(outputDir, API_ENDPOINTS.presets.entry("test-preset", "opencode")),
      "utf8"
    );
    const entry = JSON.parse(content);
    // bundleBase + STATIC_BUNDLE_DIR + slug/platform/version
    expect(entry.bundleUrl).toBe(
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
    expect(result.entries).toBe(2);

    // Verify registry.json contains all presets
    const registryContent = await readFile(
      join(outputDir, "registry.json"),
      "utf8"
    );
    const registry = JSON.parse(registryContent);
    expect(registry.items).toHaveLength(2);

    // Verify registry.index.json contains all presets
    const indexContent = await readFile(
      join(outputDir, "registry.index.json"),
      "utf8"
    );
    const index = JSON.parse(indexContent);
    expect(index["preset-a.opencode"]).toBeDefined();
    expect(index["preset-b.opencode"]).toBeDefined();
  });

  describe("README.md support", () => {
    it("includes README.md in bundle as readmeContent", async () => {
      await createPreset("test-preset", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      // Add README.md at preset root
      const presetDir = join(inputDir, "test-preset");
      await writeFile(
        join(presetDir, "README.md"),
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

      // Add preset-level INSTALL.txt
      const presetDir = join(inputDir, "test-preset");
      await writeFile(
        join(presetDir, "INSTALL.txt"),
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
});
