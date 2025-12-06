import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { validatePreset } from "./validate";

let testDir: string;

const VALID_CONFIG = {
  $schema: "https://agentrules.directory/schema/agentrules.json",
  name: "test-preset",
  title: "Test Preset",
  description: "A test preset",
  license: "MIT",
  tags: ["test"],
  platform: "opencode",
  path: "files",
};

describe("validatePreset", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "cli-validate-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("validates a correct preset", async () => {
    const presetDir = join(testDir, "test-preset");
    await mkdir(presetDir, { recursive: true });
    await mkdir(join(presetDir, "files"), { recursive: true });
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(VALID_CONFIG)
    );

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
    expect(result.preset?.name).toBe("test-preset");
  });

  it("reports error for missing config file", async () => {
    const result = await validatePreset({
      path: join(testDir, "nonexistent"),
    });

    expect(result.valid).toBeFalse();
    expect(result.errors[0]).toContain("not found");
  });

  it("reports error for invalid JSON", async () => {
    const presetDir = join(testDir, "bad-json");
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, "agentrules.json"), "{ invalid json }");

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeFalse();
    expect(result.errors[0]).toContain("Invalid JSON");
  });

  it("reports error for missing required fields", async () => {
    const presetDir = join(testDir, "missing-fields");
    await mkdir(presetDir, { recursive: true });
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify({ name: "test" })
    );

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeFalse();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports error for missing files directory", async () => {
    const presetDir = join(testDir, "missing-files-dir");
    await mkdir(presetDir, { recursive: true });
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(VALID_CONFIG)
    );
    // Don't create the files directory

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeFalse();
    expect(result.errors.some((e) => e.includes("not found"))).toBeTrue();
  });

  it("requires at least one tag", async () => {
    const presetDir = join(testDir, "no-tags");
    await mkdir(presetDir, { recursive: true });
    await mkdir(join(presetDir, "files"), { recursive: true });

    const configWithoutTags = {
      name: "no-tags",
      title: "No Tags",
      description: "Missing tags",
      license: "MIT",
      platform: "opencode",
      path: "files",
    };
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(configWithoutTags)
    );

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeFalse();
    expect(result.errors.some((e) => e.includes("tag"))).toBeTrue();
  });

  it("reports error for missing license", async () => {
    const presetDir = join(testDir, "no-license");
    await mkdir(presetDir, { recursive: true });
    await mkdir(join(presetDir, "files"), { recursive: true });

    const configWithoutLicense = {
      name: "no-license",
      title: "No License",
      description: "Missing license",
      platform: "opencode",
      path: "files",
    };
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(configWithoutLicense)
    );

    const result = await validatePreset({ path: presetDir });

    expect(result.valid).toBeFalse();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts direct path to agentrules.json", async () => {
    const presetDir = join(testDir, "direct-path");
    await mkdir(presetDir, { recursive: true });
    await mkdir(join(presetDir, "files"), { recursive: true });
    await writeFile(
      join(presetDir, "agentrules.json"),
      JSON.stringify(VALID_CONFIG)
    );

    const result = await validatePreset({
      path: join(presetDir, "agentrules.json"),
    });

    expect(result.valid).toBeTrue();
  });

  describe("in-project preset (config inside platform dir)", () => {
    const IN_PROJECT_CONFIG = {
      $schema: "https://agentrules.directory/schema/agentrules.json",
      name: "test-preset",
      title: "Test Preset",
      description: "A test preset",
      license: "MIT",
      tags: ["test"],
      platform: "opencode",
      // No path field needed - files are siblings
    };

    it("validates when config is inside platform directory", async () => {
      // Config inside .opencode/ directory
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify(IN_PROJECT_CONFIG)
      );

      const result = await validatePreset({ path: platformDir });

      expect(result.valid).toBeTrue();
      expect(result.preset?.name).toBe("test-preset");
    });

    it("validates .claude directory", async () => {
      const platformDir = join(testDir, ".claude");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify({ ...IN_PROJECT_CONFIG, platform: "claude" })
      );

      const result = await validatePreset({ path: platformDir });

      expect(result.valid).toBeTrue();
    });

    it("does not require files directory for in-project preset", async () => {
      // In-project mode doesn't need a separate files directory
      const platformDir = join(testDir, ".opencode");
      await mkdir(platformDir, { recursive: true });
      await writeFile(
        join(platformDir, "agentrules.json"),
        JSON.stringify(IN_PROJECT_CONFIG)
      );
      // No files directory created - that's fine for in-project

      const result = await validatePreset({ path: platformDir });

      expect(result.valid).toBeTrue();
    });
  });
});
