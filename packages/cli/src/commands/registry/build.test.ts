import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { buildRegistry } from "./build";

let testDir: string;
let inputDir: string;
let outputDir: string;

// Version is now optional in source config - auto-generated at build time
const VALID_CONFIG = {
  name: "test-preset",
  title: "Test Preset",
  description: "A test preset",
  platforms: {
    opencode: {
      path: "opencode/files/.opencode",
    },
  },
};

async function createPreset(
  name: string,
  config: object,
  files: Record<string, string>
) {
  const presetDir = join(inputDir, name);
  const platformDir = join(presetDir, "opencode/files/.opencode");
  await mkdir(platformDir, { recursive: true });
  await writeFile(join(presetDir, "agentrules.json"), JSON.stringify(config));

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
    expect(result.entries).toBe(1);
    expect(result.bundles).toBe(1);
    expect(result.outputDir).toBe(outputDir);
    // Version is auto-generated in YYYY.MM.DD format
    expect(result.version).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);

    // Check output files exist
    const indexContent = await readFile(
      join(outputDir, "registry.index.json"),
      "utf8"
    );
    const index = JSON.parse(indexContent);
    expect(index["test-preset.opencode"]).toBeDefined();

    const registryContent = await readFile(
      join(outputDir, "registry.json"),
      "utf8"
    );
    const entries = JSON.parse(registryContent);
    expect(entries).toHaveLength(1);

    const bundleContent = await readFile(
      join(outputDir, "test-preset/opencode.json"),
      "utf8"
    );
    const bundle = JSON.parse(bundleContent);
    expect(bundle.files).toHaveLength(2);
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

  it("throws for missing platform directory", async () => {
    const presetDir = join(inputDir, "bad-preset");
    await mkdir(presetDir, { recursive: true });
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(VALID_CONFIG)
    );
    // Don't create platform directory

    await expect(
      buildRegistry({
        input: inputDir,
      })
    ).rejects.toThrow(/Platform directory not found/);
  });

  it("uses custom bundle base", async () => {
    await createPreset("test-preset", VALID_CONFIG, {
      "AGENT_RULES.md": "# Rules\n",
    });

    const result = await buildRegistry({
      input: inputDir,
      out: outputDir,
      bundleBase: "/custom/path",
    });

    const indexContent = await readFile(
      join(outputDir, "registry.index.json"),
      "utf8"
    );
    const index = JSON.parse(indexContent);
    // bundlePath now includes version
    expect(index["test-preset.opencode"].bundlePath).toBe(
      `/custom/path/test-preset/opencode.${result.version}.json`
    );
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

    const content = await readFile(join(outputDir, "registry.json"), "utf8");
    expect(content).not.toContain("\n  ");
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
  });

  describe("README.md support", () => {
    it("includes README.md in bundle", async () => {
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
        join(outputDir, "test-preset/opencode.json"),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.readme).toBe("# Test Preset\n\nThis is a great preset!");
    });

    it("sets hasReadme flag in entry", async () => {
      await createPreset("test-preset", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      const presetDir = join(inputDir, "test-preset");
      await writeFile(join(presetDir, "README.md"), "# Docs");

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const indexContent = await readFile(
        join(outputDir, "registry.index.json"),
        "utf8"
      );
      const index = JSON.parse(indexContent);
      expect(index["test-preset.opencode"].hasReadme).toBe(true);
    });

    it("omits readme fields when no README.md", async () => {
      await createPreset("test-preset", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(outputDir, "test-preset/opencode.json"),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.readme).toBeUndefined();

      const indexContent = await readFile(
        join(outputDir, "registry.index.json"),
        "utf8"
      );
      const index = JSON.parse(indexContent);
      expect(index["test-preset.opencode"].hasReadme).toBe(false);
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
        join(outputDir, "test-preset/opencode.json"),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.installMessage).toBe("Welcome to the preset!\n\nEnjoy!");
    });

    it("platform INSTALL.txt overrides preset-level", async () => {
      await createPreset("test-preset", VALID_CONFIG, {
        "AGENT_RULES.md": "# Rules\n",
      });

      const presetDir = join(inputDir, "test-preset");

      // Add preset-level INSTALL.txt
      await writeFile(join(presetDir, "INSTALL.txt"), "Default message");

      // Add platform-level INSTALL.txt (overrides)
      const platformDir = join(presetDir, "opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "INSTALL.txt"),
        "OpenCode specific message!"
      );

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(outputDir, "test-preset/opencode.json"),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.installMessage).toBe("OpenCode specific message!");
    });

    it("JSON installMessage used when no INSTALL.txt", async () => {
      const configWithMessage = {
        ...VALID_CONFIG,
        platforms: {
          opencode: {
            path: "opencode/files/.opencode",
            installMessage: "JSON message here",
          },
        },
      };

      await createPreset("test-preset", configWithMessage, {
        "AGENT_RULES.md": "# Rules\n",
      });

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(outputDir, "test-preset/opencode.json"),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.installMessage).toBe("JSON message here");
    });

    it("INSTALL.txt overrides JSON installMessage", async () => {
      const configWithMessage = {
        ...VALID_CONFIG,
        platforms: {
          opencode: {
            path: "opencode/files/.opencode",
            installMessage: "JSON message (should be overridden)",
          },
        },
      };

      await createPreset("test-preset", configWithMessage, {
        "AGENT_RULES.md": "# Rules\n",
      });

      // Add preset-level INSTALL.txt
      const presetDir = join(inputDir, "test-preset");
      await writeFile(join(presetDir, "INSTALL.txt"), "INSTALL.txt wins!");

      await buildRegistry({
        input: inputDir,
        out: outputDir,
      });

      const bundleContent = await readFile(
        join(outputDir, "test-preset/opencode.json"),
        "utf8"
      );
      const bundle = JSON.parse(bundleContent);
      expect(bundle.installMessage).toBe("INSTALL.txt wins!");
    });
  });
});
